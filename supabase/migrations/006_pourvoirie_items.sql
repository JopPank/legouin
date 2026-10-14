insert into public.gear_checklist (item_name, category)
select starters.item_name, starters.category
from (values
    ('Literie : sacs de couchage ou draps et couvertures', 'Personal'),
    ('Oreillers', 'Personal'),
    ('Papier hygiénique', 'Other'),
    ('Linge à vaisselle', 'Kitchen'),
    ('Eau potable (l’eau du bateau-maison n’est pas potable)', 'Kitchen'),
    ('Essence (à acheter à la pourvoirie)', 'Other'),
    ('Vers et sangsues (en vente à la pourvoirie)', 'Fishing')
) as starters(item_name, category)
where not exists (
    select 1 from public.gear_checklist existing
    where existing.item_name = starters.item_name
);
