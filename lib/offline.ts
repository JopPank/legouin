export type PendingOp = {
  id: string;
  table: string;
  kind: 'insert' | 'update' | 'delete' | 'upsert';
  values?: Record<string, unknown>;
  matchId?: number;
  onConflict?: string;
  tempId?: number;
  queuedAt: string;
};

type Row = Record<string, unknown>;
type LooseClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const queueKey = (userId: string) => `legouin-queue-v1:${userId}`;
const cacheKey = (userId: string) => `legouin-cache-v1:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working online.
  }
}

export const loadQueue = (userId: string) => readJson<PendingOp[]>(queueKey(userId), []);
export const saveQueue = (userId: string, queue: PendingOp[]) => writeJson(queueKey(userId), queue);
export const loadCache = <T>(userId: string) => readJson<T | null>(cacheKey(userId), null);
export const saveCache = (userId: string, data: unknown) => writeJson(cacheKey(userId), data);

export function isNetworkError(message: string | undefined) {
  return !!message && /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(message);
}

export function newTempId() {
  return -Math.floor(Date.now() + Math.random() * 1000);
}

export function readStoredSession<T>(): T | null {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
        if (value?.user?.id) return value as T;
      }
    }
  } catch {
    return null;
  }
  return null;
}

type ApplyOptions = {
  insertDefaults: Row;
  addAt?: 'start' | 'end';
  matchesUpsert?: (row: Row, values: Row) => boolean;
};

export function applyOps<T extends object>(table: string, rows: T[], queue: PendingOp[], options: ApplyOptions): T[] {
  let result = rows as unknown as Row[];
  for (const op of queue) {
    if (op.table !== table) continue;
    if (op.kind === 'insert') {
      const row = { ...options.insertDefaults, created_at: op.queuedAt, ...op.values, id: op.tempId };
      result = options.addAt === 'end' ? [...result, row] : [row, ...result];
    } else if (op.kind === 'update') {
      result = result.map((row) => (row.id === op.matchId ? { ...row, ...op.values } : row));
    } else if (op.kind === 'delete') {
      result = result.filter((row) => row.id !== op.matchId);
    } else if (op.kind === 'upsert') {
      const values = op.values ?? {};
      const matches = options.matchesUpsert ?? ((row, next) => row.id === next.id);
      if (result.some((row) => matches(row, values))) {
        result = result.map((row) => (matches(row, values) ? { ...row, ...values } : row));
      } else {
        result = [...result, { ...options.insertDefaults, created_at: op.queuedAt, ...values, id: op.tempId }];
      }
    }
  }
  return result as unknown as T[];
}

export async function executeOp(client: object, op: PendingOp) {
  const table = (client as unknown as LooseClient).from(op.table);
  if (op.kind === 'insert') {
    const result = await table.insert(op.values).select('id').single();
    return { error: result.error as { message: string } | null, id: result.data?.id as number | undefined };
  }
  if (op.kind === 'update') {
    const result = await table.update(op.values).eq('id', op.matchId);
    return { error: result.error as { message: string } | null, id: undefined };
  }
  if (op.kind === 'delete') {
    const result = await table.delete().eq('id', op.matchId);
    return { error: result.error as { message: string } | null, id: undefined };
  }
  const result = await table.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
  return { error: result.error as { message: string } | null, id: undefined };
}

export async function flushQueue(client: object, userId: string) {
  let synced = 0;
  const failures: string[] = [];
  let queue = loadQueue(userId);

  while (queue.length > 0) {
    const op = queue[0];
    if (op.matchId !== undefined && op.matchId < 0) {
      // The row this change targets was never created on the server.
      queue = queue.slice(1);
      saveQueue(userId, queue);
      continue;
    }
    let outcome: { error: { message: string } | null; id: number | undefined };
    try {
      outcome = await executeOp(client, op);
    } catch (thrown) {
      outcome = { error: { message: thrown instanceof Error ? thrown.message : 'network' }, id: undefined };
      if (!isNetworkError(outcome.error?.message)) outcome.error = { message: 'Failed to fetch' };
    }
    if (outcome.error) {
      const message = outcome.error.message;
      if (isNetworkError(message) || /jwt|token expired/i.test(message)) break;
      failures.push(`${op.table} : ${message}`);
    } else {
      synced += 1;
    }
    const realId = outcome.id;
    queue = queue.slice(1).map((next) => (
      op.kind === 'insert' && next.matchId === op.tempId && realId !== undefined ? { ...next, matchId: realId } : next
    ));
    saveQueue(userId, queue);
  }

  return { synced, failures, remaining: queue.length };
}
