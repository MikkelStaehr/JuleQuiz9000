-- Combined setup: paste everything into Supabase → SQL Editor → Run

-- ════════ supabase/migrations/20261126120000_init.sql ════════
-- UBS Christmas Quiz 2026 – initial schema
-- Tables: games, teams, game_state, answers, scores
-- Teams authenticate with Supabase anonymous sign-in and claim a team via join_team(code, name).
-- All quizmaster writes go through the Next.js server (service role), which bypasses RLS.

-- ───────────────────────────── tables ─────────────────────────────

create table public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'UBS Christmas Quiz 2026',
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

