insert into public.gear_checklist (item_name, category)
select starters.item_name, starters.category
from (values
    ('Permis de pêche du Québec (zone 14) pour chaque pêcheur', 'Documents'),
    ('Droit de pêche AFC Gouin (imprimé ou téléchargé)', 'Documents'),
    ('Argent comptant (cartes parfois non acceptées en région éloignée)', 'Documents'),
    ('Copie papier de la réservation et des directions', 'Documents'),
    ('Deux cannes par personne (légère-moyenne pour le doré, moyenne-forte pour le brochet)', 'Fishing'),
    ('Têtes jig 1/8, 1/4 et 3/8 oz (chartreuse, rose, blanc, or)', 'Fishing'),
    ('Leurres : Rapala, Thin Fin, Hot ''N Tot, Cotton Cordell, cuillères et spinnerbaits', 'Fishing'),
    ('Bas de ligne, rondelles de fond (bottom bouncers) et harnais à vers', 'Fishing'),
    ('Bas de ligne en acier (pour les dents du brochet)', 'Fishing'),
    ('Ligne de rechange (nylon ou tressée, 8 à 12 lb)', 'Fishing'),
    ('Pince à poisson (lip grip), pince à long bec et décrochoir', 'Fishing'),
    ('Couteau à fileter, aiguiseur et ruban à mesurer', 'Fishing'),
    ('Sonar portatif, support de transducteur et batterie 12 V (si absent des chaloupes)', 'Fishing'),
    ('Serviettes de bain (2 par personne) et serviette en microfibre', 'Personal'),
    ('Bouchons d’oreilles et masque de nuit', 'Personal'),
    ('Surplus de nourriture précuite et congelée (sert aussi de glace dans les glacières)', 'Food & water'),
    ('Deuxième glacière pour les prises et beaucoup de glace en blocs', 'Kitchen'),
    ('Bidons d’eau potable (18 L) avec pompe', 'Food & water'),
    ('Sacs Ziploc (grand format pour les filets) et papier d’aluminium', 'Kitchen'),
    ('Essuie-tout, gros sacs à ordures et savon à vaisselle biodégradable', 'Kitchen'),
    ('Cafetière (percolateur ou French press pour la cuisinière)', 'Kitchen'),
    ('Huile, mélange pour poisson (lunch de rivage), épices, condiments et beurre', 'Food & water'),
    ('Isolants à canette et gobelets isothermes', 'Kitchen'),
    ('Ensemble de pluie résistant (manteau et pantalon)', 'Personal'),
    ('Couches chaudes : polaires, sous-vêtements thermiques, bas de laine et tuque', 'Personal'),
    ('Chapeau à large bord, lunettes polarisées et chandail anti-UV', 'Personal'),
    ('Chaussures imperméables pour le bateau et souliers de camp à séchage rapide', 'Personal'),
    ('Chasse-moustiques à haute teneur en DEET et appareils Thermacell', 'Personal'),
    ('Baume à lèvres et crème solaire résistante à l’eau', 'Personal'),
    ('Trousse de premiers soins : pansements, antiseptique, crème contre les brûlures, polysporin, bandage élastique, médicaments contre le mal des transports', 'Safety'),
    ('Médicaments personnels (réserve de 2 jours en extra)', 'Safety'),
    ('Savon et shampoing biodégradables', 'Personal'),
    ('Batteries externes (20 000 mAh ou plus)', 'Electronics'),
    ('Appareil satellite (Garmin inReach, ZOLEO ou autre) pour les urgences', 'Electronics'),
    ('Haut-parleur Bluetooth', 'Electronics'),
    ('Adaptateurs USB 12 V', 'Electronics'),
    ('Ruban adhésif (duct tape) et outil multifonction', 'Camp'),
    ('Gants de travail et corde pour amarrer le bateau-maison', 'Camp'),
    ('Bois de chauffage et allume-feu (vérifier les interdictions de feu)', 'Camp'),
    ('Chiffons en microfibre (écran du sonar et bancs)', 'Camp')
) as starters(item_name, category)
where not exists (
    select 1 from public.gear_checklist existing
    where existing.item_name = starters.item_name
);
