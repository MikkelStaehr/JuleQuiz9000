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
