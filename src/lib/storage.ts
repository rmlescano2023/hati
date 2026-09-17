import type { AppData, PurchaseItem, PurchaseRecord, Session } from '../types';
import { roundMoney } from './money';
import { createId } from './id';

export const STORAGE_KEY = 'hati:data:v1';
export const SCHEMA_VERSION = 2;

export const EMPTY_DATA: AppData = {
  schemaVersion: SCHEMA_VERSION,
  sessions: [],
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseItem(raw: unknown): PurchaseItem | null {
  if (!isRecordObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  const name = typeof raw.name === 'string' ? raw.name : null;
  if (!id || !name) return null;

  if (raw.mode === 'custom') {
    const amounts: Record<string, number> = {};
    if (isRecordObject(raw.amounts)) {
      for (const [member, amount] of Object.entries(raw.amounts)) {
        if (typeof amount === 'number' && Number.isFinite(amount)) {
          amounts[member] = roundMoney(amount);
        }
      }
    }
    return { id, mode: 'custom', name, amounts };
  }

  const owners = Array.isArray(raw.owners) ? raw.owners.filter((o) => typeof o === 'string') : [];
  const totalPrice = typeof raw.totalPrice === 'number' ? roundMoney(raw.totalPrice) : 0;
  return { id, mode: 'equal', name, totalPrice, owners };
}

function parseRecord(raw: unknown): PurchaseRecord | null {
  if (!isRecordObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  const date = typeof raw.date === 'string' ? raw.date : null;
  if (!id || !date) return null;

  const payors = Array.isArray(raw.payors)
    ? raw.payors
        .map((p) =>
          isRecordObject(p) && typeof p.member === 'string'
            ? { member: p.member, amount: typeof p.amount === 'number' ? roundMoney(p.amount) : 0 }
            : null,
        )
        .filter((p): p is { member: string; amount: number } => p !== null)
    : [];
  if (payors.length === 0) return null;

  const items = Array.isArray(raw.items)
    ? raw.items.map(parseItem).filter((i): i is PurchaseItem => i !== null)
    : [];

  return {
    id,
    date,
    payorMode: raw.payorMode === 'multiple' ? 'multiple' : 'single',
    payors,
    items,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  };
}

function parseSession(raw: unknown): Session | null {
  if (!isRecordObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;

  const members = Array.isArray(raw.members)
    ? raw.members.filter((m): m is string => typeof m === 'string')
    : [];
  const records = Array.isArray(raw.records)
    ? raw.records.map(parseRecord).filter((r): r is PurchaseRecord => r !== null)
    : [];

  const status = raw.status === 'closed' ? 'closed' : 'draft';
  return {
    id,
    status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    // A closed session with a missing timestamp still needs one to sort and
    // label by, so it falls back to its creation time rather than null.
    closedAt:
      typeof raw.closedAt === 'string'
        ? raw.closedAt
        : status === 'closed'
          ? typeof raw.createdAt === 'string'
            ? raw.createdAt
            : new Date(0).toISOString()
          : null,
    members,
    records,
  };
}

/**
 * The one-time v1 -> v2 step. A v1 blob is a single flat `{members, records}`
 * with no sessions; it becomes one draft session holding exactly that, so
 * whatever the user had open is still open after the upgrade.
 */
function migrateV1(parsed: Record<string, unknown>): Session[] {
  const members = Array.isArray(parsed.members)
    ? parsed.members.filter((m): m is string => typeof m === 'string')
    : [];
  const records = Array.isArray(parsed.records)
    ? parsed.records.map(parseRecord).filter((r): r is PurchaseRecord => r !== null)
    : [];
  if (members.length === 0 && records.length === 0) return [];

  return [
    {
      id: createId('session'),
      status: 'draft',
      createdAt: new Date().toISOString(),
      closedAt: null,
      members,
      records,
    },
  ];
}

/**
 * Defensively parse whatever is in localStorage. Anything unrecognisable is
 * dropped rather than allowed to crash the app on boot.
 *
 * A blob with no `sessions` array predates sessions entirely and is migrated
 * through `migrateV1`.
 */
export function parseAppData(raw: string | null): AppData {
  if (!raw) return EMPTY_DATA;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DATA;
  }
  if (!isRecordObject(parsed)) return EMPTY_DATA;

  const sessions = Array.isArray(parsed.sessions)
    ? parsed.sessions.map(parseSession).filter((s): s is Session => s !== null)
    : migrateV1(parsed);

  return { schemaVersion: SCHEMA_VERSION, sessions };
}

export function serializeAppData(data: AppData): string {
  return JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION });
}
