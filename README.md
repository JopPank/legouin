# Le Gouin — organisation du voyage

Application privée en français canadien pour le voyage au réservoir Gouin, du 2 au 6 août 2027. L’application Next.js utilise Supabase Auth, PostgreSQL, Realtime et Storage pour partager les plans entre les huit participants et les quatre couples.

## Fonctionnalités

- Logistique : départ et retour, point de rencontre, covoiturage, détails de location et réservation.
- Bagages : articles par catégorie, couple responsable, attribution personnelle et état « prêt ».
- À faire avant le voyage : rappels de préparation regroupés par sujet, distincts de la liste des bagages.
- Épicerie : articles, quantités, couple responsable des achats et état « acheté ».
- Repas : déjeuner, dîner et souper pour chacune des cinq journées; menu et couple responsable facultatifs.
- Pêche : espèces visées, rappels de permis, matériel et notes locales.
- Dépenses : six catégories, montant, choix du couple payeur, partage égal entre quatre couples et remboursements suggérés.
- Photos : téléversement privé JPG, PNG, WebP ou GIF (10 Mo maximum par fichier); seuls les participants connectés peuvent voir les photos, et chaque participant peut supprimer ses propres téléversements.
- Carte : carte OpenStreetMap avec repère approximatif, non destinée à la navigation.
- Sécurité et contacts : coordonnées du responsable, services médicaux, contacts et consignes d’urgence. Les détails sont visibles à tous les participants autorisés; ne consignez que les renseignements que le groupe accepte de partager.

Le fichier [`preview.html`](./preview.html) reste un aperçu local distinct. Il n’est pas synchronisé avec Supabase et les données de cet aperçu ne sont pas transférées dans l’application.

## Configuration locale

Prérequis : Node.js 20.9 ou plus récent, npm et un projet Supabase.

1. Créez un projet Supabase privé.
2. Dans l’éditeur SQL Supabase, exécutez dans l’ordre :
   - [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql)
   - [`supabase/migrations/002_full_trip_planner.sql`](./supabase/migrations/002_full_trip_planner.sql)
3. Copiez `.env.example` vers `.env.local` et inscrivez l’URL du projet Supabase ainsi que sa clé publique (`anon`/publishable).
4. Installez les dépendances et démarrez le site :

   ```sh
   npm install
   npm run dev
   ```

N’utilisez jamais une clé `service_role` dans le navigateur, dans une variable `NEXT_PUBLIC_` ou dans le dépôt Git.

## Comptes des participants

Désactivez les inscriptions publiques dans Supabase Auth. Créez les huit comptes des participants depuis le tableau de bord Supabase, puis ajoutez leurs profils avec l’UUID Auth de chaque compte :

```sql
insert into public.profiles (id, full_name, couple_id)
values
  ('UUID-AUTH-DE-JOP', 'Jop', 1),
  ('UUID-AUTH-DE-NAT', 'Nat', 1),
  ('UUID-AUTH-D-ANDREA', 'Andréa', 2),
  ('UUID-AUTH-D-ALAIN', 'Alain', 2),
  ('UUID-AUTH-DE-BEN', 'Ben', 3),
  ('UUID-AUTH-DE-PAS', 'Pas', 3),
  ('UUID-AUTH-DE-JO', 'Jo', 4),
  ('UUID-AUTH-DE-CHRIS', 'Chris', 4);
```

Remplacez chaque valeur `UUID-AUTH-...` par l’UUID réel du compte correspondant avant d’exécuter la requête. La migration associe les couples aux noms utilisés dans l’application et réserve les tables et le bucket photo aux participants ayant un profil.

## Déploiement sur `legouin.jopism.com`

Le dépôt déploie le site statique avec GitHub Actions et GitHub Pages. Chaque poussée sur `main` déclenche le build et le déploiement. Le site utilise Supabase directement depuis le navigateur; seules l’URL Supabase et sa clé publique sont requises au build.

1. Dans les paramètres du dépôt GitHub, ajoutez les variables de dépôt `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` avec l’URL du projet Supabase et sa clé publique (`anon`/publishable). L’action échoue explicitement si l’une manque. N’ajoutez jamais une clé `service_role`.
2. Dans **Settings → Pages**, choisissez **GitHub Actions** comme source de build et de déploiement.
3. Lancez l’action **Deploy to GitHub Pages** depuis **Actions**, ou poussez un changement sur `main`. Vérifiez que le workflow réussit.
4. Dans **Settings → Pages → Custom domain**, inscrivez `legouin.jopism.com` et enregistrez.
5. Chez le fournisseur DNS de `jopism.com`, configurez l’hôte `legouin` en CNAME vers `joppank.github.io` (ou la cible précise indiquée par GitHub). Remplacez tout CNAME existant pour `legouin`; ne modifiez pas les serveurs de noms ni les enregistrements du domaine racine. Attendez que GitHub confirme DNS et HTTPS.
6. Dans Supabase Auth **URL Configuration**, réglez le Site URL sur `https://legouin.jopism.com` et ajoutez cette URL aux URL de redirection autorisées.
7. Avant de communiquer l’adresse au groupe, vérifiez la connexion des huit comptes, les politiques RLS avec un participant, la visibilité et la suppression des photos, le téléversement, les mises à jour en direct et l’affichage sur téléphone.

### Contrôles de confidentialité

- Les inscriptions publiques doivent rester désactivées.
- RLS est activé pour les données du voyage; le bucket `trip-photos` est privé.
- Les participants connectés peuvent consulter les photos; chacun ne peut supprimer que ses propres fichiers.
- La section Sécurité est partagée avec les huit participants. Son contenu ne doit pas inclure de renseignements que le groupe ne veut pas partager.
- Les valeurs de `.env.local` et les clés privées ne doivent jamais être publiées.

## Vérification

Après installation de Node.js et des dépendances :

```sh
npm run build
```

Le projet de travail initial ne comprend pas de suite de tests automatisés. Le build et les scénarios manuels ci-dessus doivent réussir avant l’invitation des participants.
