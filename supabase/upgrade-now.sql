-- Kør én gang i Supabase → SQL Editor: holdene kan låse deres svar

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
