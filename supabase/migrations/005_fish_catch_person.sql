alter table public.fish_catches
    add column caught_by text not null default '';
