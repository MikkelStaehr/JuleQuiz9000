-- Rename: "Den kæmpe store elite jule quiz" (only the default game name; the app always sets it explicitly).
alter table public.games alter column name set default 'Den kæmpe store elite jule quiz';
update public.games set name = replace(replace(name, 'UBS Christmas Quiz 2026', 'Den kæmpe store elite jule quiz'), 'Demo – UBS', 'Demo –');
