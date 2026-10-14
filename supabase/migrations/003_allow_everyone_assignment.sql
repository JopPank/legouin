alter table public.couples drop constraint if exists couples_id_check;
alter table public.couples add constraint couples_id_check check (id between 1 and 5);

insert into public.couples (id, name) values (5, 'Tous')
on conflict (id) do update set name = excluded.name;
