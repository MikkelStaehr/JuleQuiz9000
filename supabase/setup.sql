-- Combined setup for a NEW Supabase project: paste everything into SQL Editor → Run

-- ════════ supabase/migrations/20261126120000_init.sql ════════
-- Den kæmpe store elite jule quiz – initial schema
-- Tables: games, teams, game_state, answers, scores
-- Teams authenticate with Supabase anonymous sign-in and claim a team via join_team(code, name).
-- All quizmaster writes go through the Next.js server (service role), which bypasses RLS.

-- ───────────────────────────── tables ─────────────────────────────

create table public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Den kæmpe store elite jule quiz',
  active      boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  slot       smallint not null check (slot between 1 and 8),
  join_code  text not null check (join_code ~ '^[0-9]{4}$'),
  name       text check (char_length(name) between 1 and 40),
  joined_at  timestamptz,
  auth_uid   uuid,                       -- anonymous auth user currently holding the team
  is_demo    boolean not null default false,
  unique (game_id, join_code),
  unique (game_id, slot)
);
create index teams_game_idx on public.teams (game_id);
create index teams_code_idx on public.teams (join_code);

create table public.game_state (
  game_id          uuid primary key references public.games(id) on delete cascade,
  phase            text not null default 'idle'
                   check (phase in ('idle','question','countdown','locked','reveal','scoreboard','finished')),
  current_round    int not null default 1,
  current_index    int not null default 1,
  question_key     text generated always as ('r' || current_round || '-q' || current_index) stored,
  total_rounds     int not null default 7,
  round_size       int not null default 7,
  round_title      text,
  -- The current question is copied here by the quizmaster when shown,
  -- so team devices never receive the full quiz (or the facit) in advance.
  question_text    text,
  media_type       text not null default 'none' check (media_type in ('none','image','audio','video')),
  media_url        text,
  answer_text      text,                 -- only set in phase 'reveal'
  timer_seconds    int,
  timer_ends_at    timestamptz,
  media_command    text not null default 'stop' check (media_command in ('play','pause','stop')),
  media_command_at timestamptz,
  updated_at       timestamptz not null default now()
);

create table public.answers (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  question_key  text not null,
  image_path    text not null,
  submitted_at  timestamptz not null default now(),
  unique (team_id, question_key)
);
create index answers_game_q_idx on public.answers (game_id, question_key);

create table public.scores (
  game_id       uuid not null references public.games(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  question_key  text not null,
  points        smallint not null check (points between 0 and 3),
  updated_at    timestamptz not null default now(),
  primary key (team_id, question_key)
);
create index scores_game_idx on public.scores (game_id);

-- ───────────────────────────── functions ─────────────────────────────

-- Server time for clock-skew compensation.
create or replace function public.server_now()
returns timestamptz
language sql stable
set search_path = ''
as $$ select now() $$;

-- True if the calling (anonymous) user may upload/insert the answer at this storage path:
-- path = {gameId}/{questionKey}/{teamId}.png, team owned by caller, question is live, timer not long expired.
create or replace function public.can_submit_answer(p_path text)
returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_game uuid;
  v_q    text;
  v_team uuid;
begin
  if auth.uid() is null or p_path is null or p_path !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/r[0-9]{1,2}-q[0-9]{1,2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  then
    return false;
  end if;

  v_game := split_part(p_path, '/', 1)::uuid;
  v_q    := split_part(p_path, '/', 2);
  v_team := replace(split_part(p_path, '/', 3), '.png', '')::uuid;

  return exists (
    select 1
    from public.teams t
    join public.games g       on g.id = t.game_id
    join public.game_state gs on gs.game_id = t.game_id
    where t.id = v_team
      and t.game_id = v_game
      and t.auth_uid = auth.uid()
      and g.active
      and gs.question_key = v_q
      and gs.phase in ('countdown', 'locked')
      and gs.timer_ends_at is not null
      and now() <= gs.timer_ends_at + interval '20 seconds'   -- grace for upload after lock
  );
end;
$$;

-- Team joins (or re-joins after a lost session) with a 4-digit code.
create or replace function public.join_team(p_code text, p_name text)
returns json
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Ikke logget ind' using errcode = '28000';
  end if;
  if p_code !~ '^[0-9]{4}$' then
    raise exception 'Koden skal være 4 cifre' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Holdnavnet skal være 1–40 tegn' using errcode = '22023';
  end if;

  select t.* into v_team
  from public.teams t
  join public.games g on g.id = t.game_id
  where g.active and not t.is_demo and t.join_code = p_code
  order by g.created_at desc
  limit 1
  for update of t;

  if not found then
    raise exception 'Ukendt kode' using errcode = 'P0002';
  end if;

  update public.teams
     set name = v_name,
         auth_uid = auth.uid(),
         joined_at = coalesce(joined_at, now())
   where id = v_team.id
  returning * into v_team;

  return json_build_object('team_id', v_team.id, 'game_id', v_team.game_id, 'name', v_team.name, 'slot', v_team.slot);
end;
$$;

-- Quizmaster-only: start countdown using database time (single source of truth for the timer).
create or replace function public.start_timer(p_game uuid, p_seconds int)
returns void
language sql volatile
set search_path = ''
as $$
  update public.game_state
     set phase = 'countdown',
         timer_seconds = p_seconds,
         timer_ends_at = now() + make_interval(secs => p_seconds),
         updated_at = now()
   where game_id = p_game;
$$;

-- Quizmaster-only: lock now (also used automatically when the timer expires).
create or replace function public.lock_now(p_game uuid)
returns void
language sql volatile
set search_path = ''
as $$
  update public.game_state
     set phase = 'locked',
         timer_ends_at = least(coalesce(timer_ends_at, now()), now()),
         updated_at = now()
   where game_id = p_game and phase in ('countdown', 'question');
$$;

revoke execute on function public.start_timer(uuid, int) from public, anon, authenticated;
revoke execute on function public.lock_now(uuid)          from public, anon, authenticated;
grant  execute on function public.start_timer(uuid, int) to service_role;
grant  execute on function public.lock_now(uuid)          to service_role;

revoke execute on function public.join_team(text, text)      from public, anon;
grant  execute on function public.join_team(text, text)      to authenticated;
revoke execute on function public.can_submit_answer(text)    from public, anon;
grant  execute on function public.can_submit_answer(text)    to authenticated;
grant  execute on function public.server_now()               to anon, authenticated;

-- ───────────────────────────── privileges + RLS ─────────────────────────────

alter table public.games      enable row level security;
alter table public.teams      enable row level security;
alter table public.game_state enable row level security;
alter table public.answers    enable row level security;
alter table public.scores     enable row level security;

-- Clients only read (plus teams insert their own answers). Everything else is server-side.
revoke all on public.games, public.teams, public.game_state, public.answers, public.scores from anon, authenticated;

grant select on public.games, public.game_state, public.answers, public.scores to anon, authenticated;
-- join_code and auth_uid are never readable by clients (column privileges also apply to Realtime payloads).
grant select (id, game_id, slot, name, joined_at, is_demo) on public.teams to anon, authenticated;
grant insert on public.answers to authenticated;

create policy "read games"      on public.games      for select to anon, authenticated using (true);
create policy "read teams"      on public.teams      for select to anon, authenticated using (true);
create policy "read game_state" on public.game_state for select to anon, authenticated using (true);
create policy "read answers"    on public.answers    for select to anon, authenticated using (true);
create policy "read scores"     on public.scores     for select to anon, authenticated using (true);

create policy "teams insert own answer" on public.answers
  for insert to authenticated
  with check (
    image_path = game_id::text || '/' || question_key || '/' || team_id::text || '.png'
    and public.can_submit_answer(image_path)
  );

-- ───────────────────────────── storage ─────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('answers', 'answers', true, 2097152, array['image/png'])
on conflict (id) do nothing;

create policy "teams upload own answer image" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'answers' and public.can_submit_answer(name));

-- ───────────────────────────── realtime ─────────────────────────────

alter publication supabase_realtime add table
  public.games, public.teams, public.game_state, public.answers, public.scores;

-- ════════ supabase/migrations/20261126130000_scale_rounds.sql ════════
-- Scale questions ("Hvad siger statistikken?"), closest-wins scoring and per-round point multiplier.

-- Where the team placed its cross on the scale (computed on the team device from the drawing).
alter table public.answers add column scale_value double precision;

alter table public.game_state
  add column scoring          text not null default 'manual' check (scoring in ('manual', 'closest')),
  add column point_multiplier int  not null default 1 check (point_multiplier between 1 and 5),
  add column canvas_background text not null default 'blank' check (canvas_background in ('blank', 'scale')),
  add column scale_min        double precision,
  add column scale_max        double precision,
  add column scale_unit       text,
  add column answer_value     double precision;          -- facit on the scale, only set in phase 'reveal'

-- Stored points are final points (base 0–3 × multiplier).
alter table public.scores drop constraint scores_points_check;
alter table public.scores add constraint scores_points_check check (points between 0 and 15);

-- Teams may only send a finite scale value (or none).
alter table public.answers add constraint answers_scale_value_finite
  check (scale_value is null or (scale_value > -1e9 and scale_value < 1e9));

-- ════════ supabase/migrations/20261126140000_rename_quiz.sql ════════
-- Rename: "Den kæmpe store elite jule quiz" (only the default game name; the app always sets it explicitly).
alter table public.games alter column name set default 'Den kæmpe store elite jule quiz';
update public.games set name = replace(replace(name, 'UBS Christmas Quiz 2026', 'Den kæmpe store elite jule quiz'), 'Demo – UBS', 'Demo –');

-- ════════ supabase/migrations/20261126150000_answer_types.sql ════════
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

-- ════════ supabase/migrations/20261126170000_answer_lock.sql ════════
-- Teams can lock their answer before the timer runs out ("Lås svar"). A locked answer can't be changed.

alter table public.answers add column if not exists locked_at timestamptz;
-- status column: visible to everyone (display shows "låst 🔒"), like submitted_at
grant select (locked_at) on public.answers to anon, authenticated;

-- submit_answer: unchanged, except a locked answer can no longer be changed
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
  if exists (select 1 from public.answers a where a.team_id = p_team and a.question_key = v_q and a.locked_at is not null) then
    raise exception 'Svaret er låst' using errcode = '42501';
  end if;

  insert into public.answers (game_id, team_id, question_key, value, wager, submitted_at)
  values (v_game, p_team, v_q, p_value, p_wager, v_at)
  on conflict (team_id, question_key)
  do update set value = excluded.value, wager = excluded.wager, submitted_at = excluded.submitted_at;

  return v_at;
end;
$$;

-- lock_answer: save the final answer and lock it (no-op if already locked)
create or replace function public.lock_answer(p_team uuid, p_value jsonb, p_wager int default null)
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

  insert into public.answers (game_id, team_id, question_key, value, wager, submitted_at, locked_at)
  values (v_game, p_team, v_q, p_value, p_wager, v_at, v_at)
  on conflict (team_id, question_key)
  do update set value = excluded.value, wager = excluded.wager, submitted_at = excluded.submitted_at, locked_at = excluded.locked_at
  where public.answers.locked_at is null;

  return v_at;
end;
$$;

revoke execute on function public.lock_answer(uuid, jsonb, int) from public, anon;
grant  execute on function public.lock_answer(uuid, jsonb, int) to authenticated;

