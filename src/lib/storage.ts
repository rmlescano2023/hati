import type { AppData, PurchaseItem, PurchaseRecord } from '../types';
import { roundMoney } from './money';

export const STORAGE_KEY = 'hati:data:v1';
export const SCHEMA_VERSION = 1;

export const EMPTY_DATA: AppData = {
  schemaVersion: SCHEMA_VERSION,
  members: [],
  records: [],
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

/**
 * Defensively parse whatever is in localStorage. Anything unrecognisable is
 * dropped rather than allowed to crash the app on boot.
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

  const members = Array.isArray(parsed.members)
    ? parsed.members.filter((m): m is string => typeof m === 'string')
    : [];
  const records = Array.isArray(parsed.records)
    ? parsed.records.map(parseRecord).filter((r): r is PurchaseRecord => r !== null)
    : [];

  return { schemaVersion: SCHEMA_VERSION, members, records };
}

export function serializeAppData(data: AppData): string {
  return JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION });
}
