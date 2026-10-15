'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Database, MealType } from '@/lib/database.types';
import { getSupabaseClient } from '@/lib/supabase';
import {
  applyOps, executeOp, flushQueue, isNetworkError, loadCache, loadQueue, newTempId, readStoredSession, saveCache, saveQueue,
  type PendingOp,
} from '@/lib/offline';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Meal = Database['public']['Tables']['meal_plan']['Row'];
type GearItem = Database['public']['Tables']['gear_checklist']['Row'];
type Expense = Database['public']['Tables']['expenses']['Row'];
type Tab = 'logistics' | 'gear' | 'beforeYouGo' | 'groceries' | 'meals' | 'fishing' | 'expenses' | 'photos' | 'map' | 'pourvoirie' | 'safety';
type GroceryItem = Database['public']['Tables']['grocery_items']['Row'];
type TripLogistics = Database['public']['Tables']['trip_logistics']['Row'];
type FishingNotes = Database['public']['Tables']['fishing_notes']['Row'];
type FishCatch = Database['public']['Tables']['fish_catches']['Row'];
type SafetyInfo = Database['public']['Tables']['safety_info']['Row'];
type TripPhoto = { path: string; url: string };
type BaseData = {
  profile: Profile; profiles: Profile[]; meals: Meal[]; gear: GearItem[]; expenses: Expense[]; groceries: GroceryItem[];
  logistics: TripLogistics | null; fishing: FishingNotes | null; safety: SafetyInfo | null; catches: FishCatch[];
};
type MutationInput = Omit<PendingOp, 'id' | 'queuedAt' | 'tempId'>;

const gearCategories = ['Documents', 'Fishing', 'Kitchen', 'Food & water', 'Safety', 'Personal', 'Electronics', 'Camp', 'Shelter', 'Other'];
const gearCategoryLabels: Record<string, string> = {
  Kitchen: 'Cuisine', Shelter: 'Abri', 'Food & water': 'Nourriture et eau',
  Safety: 'Sécurité', Personal: 'Personnel', Other: 'Autre',
  Documents: 'Documents et argent', Fishing: 'Pêche', Electronics: 'Électronique', Camp: 'Camp et matériel',
};
const mealTypeLabels: Record<MealType, string> = {
  Breakfast: 'Déjeuner', Lunch: 'Dîner', Dinner: 'Souper', Snacks: 'Collations',
};
const expenseCategories = ['Essence', 'Épicerie', 'Boissons', 'Matériel de pêche', 'Autres frais', 'Bois de chauffage'];
const tripPhotoBucket = 'trip-photos';
const everyoneId = 5;
const assigneeIds = [1, 2, 3, 4, everyoneId];
const fishSpecies = ['Doré jaune', 'Grand brochet', 'Grand corégone', 'Touladi', 'Omble de fontaine', 'Perchaude', 'Lotte'];
const otherSpecies = 'Autre espèce';
const participantNames = ['Jop', 'Nat', 'Andréa', 'Alain', 'Ben', 'Pas', 'Jo', 'Chris'];
const beforeYouGoGroups = [
  {
    title: 'Numérique et technologie',
    reminders: [
      'Télécharger des listes de lecture, balados ou films pour les écouter hors ligne.',
      'Télécharger les cartes hors ligne du réservoir Gouin et de la Haute-Mauricie (Google Maps, Navionics ou Gaia GPS).',
      'Charger à 100 % les batteries externes, lampes frontales, batteries d’appareil photo et haut-parleurs portatifs.',
    ],
  },
  {
    title: 'Permis et démarches',
    reminders: [
      'Acheter le permis de pêche du Québec pour la zone 14 et en télécharger ou imprimer une copie pour chaque pêcheur.',
      'Acheter le droit de pêche obligatoire de l’AFC Gouin pour chaque pêcheur.',
      'Vérifier qu’au moins une personne qui conduira une chaloupe ou le bateau-maison a sa carte de conducteur d’embarcation de plaisance (CCEP), sur elle ou dans son téléphone.',
      'Retirer de l’argent comptant avant de quitter les grands centres; les cartes ne sont pas toujours acceptées en région éloignée.',
    ],
  },
  {
    title: 'Décisions et logistique de groupe',
    reminders: [
      'Confirmer le lieu et l’heure du rendez-vous et du départ en convoi, par exemple à la dernière station-service avant la route forestière R0400.',
      'Répartir les rôles à bord : capitaine, chef pour chaque soirée et personnes responsables de nettoyer et fileter les poissons.',
      'Établir un plan de sortie et les consignes d’urgence; transmettre à un proche les coordonnées de la pourvoirie, les numéros des appareils satellites et l’heure de retour prévue.',
    ],
  },
  {
    title: 'Véhicule et itinéraire',
    reminders: [
      'Vérifier les pneus de secours, la pression des pneus et la présence d’un cric et d’une clé de roue fonctionnels.',
      'Faire le plein à la dernière station-service accessible, par exemple à Parent ou à Mont-Laurier, avant d’emprunter les routes forestières.',
      'Imprimer les indications routières ou en faire des captures d’écran; le GPS peut proposer de mauvais détours sur les chemins forestiers.',
    ],
  },
  {
    title: 'Repas et glacières',
    reminders: [
      'Congeler les plats préparés (sauce à spaghetti, chili) et les viandes marinées 48 heures à l’avance; ils serviront aussi de blocs réfrigérants.',
      'Prérefroidir les glacières avec de la glace 24 heures avant d’y mettre les aliments frais.',
      'Préparer les vers dans une litière humide et les garder au frais dans une glacière.',
    ],
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function money(value: number): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function calculateSettlements(balances: { coupleId: number; balance: number }[]) {
  const debtors = balances.filter(({ balance }) => balance < -0.01)
    .map(({ coupleId, balance }) => ({ coupleId, amount: -balance }));
  const creditors = balances.filter(({ balance }) => balance > 0.01)
    .map(({ coupleId, balance }) => ({ coupleId, amount: balance }));
  const transfers: { from: number; to: number; amount: number }[] = [];
  while (debtors.length && creditors.length) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.coupleId, to: creditor.coupleId, amount });
    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
    if (debtor.amount < 0.01) debtors.shift();
    if (creditor.amount < 0.01) creditors.shift();
  }
  return transfers;
}

function ConfigNotice() {
  return (
    <main className="center-stage">
      <section className="notice-card">
        <span className="eyebrow">Une petite étape de configuration</span>
        <h1>Connecter votre espace de voyage</h1>
        <p>
          Pour le développement local, ajoutez l’URL de votre projet Supabase et sa clé publique dans <code>.env.local</code>.
          Pour le site publié, définissez ces valeurs dans les variables du dépôt GitHub, puis relancez le déploiement.
        </p>
        <p className="muted">
          Gardez les clés de rôle de service confidentielles. Ce site utilise uniquement la clé publique prévue pour le navigateur.
        </p>
      </section>
    </main>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const supabase = getSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      if (!data.session) {
        setError('La connexion n’a pas créé de session active. Réessayez ou communiquez avec la personne qui organise le voyage.');
        return;
      }
      onSignedIn(data.session);
    } catch (signInError) {
      setError(getErrorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setResetSent(false);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setResetSent(true);
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-photo">
        <div className="photo-caption">
          <span className="eyebrow">Les bons moments se partagent</span>
          <h1>Au grand air,<br />ensemble.</h1>
          <p>Tous les détails d’un voyage mémorable.</p>
        </div>
        <span className="photo-credit">LE GOUIN · LE VOYAGE ENTRE AMIS</span>
      </div>
      <section className="auth-panel">
        <div className="auth-content">
          <Brand />
          <span className="eyebrow">Votre groupe, votre escapade</span>
          <h2>{resetMode ? 'Mot de passe oublié?' : 'Bon retour!'}</h2>
          <p className="muted">
            {resetMode
              ? 'Nous vous enverrons un lien pour choisir un nouveau mot de passe.'
              : 'Connectez-vous pour voir ce que chacun apporte, prépare et paie.'}
          </p>
          <form className="stack-form" onSubmit={resetMode ? requestPasswordReset : signIn}>
            <label>
              Adresse courriel
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vous@exemple.ca"
                required
              />
            </label>
            {!resetMode && (
              <label>
                Mot de passe
                <input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Votre mot de passe"
                  required
                />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            {resetSent && <p className="form-success" role="status">Si cette adresse correspond à un compte, un lien de réinitialisation vous sera envoyé.</p>}
            <button className="button button-dark button-full" type="submit" disabled={busy}>
              {busy
                ? (resetMode ? 'Envoi…' : 'Connexion…')
                : (resetMode ? 'Envoyer le lien' : 'Se connecter')} <span aria-hidden="true">↗</span>
            </button>
          </form>
          {resetMode ? (
            <button className="text-button auth-footnote" type="button" onClick={() => { setResetMode(false); setError(''); setResetSent(false); }}>
              Retour à la connexion
            </button>
          ) : (
            <>
              <button className="text-button auth-footnote" type="button" onClick={() => { setResetMode(true); setError(''); }}>
                Mot de passe oublié?
              </button>
              <p className="auth-footnote">Réservé aux personnes invitées. Demandez un compte à la personne qui organise le voyage.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function PasswordRecoveryScreen({ onComplete }: { onComplete: (session: Session | null) => void }) {
  const supabase = getSupabaseClient();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 6) {
      setError('Choisissez un mot de passe d’au moins 6 caractères.');
      return;
    }
    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(`Mot de passe modifié, mais impossible de restaurer la session : ${sessionError.message}`);
        return;
      }
      onComplete(data.session);
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-photo">
        <div className="photo-caption">
          <span className="eyebrow">Les bons moments se partagent</span>
          <h1>Au grand air,<br />ensemble.</h1>
          <p>Tous les détails d’un voyage mémorable.</p>
        </div>
        <span className="photo-credit">LE GOUIN · LE VOYAGE ENTRE AMIS</span>
      </div>
      <section className="auth-panel">
        <div className="auth-content">
          <Brand />
          <span className="eyebrow">Sécurisez votre compte</span>
          <h2>Choisir un mot de passe</h2>
          <p className="muted">Créez un mot de passe pour accéder à l’organisation du voyage.</p>
          <form className="stack-form" onSubmit={updatePassword}>
            <label>
              Nouveau mot de passe
              <input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
            <label>
              Confirmer le mot de passe
              <input autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={6} />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark button-full" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'} <span aria-hidden="true">↗</span>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Accueil de Le Gouin">
      <span className="brand-mark">LG</span>
      <span>LE GOUIN <small>ORGANISATION DU VOYAGE</small></span>
    </a>
  );
}

function AppShell({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const supabase = getSupabaseClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [gear, setGear] = useState<GearItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [logistics, setLogistics] = useState<TripLogistics | null>(null);
  const [fishingNotes, setFishingNotes] = useState<FishingNotes | null>(null);
  const [catches, setCatches] = useState<FishCatch[]>([]);
  const [catchSpecies, setCatchSpecies] = useState(fishSpecies[0]);
  const [catchWeight, setCatchWeight] = useState('');
  const [catchUnknownWeight, setCatchUnknownWeight] = useState(false);
  const [catchLocation, setCatchLocation] = useState('');
  const [catchPerson, setCatchPerson] = useState('');
  const [catchReleased, setCatchReleased] = useState(false);
  const [safetyInfo, setSafetyInfo] = useState<SafetyInfo | null>(null);
  const [photos, setPhotos] = useState<TripPhoto[]>([]);
  const [tab, setTab] = useState<Tab>('logistics');
  const [countdownDays, setCountdownDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeError, setRealtimeError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [mealDay, setMealDay] = useState('1');
  const [mealType, setMealType] = useState<MealType>('Dinner');
  const [mealCouple, setMealCouple] = useState('');
  const [mealDetails, setMealDetails] = useState('');
  const [gearName, setGearName] = useState('');
  const [gearCategory, setGearCategory] = useState('Other');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(expenseCategories[0]);
  const [expenseCouple, setExpenseCouple] = useState('');
  const [groceryName, setGroceryName] = useState('');
  const [groceryQuantity, setGroceryQuantity] = useState('');
  const [groceryCouple, setGroceryCouple] = useState('');
  const [packingCouple, setPackingCouple] = useState('');
  const [logisticsDraft, setLogisticsDraft] = useState({
    departure_details: '', return_details: '', meeting_place: '', transport_plan: '', rental_details: '', booking_notes: '',
  });
  const [fishingDraft, setFishingDraft] = useState({
    target_species: '', license_reminders: '', bait_tackle_notes: '', local_notes: '',
  });
  const [safetyDraft, setSafetyDraft] = useState({
    operator_contact: '', medical_services: '', emergency_contacts: '', boat_instructions: '',
  });
  const [nameDraft, setNameDraft] = useState('');
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const baseRef = useRef<BaseData | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = new Date('2027-08-02T00:00:00-04:00').getTime() - Date.now();
      setCountdownDays(Math.max(0, Math.floor(remaining / (24 * 60 * 60 * 1000))));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 24 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const showData = useCallback((base: BaseData) => {
    baseRef.current = base;
    const queue = loadQueue(user.id);
    setPendingCount(queue.length);
    setProfile(base.profile);
    setProfiles(base.profiles);
    setMeals(applyOps('meal_plan', base.meals, queue, {
      insertDefaults: { assigned_couple_id: null, menu_details: null },
      addAt: 'end',
      matchesUpsert: (row, values) => row.day_number === values.day_number && row.meal_type === values.meal_type,
    }));
    setGear(applyOps('gear_checklist', base.gear, queue, {
      insertDefaults: { is_communal: true, claimed_by_user: null, is_packed: false, assigned_couple_id: null }, addAt: 'end',
    }));
    setExpenses(applyOps('expenses', base.expenses, queue, { insertDefaults: {}, addAt: 'start' }));
    setGroceries(applyOps('grocery_items', base.groceries, queue, {
      insertDefaults: { quantity: '', assigned_couple_id: null, is_bought: false, created_by_user: user.id }, addAt: 'end',
    }));
    setCatches(applyOps('fish_catches', base.catches, queue, {
      insertDefaults: { caught_by_couple_id: null, weight_kg: null, location: '', caught_by: '', released: false, created_by_user: user.id },
      addAt: 'start',
    }));
    setLogistics(base.logistics && applyOps('trip_logistics', [base.logistics], queue, { insertDefaults: {} })[0]);
    setFishingNotes(base.fishing && applyOps('fishing_notes', [base.fishing], queue, { insertDefaults: {} })[0]);
    setSafetyInfo(base.safety && applyOps('safety_info', [base.safety], queue, { insertDefaults: {} })[0]);
  }, [user.id]);

  const adoptBase = useCallback((base: BaseData) => {
    setNameDraft(base.profile.full_name);
    setLogisticsDraft({
      departure_details: base.logistics?.departure_details ?? '',
      return_details: base.logistics?.return_details ?? '',
      meeting_place: base.logistics?.meeting_place ?? '',
      transport_plan: base.logistics?.transport_plan ?? '',
      rental_details: base.logistics?.rental_details ?? '',
      booking_notes: base.logistics?.booking_notes ?? '',
    });
    setFishingDraft({
      target_species: base.fishing?.target_species ?? '',
      license_reminders: base.fishing?.license_reminders ?? '',
      bait_tackle_notes: base.fishing?.bait_tackle_notes ?? '',
      local_notes: base.fishing?.local_notes ?? '',
    });
    setSafetyDraft({
      operator_contact: base.safety?.operator_contact ?? '',
      medical_services: base.safety?.medical_services ?? '',
      emergency_contacts: base.safety?.emergency_contacts ?? '',
      boat_instructions: base.safety?.boat_instructions ?? '',
    });
    showData(base);
  }, [showData]);

  const refreshData = useCallback(async () => {
    if (!supabase) return;
    try {
      const [profileResult, profilesResult, mealsResult, gearResult, expensesResult, groceriesResult, logisticsResult, fishingResult, safetyResult, catchesResult] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('profiles').select('*').order('couple_id'),
          supabase.from('meal_plan').select('*').order('day_number').order('meal_type'),
          supabase.from('gear_checklist').select('*').order('category').order('item_name'),
          supabase.from('expenses').select('*').order('created_at', { ascending: false }),
          supabase.from('grocery_items').select('*').order('is_bought').order('item_name'),
          supabase.from('trip_logistics').select('*').eq('id', 1).maybeSingle(),
          supabase.from('fishing_notes').select('*').eq('id', 1).maybeSingle(),
          supabase.from('safety_info').select('*').eq('id', 1).maybeSingle(),
          supabase.from('fish_catches').select('*').order('created_at', { ascending: false }),
        ]);

      const failure = [profileResult, profilesResult, mealsResult, gearResult, expensesResult, groceriesResult, logisticsResult, fishingResult, safetyResult, catchesResult]
        .find((result) => result.error);
      if (failure?.error) {
        const cached = loadCache<BaseData>(user.id);
        if (cached && (isNetworkError(failure.error.message) || !navigator.onLine)) {
          adoptBase(cached);
          setError('');
          setLoading(false);
          return;
        }
        setError(failure.error.message);
        setLoading(false);
        return;
      }
      if (!profileResult.data) {
        setError('Votre compte est connecté, mais aucun profil de voyage n’est configuré. Demandez à la personne qui organise le voyage de vous ajouter.');
        setLoading(false);
        return;
      }

      const base: BaseData = {
        profile: profileResult.data,
        profiles: profilesResult.data ?? [],
        meals: mealsResult.data ?? [],
        gear: gearResult.data ?? [],
        expenses: expensesResult.data ?? [],
        groceries: groceriesResult.data ?? [],
        logistics: logisticsResult.data,
        fishing: fishingResult.data,
        safety: safetyResult.data,
        catches: catchesResult.data ?? [],
      };
      saveCache(user.id, base);
      adoptBase(base);
      void refreshPhotos();
      setError('');
      setLoading(false);
    } catch (loadError) {
      const cached = loadCache<BaseData>(user.id);
      if (cached) {
        adoptBase(cached);
        setError('');
      } else {
        setError(getErrorMessage(loadError));
      }
      setLoading(false);
    }
  }, [supabase, user.id, adoptBase]);

  useEffect(() => {
    void refreshData();
    if (!supabase) return;
    const channel = supabase
      .channel('trip-shared-updates')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => { void refreshData(); })
      .subscribe((status, subscriptionError) => {
        setRealtimeStatus(status);
        if (status === 'SUBSCRIBED') {
          setRealtimeError('');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeError(subscriptionError?.message ?? 'Les mises à jour en direct sont temporairement indisponibles.');
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [refreshData, supabase]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const coupleNames = useMemo(() => new Map([[1, 'Jop & Nat'], [2, 'Andréa & Alain'], [3, 'Ben & Pas'], [4, 'Jo & Chris'], [everyoneId, 'Tous']]), []);
  const defaultCatcher = participantNames.find((name) => profile?.full_name.trim().toLowerCase().startsWith(name.toLowerCase())) ?? participantNames[0];
  const totalSpent = expenses.reduce((total, expense) => total + Number(expense.amount), 0);
  const packedCount = gear.filter((item) => item.is_packed).length;
  const coupleTotals = [1, 2, 3, 4].map((coupleId) => {
    const paid = expenses.reduce((sum, expense) => sum + (
      expense.paid_by_couple_id === coupleId ? Number(expense.amount) : 0
    ), 0);
    return { coupleId, paid, balance: paid - totalSpent / 4 };
  });
  const settlements = calculateSettlements(coupleTotals);

  async function perform(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setSaving(true);
    setError('');
    try {
      const result = await action();
      if (result.error) {
        setError(result.error.message);
        return false;
      }
      setToast(success);
      await refreshData();
      return true;
    } catch (actionError) {
      setError(getErrorMessage(actionError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const syncPending = useCallback(async () => {
    if (!supabase || syncingRef.current || loadQueue(user.id).length === 0) return;
    syncingRef.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const result = await flushQueue(supabase, user.id);
      if (result.synced > 0) setToast(`${result.synced} modification${result.synced === 1 ? ' synchronisée' : 's synchronisées'}`);
      if (result.failures.length > 0) setError(`Certaines modifications n’ont pas pu être synchronisées : ${result.failures.join(' ; ')}`);
      await refreshData();
    } catch {
      // Still offline: the queue is kept and retried.
    } finally {
      syncingRef.current = false;
    }
  }, [supabase, user.id, refreshData]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => { setOnline(true); void syncPending(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const timer = window.setInterval(() => { void syncPending(); }, 20000);
    void syncPending();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.clearInterval(timer);
    };
  }, [syncPending]);

  // Saves right away when online; otherwise keeps the change on this device and syncs it later.
  async function mutate(input: MutationInput, success: string) {
    if (!supabase) return false;
    setSaving(true);
    setError('');
    try {
      const op: PendingOp = {
        ...input,
        id: randomId(),
        queuedAt: new Date().toISOString(),
        tempId: input.kind === 'insert' || input.kind === 'upsert' ? newTempId() : undefined,
      };
      if (loadQueue(user.id).length === 0 && navigator.onLine) {
        try {
          const result = await executeOp(supabase, op);
          if (!result.error) {
            setToast(success);
            await refreshData();
            return true;
          }
          if (!isNetworkError(result.error.message)) {
            setError(result.error.message);
            return false;
          }
        } catch (thrown) {
          if (!isNetworkError(getErrorMessage(thrown))) {
            setError(getErrorMessage(thrown));
            return false;
          }
        }
      }
      saveQueue(user.id, [...loadQueue(user.id), op]);
      if (baseRef.current) showData(baseRef.current);
      setToast(`${success} · synchronisé au retour du réseau`);
      if (navigator.onLine) void syncPending();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const day = Number(mealDay);
    if (!Number.isInteger(day) || day < 1 || day > 5) {
      setError('Choisissez un jour entre 1 et 5.');
      return;
    }
    const ok = await mutate(
      {
        table: 'meal_plan', kind: 'upsert', onConflict: 'day_number,meal_type',
        values: {
          day_number: day,
          meal_type: mealType,
          assigned_couple_id: mealCouple ? Number(mealCouple) : null,
          menu_details: mealDetails.trim() || null,
          updated_at: new Date().toISOString(),
        },
      },
      'Plan des repas mis à jour',
    );
    if (ok) setMealDetails('');
  }

  async function addGear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !gearName.trim()) return;
    const ok = await mutate(
      {
        table: 'gear_checklist', kind: 'insert',
        values: {
          item_name: gearName.trim(),
          category: gearCategory,
          is_communal: true,
          assigned_couple_id: packingCouple ? Number(packingCouple) : null,
        },
      },
      'Article ajouté à la liste',
    );
    if (ok) {
      setGearName('');
      setPackingCouple('');
    }
  }

  async function updateGear(item: GearItem, change: 'claim' | 'packed') {
    if (!supabase) return;
    const update = change === 'claim'
      ? { claimed_by_user: item.claimed_by_user === user.id ? null : user.id }
      : { is_packed: !item.is_packed };
    await mutate(
      { table: 'gear_checklist', kind: 'update', values: update, matchId: item.id },
      change === 'claim' ? (item.claimed_by_user === user.id ? 'Article désattribué' : 'Article attribué') : 'Liste des bagages mise à jour',
    );
  }

  async function assignGear(item: GearItem, coupleId: string) {
    if (!supabase) return;
    await mutate(
      { table: 'gear_checklist', kind: 'update', values: { assigned_couple_id: coupleId ? Number(coupleId) : null }, matchId: item.id },
      'Responsable de l’article mis à jour',
    );
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const amount = Number(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (!expenseDescription.trim()) {
      setError('Saisissez une description pour cette dépense.');
      return;
    }
    const ok = await mutate(
      {
        table: 'expenses', kind: 'insert',
        values: {
          description: expenseDescription.trim(),
          amount,
          paid_by_user: user.id,
          paid_by_couple_id: Number(expenseCouple || profile?.couple_id),
          split_type: 'equal',
          category: expenseCategory,
        },
      },
      'Dépense ajoutée',
    );
    if (ok) {
      setExpenseDescription('');
      setExpenseAmount('');
      setExpenseCouple('');
    }
  }

  async function addGrocery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !groceryName.trim()) return;
    const ok = await mutate(
      {
        table: 'grocery_items', kind: 'insert',
        values: {
          item_name: groceryName.trim(),
          quantity: groceryQuantity.trim(),
          assigned_couple_id: groceryCouple ? Number(groceryCouple) : null,
        },
      },
      'Article ajouté à la liste d’épicerie',
    );
    if (ok) {
      setGroceryName('');
      setGroceryQuantity('');
    }
  }

  async function updateGrocery(item: GroceryItem) {
    if (!supabase) return;
    await mutate(
      { table: 'grocery_items', kind: 'update', values: { is_bought: !item.is_bought }, matchId: item.id },
      item.is_bought ? 'Article décoché' : 'Article marqué comme acheté',
    );
  }

  async function deleteGrocery(item: GroceryItem) {
    if (!supabase) return;
    await mutate({ table: 'grocery_items', kind: 'delete', matchId: item.id }, 'Article retiré de la liste');
  }

  async function addCatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const weight = catchUnknownWeight ? null : Number(catchWeight.replace(',', '.'));
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0)) {
      setError('Entrez un poids valide en kg, ou cochez « Poids inconnu ».');
      return;
    }
    const ok = await mutate(
      {
        table: 'fish_catches', kind: 'insert',
        values: {
          species: catchSpecies,
          weight_kg: weight,
          location: catchLocation.trim(),
          caught_by: catchPerson || defaultCatcher,
          released: catchReleased,
        },
      },
      'Prise ajoutée au journal',
    );
    if (ok) {
      setCatchWeight('');
      setCatchUnknownWeight(false);
      setCatchReleased(false);
    }
  }

  async function deleteCatch(item: FishCatch) {
    if (!supabase) return;
    await mutate({ table: 'fish_catches', kind: 'delete', matchId: item.id }, 'Prise retirée du journal');
  }

  async function saveTripDetails(
    table: 'trip_logistics' | 'fishing_notes' | 'safety_info',
    values: Record<string, string>,
    success: string,
  ) {
    if (!supabase) return;
    await mutate(
      { table, kind: 'upsert', values: { id: 1, ...values, updated_at: new Date().toISOString() } },
      success,
    );
  }

  async function refreshPhotos() {
    if (!supabase) return;
    const client = supabase;
    const paths: string[] = [];
    async function listFolder(folder = ''): Promise<void> {
      let offset = 0;
      while (true) {
        const { data, error: listError } = await client.storage.from(tripPhotoBucket).list(folder, {
          limit: 100,
          offset,
          sortBy: { column: 'created_at', order: 'desc' },
        });
        if (listError) throw listError;
        for (const entry of data ?? []) {
          const path = folder ? `${folder}/${entry.name}` : entry.name;
          if (entry.id === null) await listFolder(path);
          else paths.push(path);
        }
        if (!data || data.length < 100) break;
        offset += data.length;
      }
    }
    try {
      await listFolder();
      const signed = await Promise.all(paths.map(async (path) => {
        const { data, error: urlError } = await client.storage.from(tripPhotoBucket).createSignedUrl(path, 3600);
        if (urlError) throw urlError;
        return { path, url: data.signedUrl };
      }));
      setPhotos(signed);
    } catch (photoError) {
      setError(`Impossible de charger les photos : ${getErrorMessage(photoError)}`);
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!supabase || !files?.length) return;
    if (!navigator.onLine) {
      setError('Les photos demandent une connexion Internet. Réessayez quand vous aurez du réseau.');
      return;
    }
    setSaving(true);
    setError('');
    let uploadedAny = false;
    try {
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error('Format non pris en charge. Utilisez JPG, PNG, WebP ou GIF.');
        }
        if (file.size > 10 * 1024 * 1024) throw new Error('Chaque photo doit faire 10 Mo ou moins.');
        const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${user.id}/${randomId()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(tripPhotoBucket).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedAny = true;
      }
      setToast('Photos téléversées et partagées avec le groupe');
      await refreshPhotos();
    } catch (photoError) {
      if (uploadedAny) await refreshPhotos();
      setError(`Impossible de téléverser les photos : ${getErrorMessage(photoError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deletePhoto(photo: TripPhoto) {
    if (!supabase || !photo.path.startsWith(`${user.id}/`)) return;
    setSaving(true);
    setError('');
    try {
      const { error: removeError } = await supabase.storage.from(tripPhotoBucket).remove([photo.path]);
      if (removeError) throw removeError;
      await refreshPhotos();
      setToast('Photo supprimée');
    } catch (photoError) {
      setError(`Impossible de supprimer la photo : ${getErrorMessage(photoError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!supabase) return;
    await mutate(
      { table: 'expenses', kind: 'delete', matchId: expense.id },
      'Dépense supprimée',
    );
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const fullName = nameDraft.trim();
    if (!fullName) {
      setError('Votre nom ne peut pas être vide.');
      return;
    }
    await perform(
      () => supabase.from('profiles').update({ full_name: fullName }).eq('id', profile.id),
      'Profil mis à jour',
    );
  }

  if (loading) {
    return <main className="center-stage"><div className="loading-mark"><span className="brand-mark">LG</span><p>Préparation du voyage…</p></div></main>;
  }

  if (!profile) {
    return (
      <main className="center-stage">
        <section className="notice-card">
          <span className="eyebrow">Configuration du participant</span>
          <h1>Impossible de charger votre profil de voyage.</h1>
          <p>{error || 'Demandez à la personne qui organise le voyage de vous ajouter à la liste des participants.'}</p>
          <button className="button button-outline" onClick={onSignOut}>Se déconnecter</button>
        </section>
      </main>
    );
  }

  const groupedGear = gear.reduce<Record<string, GearItem[]>>((groups, item) => {
    (groups[item.category] ??= []).push(item);
    return groups;
  }, {});

  return (
    <main className="dashboard">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <div className="user-chip"><span className="avatar">{profile.full_name.slice(0, 1).toUpperCase()}</span><span>{profile.full_name}<small>{coupleNames.get(profile.couple_id) ?? `Couple ${profile.couple_id}`}</small></span></div>
            <button className="icon-button" onClick={onSignOut} aria-label="Se déconnecter" title="Se déconnecter">↗</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>Des lignes à l’eau.<br /><em>Des souvenirs à raconter.</em></h1>
          <p>Réservoir Gouin · Du 2 au 6 août 2027</p>
        </div>
        {countdownDays !== null && (
          <div className="hero-stats" aria-label={`Départ dans ${countdownDays} jours`}>
            <div><span className="stat-number">{countdownDays}</span><span className="stat-label">Jours</span></div>
          </div>
        )}
        <div className="sun-disc" aria-hidden="true" />
        <a className="hero-logo" href="https://pourvoirielagalette.ca/" target="_blank" rel="noreferrer" aria-label="Site de la Pourvoirie Rivière La Galette">
          <img src="/pourvoirie/logo.png" alt="Pourvoirie Rivière La Galette" />
        </a>
      </section>

      <nav className="tabbar" aria-label="Sections du voyage">
        {([
          ['logistics', '01', 'Logistique'],
          ['gear', '02', 'Bagages'],
          ['beforeYouGo', '03', 'À faire'],
          ['groceries', '04', 'Épicerie'],
          ['meals', '05', 'Repas'],
          ['fishing', '06', 'Pêche'],
          ['expenses', '07', 'Dépenses'],
          ['photos', '08', 'Photos'],
          ['map', '09', 'Carte'],
          ['pourvoirie', '10', 'Pourvoirie'],
          ['safety', '11', 'Sécurité'],
        ] as const).map(([key, number, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? 'tab-active' : ''}`}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            <span className="tab-number">{number}</span>{label}
            {tab === key && <span className="tab-arrow" aria-hidden="true">↗</span>}
          </button>
        ))}
      </nav>

      {(!online || pendingCount > 0) && (
        <div className="offline-banner" role="status">
          {!online
            ? `Hors ligne : vos modifications sont gardées sur cet appareil${pendingCount > 0 ? ` (${pendingCount} en attente)` : ''} et seront synchronisées au retour du réseau.`
            : `${pendingCount} modification${pendingCount === 1 ? '' : 's'} en attente de synchronisation…`}
        </div>
      )}

      {(error || (online && realtimeError)) && <div className="alert" role="alert"><span>{error || realtimeError}</span><button onClick={() => { setError(''); setRealtimeError(''); }} aria-label="Fermer le message d’erreur">×</button></div>}

      <section className="content-grid">
        <div className="main-column">
          {tab === 'logistics' && (
            <section className="section-block">
              <div className="section-heading"><div><span className="eyebrow">Aller et revenir</span><h2>Logistique du voyage</h2></div></div>
              <InfoLines items={[
                ['Départ', logistics?.departure_details], ['Retour', logistics?.return_details],
                ['Lieu de rencontre', logistics?.meeting_place], ['Transport et covoiturage', logistics?.transport_plan],
              ]} />
            </section>
          )}

          {tab === 'meals' && (
            <section className="section-block">
              <div className="section-heading">
                <div><span className="eyebrow">Autour de la table</span><h2>Plan des repas</h2></div>
                <span className="section-count">{meals.length} PLANIFIÉ{meals.length === 1 ? '' : 'S'}</span>
              </div>
              <p className="side-note">Du lundi 2 au vendredi 6 août 2027. Les menus restent à déterminer.</p>
              <div className="meal-days">
                {Array.from({ length: 5 }, (_, index) => index + 1).map((day) => {
                  const date = new Date(Date.UTC(2027, 7, day + 1));
                  const dayLabel = new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
                  return (
                    <div className="meal-day-group" key={day}>
                      <h3 className="meal-day-heading"><span>Jour {day}</span>{dayLabel}</h3>
                      <div className="meal-list">
                        {(['Breakfast', 'Lunch', 'Dinner'] as const).map((type) => {
                          const meal = meals.find((item) => item.day_number === day && item.meal_type === type);
                          return (
                            <article className="meal-card" key={`${day}-${type}`}>
                              <div className="meal-content"><span className="meal-type">{mealTypeLabels[type]}</span><h3>{meal?.menu_details || 'Menu à déterminer'}</h3></div>
                              <span className={`couple-tag couple-${meal?.assigned_couple_id ?? 1}`}>{meal?.assigned_couple_id ? coupleNames.get(meal.assigned_couple_id) : 'À déterminer'}</span>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tab === 'gear' && (
            <section className="section-block">
              <div className="section-heading">
                <div><span className="eyebrow">Apportons l’essentiel</span><h2>Liste des bagages</h2></div>
                <span className="section-count">{packedCount} SUR {gear.length} PRÊT{gear.length > 1 ? 'S' : ''}</span>
              </div>
              {gear.length === 0 ? <EmptyState title="Tout reste à préparer." copy="Ajoutez les articles communs pour que chacun sache quoi apporter." /> : (
                <div className="gear-groups">
                  {Object.entries(groupedGear).map(([category, items]) => (
                    <div className="gear-group" key={category}>
                      <h3 className="group-title">{gearCategoryLabels[category] ?? category}<span>{items.length}</span></h3>
                      <div className="gear-list">
                        {items.map((item) => {
                          const claimant = item.claimed_by_user ? profileById.get(item.claimed_by_user) : null;
                          return (
                            <article className={`gear-row ${item.is_packed ? 'is-packed' : ''}`} key={item.id}>
                              <button className={`check-button ${item.is_packed ? 'checked' : ''}`} onClick={() => void updateGear(item, 'packed')} aria-label={item.is_packed ? `Marquer ${item.item_name} comme non emballé` : `Marquer ${item.item_name} comme prêt`} disabled={saving}><span>✓</span></button>
                              <span className="gear-name">{item.item_name}<small>{item.assigned_couple_id === everyoneId ? 'Chacun doit l’apporter' : item.assigned_couple_id ? `Apporté par ${coupleNames.get(item.assigned_couple_id)}` : claimant ? `Apporté par ${claimant.full_name}` : 'Couple responsable à déterminer'}</small></span>
                              <select className="gear-assignee" aria-label={`Couple responsable de ${item.item_name}`} value={item.assigned_couple_id ?? ''} onChange={(event) => void assignGear(item, event.target.value)} disabled={saving}>
                                <option value="">À déterminer</option>
                                {assigneeIds.map((id) => <option key={id} value={id}>{coupleNames.get(id)}</option>)}
                              </select>
                              <button
                                className={`claim-button ${item.claimed_by_user === user.id ? 'claimed-by-me' : ''}`}
                                onClick={() => void updateGear(item, 'claim')}
                                disabled={saving || (!!item.claimed_by_user && item.claimed_by_user !== user.id)}
                                title={item.claimed_by_user && item.claimed_by_user !== user.id ? `Attribué à ${claimant?.full_name ?? 'un autre participant'}` : undefined}
                              >
                                {item.claimed_by_user === user.id ? 'Désattribuer' : item.claimed_by_user ? 'Attribué' : 'Je l’apporte'}
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'beforeYouGo' && (
            <section className="section-block">
              <div className="section-heading">
                <div><span className="eyebrow">Les préparatifs avant de partir</span><h2>À faire avant le voyage</h2></div>
              </div>
              <p className="side-note before-you-go-intro">Quelques rappels pour préparer le groupe et le trajet vers le réservoir Gouin, où le réseau cellulaire peut être limité.</p>
              <div className="reminder-groups">
                {beforeYouGoGroups.map(({ title, reminders }) => (
                  <section className="reminder-group" key={title}>
                    <h3>{title}</h3>
                    <ul>
                      {reminders.map((reminder) => <li key={reminder}>{reminder}</li>)}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          )}

          {tab === 'groceries' && (
            <section className="section-block">
              <div className="section-heading"><div><span className="eyebrow">Planifier les repas, puis magasiner</span><h2>Liste d’épicerie</h2></div><span className="section-count">{groceries.filter((item) => item.is_bought).length} SUR {groceries.length} ACHETÉS</span></div>
              {groceries.length === 0 ? <EmptyState title="La liste est prête." copy="Ajoutez les aliments et fournitures nécessaires aux repas." /> : (
                <div className="gear-list">
                  {groceries.map((item) => (
                    <article className={`gear-row ${item.is_bought ? 'is-packed' : ''}`} key={item.id}>
                      <button className={`check-button ${item.is_bought ? 'checked' : ''}`} onClick={() => void updateGrocery(item)} aria-label={item.is_bought ? `Décocher ${item.item_name}` : `Marquer ${item.item_name} comme acheté`} disabled={saving}><span>✓</span></button>
                      <span className="gear-name">{item.item_name}<small>{[item.quantity, item.assigned_couple_id ? `Achats : ${coupleNames.get(item.assigned_couple_id)}` : 'Personne responsable à déterminer'].filter(Boolean).join(' · ')}</small></span>
                      <button className="claim-button" onClick={() => void deleteGrocery(item)} disabled={saving} aria-label={`Retirer ${item.item_name}`}>Retirer</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'fishing' && (
            <section className="section-block">
              <div className="section-heading"><div><span className="eyebrow">Ce qu’on a sorti de l’eau</span><h2>Journal de pêche</h2></div><span className="section-count">{catches.length} PRISE{catches.length === 1 ? '' : 'S'}</span></div>
              {catches.length > 0 && (() => {
                const weighed = catches.filter((item) => item.weight_kg !== null);
                const totalKg = weighed.reduce((sum, item) => sum + Number(item.weight_kg), 0);
                const biggest = weighed.reduce<FishCatch | null>((best, item) => (!best || Number(item.weight_kg) > Number(best.weight_kg) ? item : best), null);
                const bySpecies = new Map<string, number>();
                catches.forEach((item) => bySpecies.set(item.species, (bySpecies.get(item.species) ?? 0) + 1));
                return (
                  <div className="catch-stats">
                    <div><span>POIDS TOTAL</span><strong>{totalKg.toFixed(1)} kg</strong></div>
                    <div><span>PLUS GROSSE PRISE</span><strong>{biggest ? `${Number(biggest.weight_kg).toFixed(1)} kg` : '—'}</strong><small>{biggest?.species}</small></div>
                    <div><span>PAR ESPÈCE</span><small>{[...bySpecies].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} : ${count}`).join(' · ')}</small></div>
                  </div>
                );
              })()}
              {catches.length === 0 ? <EmptyState title="Aucune prise pour l’instant." copy="Ajoutez chaque poisson pêché : espèce, poids et endroit." /> : (
                <div className="gear-list">
                  {catches.map((item) => (
                    <article className="gear-row" key={item.id}>
                      <span className="catch-weight">{item.weight_kg === null ? '?' : `${Number(item.weight_kg).toFixed(1)}`}<small>{item.weight_kg === null ? 'poids inconnu' : 'kg'}</small></span>
                      <span className="gear-name">{item.species}{item.released ? ' · remis à l’eau' : ''}<small>{[item.location, item.caught_by || (item.caught_by_couple_id ? coupleNames.get(item.caught_by_couple_id) : ''), new Date(item.created_at).toLocaleString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</small></span>
                      <button className="claim-button" onClick={() => void deleteCatch(item)} disabled={saving} aria-label={`Retirer la prise ${item.species}`}>Retirer</button>
                    </article>
                  ))}
                </div>
              )}
              <details className="prep-notes">
                <summary>Notes de préparation (espèces visées, permis, matériel)</summary>
                <InfoLines items={[
                  ['Espèces visées', fishingNotes?.target_species], ['Rappel pour les permis', fishingNotes?.license_reminders],
                  ['Leurres et matériel', fishingNotes?.bait_tackle_notes], ['Notes locales', fishingNotes?.local_notes],
                ]} />
                <p className="side-note">Vérifiez les règles officielles, les permis, les saisons et les limites de prises en vigueur au Québec avant le départ.</p>
              </details>
            </section>
          )}

          {tab === 'expenses' && (
            <section className="section-block">
              <div className="section-heading">
                <div><span className="eyebrow">Simple et équitable</span><h2>Dépenses partagées</h2></div>
                <span className="section-count">{expenses.length} ENTRÉE{expenses.length === 1 ? '' : 'S'}</span>
              </div>
              <div className="expense-summary">
                <div className="expense-total"><span>TOTAL DU VOYAGE</span><strong>{money(totalSpent)}</strong><small>{money(totalSpent / 4)} par couple jusqu’ici</small></div>
                <div className="couple-balances">
                  {coupleTotals.map(({ coupleId, paid, balance }) => (
                    <div className="balance-row" key={coupleId}>
                      <span>{coupleNames.get(coupleId)}</span><span>{money(paid)} payé</span>
                      <strong className={balance >= 0 ? 'positive-balance' : 'negative-balance'}>{balance >= 0 ? '+' : '−'}{money(Math.abs(balance))}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="info-card settlement-card">
                <h3>Remboursements suggérés</h3>
                <p>Répartition indicative des dépenses inscrites, partagées également entre les quatre couples.</p>
                {settlements.length ? settlements.map((transfer) => (
                  <div className="balance-row" key={`${transfer.from}-${transfer.to}`}>
                    <span>{coupleNames.get(transfer.from)} rembourse {coupleNames.get(transfer.to)}</span><strong>{money(transfer.amount)}</strong>
                  </div>
                )) : <p className="side-note">Les comptes sont équilibrés pour le moment.</p>}
              </div>
              {expenses.length === 0 ? <EmptyState title="Aucune dépense pour l’instant." copy="Ajoutez les frais au fur et à mesure. Le partage égal restera affiché." /> : (
                <div className="expense-list">
                  {expenses.map((expense) => {
                    const payer = expense.paid_by_user ? profileById.get(expense.paid_by_user) : null;
                    return (
                      <article className="expense-row" key={expense.id}>
                        <span className="expense-icon" aria-hidden="true">↗</span>
                        <span className="expense-description">{expense.description}<small>{expense.category} · {coupleNames.get(expense.paid_by_couple_id ?? payer?.couple_id ?? 0) ?? payer?.full_name ?? 'Participant'} · {new Intl.DateTimeFormat('fr-CA', { month: 'short', day: 'numeric' }).format(new Date(expense.created_at))}</small></span>
                        <strong>{money(Number(expense.amount))}</strong>
                        {expense.paid_by_user === user.id && <button className="delete-button" onClick={() => void deleteExpense(expense)} disabled={saving} aria-label={`Supprimer ${expense.description}`}>×</button>}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

              {tab === 'photos' && (
                <section className="section-block">
                  <div className="section-heading"><div><span className="eyebrow">De beaux moments à partager</span><h2>Photos du voyage</h2></div><span className="section-count">{photos.length} PHOTO{photos.length === 1 ? '' : 'S'}</span></div>
                  <p className="side-note">Les photos téléversées sont privées et visibles seulement par les participants connectés.</p>
                  <div className="listing-photos">
                    <h3>Visite du bateau-maison</h3>
                    <div className="photo-grid">
                      {[
                        ['houseboat-front.jpg', 'Le bateau-maison'],
                        ['houseboat-beach.jpg', 'Chaloupes et bateau-maison'],
                        ['houseboat-deck.jpg', 'Le pont'],
                        ['houseboat-night.jpg', 'Sous les étoiles'],
                      ].map(([file, label]) => (
                        <article className="photo-card" key={file}>
                          <img src={`/houseboat/${file}`} alt={label} />
                          <p>{label}</p>
                        </article>
                      ))}
                    </div>
                    <h3>Ce qu’on espère pêcher</h3>
                    <div className="photo-grid">
                      {[
                        ['brochet.jpg', 'Grand brochet'],
                        ['brochet-peinture.jpg', 'Brochet (peinture de Bob Hines)'],
                        ['dore.jpg', 'Doré jaune'],
                        ['dore-2.jpg', 'Doré jaune'],
                      ].map(([file, label]) => (
                        <article className="photo-card" key={file}>
                          <img src={`/fish/${file}`} alt={label} />
                          <p>{label}</p>
                        </article>
                      ))}
                    </div>
                    <p className="side-note">Photos de poissons du domaine public (Wikimedia Commons, NARA, USFWS).</p>
                  </div>
                  {photos.length ? <div className="photo-grid">{photos.map((photo) => (
                    <article className="photo-card" key={photo.path}>
                      <img src={photo.url} alt="Photo du voyage au réservoir Gouin" />
                      {photo.path.startsWith(`${user.id}/`) && <button className="claim-button" onClick={() => void deletePhoto(photo)} disabled={saving}>Supprimer</button>}
                    </article>
                  ))}</div> : <EmptyState title="L’album est prêt." copy="Ajoutez les photos du lac, des prises et de vos souvenirs à bord." />}
                  <label className="upload-label">Ajouter des photos
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving} onChange={(event) => { void uploadPhotos(event.target.files); event.currentTarget.value = ''; }} />
                  </label>
                  <p className="side-note">Images JPG, PNG, WebP ou GIF · 10 Mo maximum par photo.</p>
                </section>
              )}

              {tab === 'map' && (
                <section className="section-block">
                  <div className="section-heading"><div><span className="eyebrow">Repérez votre coin de lac</span><h2>Réservoir Gouin</h2></div><span className="section-count">QUÉBEC, CANADA</span></div>
                  <iframe className="trip-map" title="Carte Google Maps du point de départ, Pourvoirie Rivière La Galette" src="https://maps.google.com/maps?q=48.27471,-74.461628&z=14&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  <p className="side-note">Point de départ : Pourvoirie Rivière La Galette (48°16′29″ N, 74°27′42″ O). Ne sert pas à la navigation; confirmez l’itinéraire et la mise à l’eau auprès du responsable de la location.</p>
                  <a className="map-link" href="https://www.google.com/maps/search/?api=1&query=48.27471,-74.461628" target="_blank" rel="noreferrer">Ouvrir dans Google Maps ↗</a>
                  <a className="map-link" href="https://pourvoirielagalette.ca/" target="_blank" rel="noreferrer">Site de la Pourvoirie Rivière La Galette ↗</a>
                </section>
              )}

              {tab === 'pourvoirie' && (
                <section className="section-block">
                  <div className="section-heading"><div><span className="eyebrow">Notre base au Réservoir Gouin</span><h2>Pourvoirie Rivière La Galette</h2></div></div>
                  <a className="map-link" href="https://pourvoirielagalette.ca/" target="_blank" rel="noreferrer">Site officiel de la pourvoirie ↗</a>

                  <h3 className="info-subheading">Notre réservation : bateau-maison « Catherine »</h3>
                  <InfoLines items={[
                    ['Séjour', 'Du 2 au 6 août 2027 · 8 personnes · forfait journalier (début de saison)'],
                    ['Hébergement', 'Bateau-maison avec 4 chambres fermées, capacité maximale de 8 personnes'],
                    ['Inclus', 'Droit de pêche journalier au réservoir Gouin · génératrice 2500 watts · 1 chaloupe de 16′ en aluminium avec 1 moteur (15 ou 20 c.v.) par 2 adultes · 1 congélateur 110 V à l’extérieur · couverture Hélico Secours durant le séjour à la pourvoirie'],
                    ['Arrivée / départ', 'Prise de possession à 13 h · retour au plus tard à 9 h'],
                    ['Attention',  'Essence à acheter à la pourvoirie · literie, oreillers, papier hygiénique et linge à vaisselle non fournis · eau non potable (prévoir des réserves) · vers et sangsues en vente à la pourvoirie · tous les bris aux équipements sont aux frais des clients'],
                  ]} />

                  <h3 className="info-subheading">Le bateau-maison (forfaits en général)</h3>
                  <div className="pourvoirie-columns">
                    <div>
                      <strong className="list-title list-yes">Tous les forfaits bateaux-maisons incluent</strong>
                      <ul className="plain-list">
                        {['Sonar', 'GPS/sonar, carte bathymétrique', 'Ancre pour les chaloupes', 'Cuisine équipée', 'Cuisinière au propane, BBQ', 'Réfrigérateur à l’énergie solaire', 'Congélateur (génératrice en location)', 'Éclairage à l’énergie solaire', 'Toilette, douche, eau chaude', 'Système de radiocommunication avec la base', 'Trousse de premiers soins', 'Moteur Mercury 4 temps (STANDARD : 40 hp / DELUXE : 50 hp)', 'Lits simples superposés (STANDARD) ou lits simples (DELUXE)', 'Droits d’accès inclus (sauf forfait VIP)'].map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <strong className="list-title list-no">Non inclus : à apporter</strong>
                      <ul className="plain-list">
                        {['Literie (non disponible)', 'Vestes de sauvetage', 'Eau potable', 'Essence', 'Vers et sangsues'].map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </section>
              )}

              {tab === 'safety' && (
                <section className="section-block">
                  <div className="section-heading"><div><span className="eyebrow">Mieux vaut être préparés</span><h2>Sécurité et contacts</h2></div></div>
                  <InfoLines items={[
                    ['Responsable de la location', safetyInfo?.operator_contact], ['Services médicaux et d’urgence', safetyInfo?.medical_services],
                    ['Contacts d’urgence', safetyInfo?.emergency_contacts], ['Consignes du bateau et d’urgence', safetyInfo?.boat_instructions],
                  ]} />
                  <p className="side-note">Confirmez les consignes, les coordonnées et le plan d’urgence auprès du responsable avant le départ.</p>
                </section>
              )}
        </div>

        <aside className="sidebar">
          {tab === 'map' && (
            <div className="side-card directions-card">
              <span className="eyebrow">Départ de Gatineau · 420 km</span><h3>Comment s’y rendre</h3>
              <p className="side-note">Route 309 Nord jusqu’à Mont-Laurier, tout droit sur la 309 Nord jusqu’à Mont-Saint-Michel, puis direction Parent. À Parent, à l’intersection (dépanneur), tout droit direction barrage Gouin jusqu’au km 53. Tourner à gauche au panneau de la pourvoirie (3,5 km).</p>
              <p className="side-note"><strong>Avertissement :</strong> ne pas utiliser un GPS sur les routes gravelées au risque de vous perdre. Suivez les indications fournies par la pourvoirie.</p>
            </div>
          )}

          {tab === 'logistics' && (
            <form className="side-card" onSubmit={(event) => { event.preventDefault(); void saveTripDetails('trip_logistics', logisticsDraft, 'Logistique mise à jour'); }}>
              <span className="eyebrow">Aller et revenir</span><h3>Ajouter les détails</h3>
              <label>Date et heure de départ<input value={logisticsDraft.departure_details} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, departure_details: event.target.value })} placeholder="2 août · heure à confirmer" /></label>
              <label>Date et heure du retour<input value={logisticsDraft.return_details} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, return_details: event.target.value })} placeholder="6 août · heure à confirmer" /></label>
              <label>Lieu de rencontre<input value={logisticsDraft.meeting_place} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, meeting_place: event.target.value })} placeholder="Adresse ou point de repère" /></label>
              <label>Transport et covoiturage<textarea rows={2} value={logisticsDraft.transport_plan} onChange={(event) => setLogisticsDraft({ ...logisticsDraft, transport_plan: event.target.value })} placeholder="Conducteurs, places, points de rencontre" /></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Enregistrer la logistique <span>↗</span></button>
            </form>
          )}

          {tab === 'meals' && (
            <form className="side-card" onSubmit={saveMeal}>
              <span className="eyebrow">À table!</span><h3>Ajouter au menu</h3>
              <label>Jour du voyage<input type="number" min="1" max="5" step="1" value={mealDay} onChange={(event) => setMealDay(event.target.value)} required /></label>
              <label>Repas<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>{(['Breakfast', 'Lunch', 'Dinner'] as const).map((type) => <option key={type} value={type}>{mealTypeLabels[type]}</option>)}</select></label>
              <label>Couple responsable<select value={mealCouple} onChange={(event) => setMealCouple(event.target.value)}><option value="">À déterminer</option>{assigneeIds.map((id) => <option key={id} value={id}>{coupleNames.get(id)}</option>)}</select></label>
              <label>Qu’y a-t-il au menu?<textarea value={mealDetails} onChange={(event) => setMealDetails(event.target.value)} placeholder="Tacos au bord du lac…" rows={3} /></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Enregistrer le repas <span>↗</span></button>
              <p className="side-note">Un repas par jour et par type. Modifier un créneau existant met à jour le menu pour tout le monde.</p>
            </form>
          )}

          {tab === 'gear' && (
            <form className="side-card" onSubmit={addGear}>
              <span className="eyebrow">Ne rien oublier</span><h3>Ajouter un article commun</h3>
              <label>Nom de l’article<input value={gearName} onChange={(event) => setGearName(event.target.value)} placeholder="Réchaud de camping" required /></label>
              <label>Catégorie<select value={gearCategory} onChange={(event) => setGearCategory(event.target.value)}>{gearCategories.map((category) => <option key={category} value={category}>{gearCategoryLabels[category]}</option>)}</select></label>
              <label>Couple responsable<select value={packingCouple} onChange={(event) => setPackingCouple(event.target.value)}><option value="">À déterminer</option>{assigneeIds.map((id) => <option key={id} value={id}>{coupleNames.get(id)}</option>)}</select></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Ajouter à la liste <span>↗</span></button>
              <p className="side-note">Attribuez l’article quand vous pouvez l’apporter. Cochez-le une fois dans la voiture.</p>
            </form>
          )}

          {tab === 'groceries' && (
            <form className="side-card" onSubmit={addGrocery}>
              <span className="eyebrow">Planifier les repas, puis magasiner</span><h3>Ajouter à l’épicerie</h3>
              <label>Aliment ou fourniture<input value={groceryName} onChange={(event) => setGroceryName(event.target.value)} placeholder="Café, œufs, eau potable" required /></label>
              <label>Quantité ou détails<input value={groceryQuantity} onChange={(event) => setGroceryQuantity(event.target.value)} placeholder="Facultatif" /></label>
              <label>Couple responsable des achats<select value={groceryCouple} onChange={(event) => setGroceryCouple(event.target.value)}><option value="">À déterminer</option>{assigneeIds.map((id) => <option key={id} value={id}>{coupleNames.get(id)}</option>)}</select></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Ajouter à la liste <span>↗</span></button>
            </form>
          )}

          {tab === 'fishing' && (
            <>
            <form className="side-card" onSubmit={(event) => void addCatch(event)}>
              <span className="eyebrow">Une belle prise ?</span><h3>Ajouter une prise</h3>
              <label>Espèce<select value={catchSpecies} onChange={(event) => setCatchSpecies(event.target.value)}>{[...fishSpecies, otherSpecies].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label>Poids (kg)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={catchWeight} onChange={(event) => setCatchWeight(event.target.value)} placeholder="Ex. 2.5" disabled={catchUnknownWeight} required={!catchUnknownWeight} /></label>
              <label className="species-option"><input type="checkbox" checked={catchUnknownWeight} onChange={(event) => setCatchUnknownWeight(event.target.checked)} />Poids inconnu (petit poisson)</label>
              <label>Endroit<input value={catchLocation} onChange={(event) => setCatchLocation(event.target.value)} placeholder="Baie, île, point, profondeur…" list="catch-locations" /></label>
              <datalist id="catch-locations">{[...new Set(catches.map((item) => item.location).filter(Boolean))].map((name) => <option key={name} value={name} />)}</datalist>
              <label>Pêché par<select value={catchPerson || defaultCatcher} onChange={(event) => setCatchPerson(event.target.value)}>{participantNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label className="species-option"><input type="checkbox" checked={catchReleased} onChange={(event) => setCatchReleased(event.target.checked)} />Remis à l’eau</label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Ajouter au journal <span>↗</span></button>
            </form>
            <details className="side-card profile-details">
            <summary>Modifier les notes de préparation</summary>
            <form onSubmit={(event) => { event.preventDefault(); void saveTripDetails('fishing_notes', fishingDraft, 'Notes de pêche mises à jour'); }}>
              <span className="eyebrow">Préparer la sortie</span><h3>Modifier les notes</h3>
              <fieldset className="species-picker">
                <legend>Espèces visées</legend>
                {fishSpecies.map((species) => {
                  const selected = fishingDraft.target_species.split(',').map((name) => name.trim()).filter(Boolean);
                  return (
                    <label className="species-option" key={species}>
                      <input
                        type="checkbox"
                        checked={selected.includes(species)}
                        onChange={(event) => setFishingDraft({
                          ...fishingDraft,
                          target_species: (event.target.checked ? [...selected, species] : selected.filter((name) => name !== species)).join(', '),
                        })}
                      />
                      {species}
                    </label>
                  );
                })}
              </fieldset>
              <label>Rappels pour les permis<textarea rows={2} value={fishingDraft.license_reminders} onChange={(event) => setFishingDraft({ ...fishingDraft, license_reminders: event.target.value })} /></label>
              <label>Leurres et matériel<textarea rows={2} value={fishingDraft.bait_tackle_notes} onChange={(event) => setFishingDraft({ ...fishingDraft, bait_tackle_notes: event.target.value })} /></label>
              <label>Idées et notes locales<textarea rows={3} value={fishingDraft.local_notes} onChange={(event) => setFishingDraft({ ...fishingDraft, local_notes: event.target.value })} /></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Enregistrer les notes <span>↗</span></button>
              <p className="side-note">Vérifiez les règles officielles, les permis et les limites en vigueur avant le départ.</p>
            </form>
            </details>
            </>
          )}

          {tab === 'safety' && (
            <form className="side-card" onSubmit={(event) => { event.preventDefault(); void saveTripDetails('safety_info', safetyDraft, 'Consignes de sécurité mises à jour'); }}>
              <span className="eyebrow">Mieux vaut être préparés</span><h3>Consignes et contacts</h3>
              <label>Responsable de la location et coordonnées<input value={safetyDraft.operator_contact} onChange={(event) => setSafetyDraft({ ...safetyDraft, operator_contact: event.target.value })} /></label>
              <label>Services médicaux et d’urgence<textarea rows={2} value={safetyDraft.medical_services} onChange={(event) => setSafetyDraft({ ...safetyDraft, medical_services: event.target.value })} /></label>
              <label>Contacts d’urgence<textarea rows={2} value={safetyDraft.emergency_contacts} onChange={(event) => setSafetyDraft({ ...safetyDraft, emergency_contacts: event.target.value })} /></label>
              <label>Consignes du bateau et plan d’urgence<textarea rows={3} value={safetyDraft.boat_instructions} onChange={(event) => setSafetyDraft({ ...safetyDraft, boat_instructions: event.target.value })} /></label>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Enregistrer les consignes <span>↗</span></button>
              <p className="side-note">Ces détails ne sont accessibles qu’aux participants connectés. Confirmez les consignes avec le responsable de la location.</p>
            </form>
          )}

          {tab === 'expenses' && (
            <form className="side-card" onSubmit={addExpense}>
              <span className="eyebrow">Les comptes, en toute simplicité</span><h3>Ajouter une dépense</h3>
              <label>À quoi correspond la dépense?<input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Épicerie, bois de chauffage…" required /></label>
              <label>Catégorie<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}>{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Montant (CAD)<div className="amount-input"><span>$</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0,00" required /></div></label>
              <label>Couple qui a payé<select value={expenseCouple || String(profile.couple_id)} onChange={(event) => setExpenseCouple(event.target.value)}>{[1, 2, 3, 4].map((id) => <option key={id} value={id}>{coupleNames.get(id)}</option>)}</select></label>
              <p className="payer-note">Partagé également entre les quatre couples</p>
              <button className="button button-dark button-full" type="submit" disabled={saving}>Ajouter la dépense <span>↗</span></button>
            </form>
          )}

          {tab === 'photos' && (
            <div className="side-card">
              <span className="eyebrow">De beaux moments à partager</span><h3>Ajouter des photos</h3>
              <label className="upload-label">Choisir des photos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={saving} onChange={(event) => { void uploadPhotos(event.target.files); event.currentTarget.value = ''; }} /></label>
              <p className="side-note">Formats JPG, PNG, WebP ou GIF · 10 Mo maximum par photo.</p>
            </div>
          )}

          <details className="profile-details">
            <summary>Mon profil</summary>
            <form className="side-card profile-card" onSubmit={saveName}>
              <span className="eyebrow">Vos renseignements</span><h3>Profil du participant</h3>
              <label>Votre nom<input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} required /></label>
              <div className="profile-couple"><span>VOTRE COUPLE</span><strong>{coupleNames.get(profile.couple_id) ?? `Couple ${profile.couple_id}`}</strong></div>
              <button className="button button-outline button-full" type="submit" disabled={saving}>Enregistrer le profil</button>
            </form>
          </details>
        </aside>
      </section>

      <footer className="footer"><Brand /><span>Pour les kilomètres et les souvenirs à venir.</span><span>SYNCHRO {realtimeStatus === 'SUBSCRIBED' ? 'EN DIRECT' : realtimeStatus === 'CONNECTING' ? 'CONNEXION' : 'RECONNEXION'} <i className={`live-dot ${realtimeStatus === 'SUBSCRIBED' ? '' : 'sync-pending'}`} /></span></footer>
      {toast && <div className="toast" role="status">{toast}<span>✓</span></div>}
    </main>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span className="empty-spark" aria-hidden="true">✳</span><h3>{title}</h3><p>{copy}</p></div>;
}

function InfoLines({ items }: { items: [string, string | null | undefined][] }) {
  const completed = items.filter(([, value]) => value?.trim());
  if (!completed.length) {
    return <EmptyState title="Détails à confirmer." copy="Utilisez le formulaire pour ajouter les renseignements du voyage." />;
  }
  return (
    <div className="info-lines">
      {completed.map(([label, value]) => (
        <p key={label}><strong>{label}</strong><span>{value}</span></p>
      ))}
    </div>
  );
}

export default function Home() {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authError, setAuthError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      const stored = data.session ? null : readStoredSession<Session>();
      if (error && !stored) setAuthError(`Impossible de restaurer votre session : ${error.message}`);
      setSession(data.session ?? stored);
      setCheckingSession(false);
    }).catch((error: unknown) => {
      if (!active) return;
      const stored = readStoredSession<Session>();
      if (stored) setSession(stored);
      else setAuthError(`Impossible de restaurer votre session : ${getErrorMessage(error)}`);
      setCheckingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Keep the saved session while offline; only an explicit sign-out clears it.
      setSession((current) => nextSession ?? (event === 'SIGNED_OUT' ? null : current));
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
  }

  if (!supabase) return <ConfigNotice />;
  if (checkingSession) return <main className="center-stage"><div className="loading-mark"><span className="brand-mark">LG</span><p>Chargement de votre voyage…</p></div></main>;
  if (recoveryMode) return <PasswordRecoveryScreen onComplete={(nextSession) => {
    setRecoveryMode(false);
    setSession(nextSession);
  }} />;
  if (session) {
    return (
      <>
        {authError && <div className="global-auth-error" role="alert">{authError}<button onClick={() => setAuthError('')} aria-label="Fermer le message d’erreur">×</button></div>}
        <AppShell
          user={session.user}
          onSignOut={async () => {
            try {
              await signOut();
              setAuthError('');
            } catch (error) {
              setAuthError(`Impossible de vous déconnecter : ${getErrorMessage(error)}`);
            }
          }}
        />
      </>
    );
  }
  return (
    <>
      {authError && <div className="global-auth-error" role="alert">{authError}<button onClick={() => setAuthError('')} aria-label="Fermer le message d’erreur">×</button></div>}
      <AuthScreen onSignedIn={setSession} />
    </>
  );
}
