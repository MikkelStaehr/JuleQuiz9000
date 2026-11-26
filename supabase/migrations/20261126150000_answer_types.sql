-- Generic answer-type model: "draw" (canvas → PNG), "geo" (pin on a map), "true-false" (two buttons, optional wager).
-- Existing answers/games are test data and are cleared.

-- ───────────── remove the old drawing-only objects ─────────────
drop policy if exists "teams insert own answer" on public.answers;
drop policy if exists "teams upload own answer image" on storage.objects;
drop function if exists public.can_submit_answer(text);

update public.games set active = false;   -- start a fresh game after this migration
delete from public.answers;

-- ───────────── answers: (game_id, team_id, question_key, value jsonb, wager, judgment, submitted_at) ─────────────
alter table public.answers
  drop column if exists image_path,
  drop column if exists scale_value,
  add column value    jsonb not null,           -- draw {path} · geo {lat,lng} · true-false {choice}
  add column wager    int check (wager between 1 and 3),
  add column judgment jsonb,                    -- quizmaster only (draw): {read, invalid} · {parts} · {points}
  add constraint answers_value_size check (octet_length(value::text) <= 4000);

-- Clients may see THAT a team answered ("svaret ✓"), never WHAT – until reveal (revealed_answers()).
-- Column privileges also filter Realtime payloads.
revoke all on public.answers from anon, authenticated;
grant select (id, game_id, team_id, question_key, submitted_at) on public.answers to anon, authenticated;

-- ───────────── scores: round, detail, source ─────────────
alter table public.scores drop constraint if exists scores_points_check;
alter table public.scores
  add constraint scores_points_check check (points between -50 and 50),
  add column round  int,
  add column detail jsonb,
  -- auto = computed (may be recomputed) · approved = quizmaster approved a proposal · manual = quizmaster override
  add column source text not null default 'manual' check (source in ('auto', 'approved', 'manual'));

-- ───────────── game_state: generic question + stepwise reveal ─────────────
alter table public.game_state
  drop column if exists question_key,            -- was generated from round/index; quiz keys are free text now
  drop column if exists scoring,
  drop column if exists canvas_background,
  drop column if exists scale_min,
  drop column if exists scale_max,
  drop column if exists scale_unit,
  drop column if exists answer_value;

alter table public.game_state
  add column question_key      text not null default '',
  add column answer_type       text not null default 'draw' check (answer_type in ('draw', 'geo', 'true-false')),
  add column show_text_on_play boolean not null default false,
  add column public_payload    jsonb not null default '{}'::jsonb,  -- type-specific public fields (labels, mapStart, parts …)
  add column reveal_payload    jsonb,                              -- facit etc., only set in phase 'reveal'
  add column reveal_step       int not null default 0 check (reveal_step between 0 and 20),
  add column media_seek        double precision;                   -- "afspil fra sekund" (null = resume)

-- ───────────── shared check: may this (anonymous) user answer for this team right now? ─────────────
create or replace function public.team_can_answer(p_team uuid)
returns table (game_id uuid, question_key text)
language sql stable
security definer
set search_path = ''
as $$
  select t.game_id, gs.question_key
  from public.teams t
  join public.games g       on g.id = t.game_id
  join public.game_state gs on gs.game_id = t.game_id
  where t.id = p_team
    and t.auth_uid = auth.uid()
    and g.active
    and gs.phase in ('countdown', 'locked')
    and gs.timer_ends_at is not null
    and now() <= gs.timer_ends_at + interval '15 seconds';   -- grace: in-flight saves + drawing upload at lock
$$;
revoke execute on function public.team_can_answer(uuid) from public, anon, authenticated;

-- ───────────── team answers (changeable until the timer locks; last value wins) ─────────────
create or replace function public.submit_answer(p_team uuid, p_value jsonb, p_wager int default null)
returns timestamptz
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_game uuid;
  v_q    text;
  v_at   timestamptz := now();
begin
  if p_value is null or octet_length(p_value::text) > 4000 then
    raise exception 'Ugyldigt svar' using errcode = '22023';
  end if;
  if p_wager is not null and p_wager not between 1 and 3 then
    raise exception 'Ugyldig satsning' using errcode = '22023';
  end if;

  select c.game_id, c.question_key into v_game, v_q from public.team_can_answer(p_team) c;
  if not found then
    raise exception 'Svaret kan ikke afgives nu' using errcode = '42501';
  end if;

  insert into public.answers (game_id, team_id, question_key, value, wager, submitted_at)
  values (v_game, p_team, v_q, p_value, p_wager, v_at)
  on conflict (team_id, question_key)
  do update set value = excluded.value, wager = excluded.wager, submitted_at = excluded.submitted_at;

  return v_at;
end;
$$;

revoke execute on function public.submit_answer(uuid, jsonb, int) from public, anon;
grant  execute on function public.submit_answer(uuid, jsonb, int) to authenticated;

-- ───────────── drawing upload: answers/{gameId}/{questionKey}/{teamId}.png, own team, question open ─────────────
create or replace function public.can_upload_drawing(p_path text)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if p_path is null or p_path !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,40}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  then
    return false;
  end if;
  v_team := replace(split_part(p_path, '/', 3), '.png', '')::uuid;
  return exists (
    select 1 from public.team_can_answer(v_team) c
    join public.game_state gs on gs.game_id = c.game_id
    where c.game_id::text = split_part(p_path, '/', 1)
      and c.question_key = split_part(p_path, '/', 2)
      and gs.answer_type = 'draw'
  );
end;
$$;
revoke execute on function public.can_upload_drawing(text) from public, anon;
grant  execute on function public.can_upload_drawing(text) to authenticated;

create policy "teams upload own drawing" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'answers' and public.can_upload_drawing(name));

-- ───────────── answers for the current question, only once revealed ─────────────
create or replace function public.revealed_answers(p_game uuid)
returns table (team_id uuid, value jsonb, wager int, judgment jsonb, submitted_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select a.team_id, a.value, a.wager, a.judgment, a.submitted_at
  from public.answers a
  join public.game_state gs on gs.game_id = a.game_id
  where a.game_id = p_game
    and a.question_key = gs.question_key
    and gs.phase in ('reveal', 'scoreboard', 'finished');
$$;

revoke execute on function public.revealed_answers(uuid) from public;
grant  execute on function public.revealed_answers(uuid) to anon, authenticated;
