/** Every item is split one of two ways. */
export type ItemMode = 'equal' | 'custom';

/** A price split equally between the listed owners. */
export type EqualSplitItem = {
  id: string;
  mode: 'equal';
  name: string;
  /** Total price of the item, split evenly across `owners`. */
  totalPrice: number;
  owners: string[];
};

/** An explicit per-member amount; the item total is the sum of the amounts. */
export type CustomAmountItem = {
  id: string;
  mode: 'custom';
  name: string;
  /** member name -> amount owed for this item. Members with no share are absent. */
  amounts: Record<string, number>;
};

export type PurchaseItem = EqualSplitItem | CustomAmountItem;

/** One payor and how much of the record they fronted. */
export type PayorContribution = {
  member: string;
  /**
   * Amount this payor fronted. Meaningful only when `payorMode === 'multiple'`;
   * in single-payor records the sole payor covers the whole record.
   */
  amount: number;
};

export type PayorMode = 'single' | 'multiple';

export type PurchaseRecord = {
  id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  payorMode: PayorMode;
  payors: PayorContribution[];
  items: PurchaseItem[];
  /** ISO timestamp, used only for stable ordering of same-day records. */
  createdAt: string;
};

export type SessionStatus = 'draft' | 'closed';

/**
 * One batch of expenses — a trip, a hangout, a night out. A session is a
 * `draft` while you are still adding to it and `closed` once it has been
 * settled up and filed into History. Each session owns its own roster, so two
 * groups running in parallel never share members.
 */
export type Session = {
  id: string;
  status: SessionStatus;
  /** ISO timestamp, set at creation. */
  createdAt: string;
  /** ISO timestamp, set when the session is closed; null while it is a draft. */
  closedAt: string | null;
  members: string[];
  records: PurchaseRecord[];
  /** The name the user gave it, tidied; null means unnamed and titled by its dates. */
  name: string | null;
  /**
   * ISO timestamp of the last open or saved change, which Home sorts by; null
   * until there is one, and Home then falls back to purchases or `createdAt`.
   */
  activityAt: string | null;
  /**
   * Who the user said they are in this finished session: a member's name,
   * `NOT_IN_SESSION` ('') for "I'm not in this session", or null for no pick,
   * which leaves it to the profile-name match (see `resolveMe`).
   */
  me: string | null;
  /**
   * True once a Hati with Collection finished the session. A finished session
   * without it was finished before Collection, and can be marked as already
   * settled (BR-S1). Never set back to false.
   */
  finishedWithCollection: boolean;
  /** Recorded payments, oldest first. Read-only on the session; written through `/api/payments`. */
  payments: Payment[];
};

/** One payment against a finished session's settlement line. Never edited; undo deletes it. */
export type Payment = {
  /** Client-minted `pay_xxx`, so a retried request can't record it twice. */
  id: string;
  debtor: string;
  creditor: string;
  /** Whole centavos, always above 0. */
  amountCents: number;
  /** ISO time the server recorded it. */
  createdAt: string;
};

/** What the client sends to record a payment; the server stamps the time. */
export type NewPayment = Omit<Payment, 'createdAt'>;

export type AppData = {
  schemaVersion: number;
  sessions: Session[];
};

/** Input shape accepted by `addRecords` — ids and timestamps are filled in for you. */
export type NewPurchaseRecord = {
  date: string;
  payorMode: PayorMode;
  payors: PayorContribution[];
  items: PurchaseItem[];
};

/** A `(date, payor-signature)` bucket of records, as rendered on the Breakdown page. */
export type BreakdownGroup = {
  key: string;
  date: string;
  payorMode: PayorMode;
  payors: PayorContribution[];
  /** Flattened items across every record in the group, tagged with their origin. */
  rows: BreakdownRow[];
  /** member -> total owed within this group. */
  totals: Record<string, number>;
  /** Sum of every item total in this group. */
  grandTotal: number;
};

export type BreakdownRow = {
  recordId: string;
  item: PurchaseItem;
  /** member -> amount attributed to them for this item. */
  shares: Record<string, number>;
  /** The item's total price. */
  total: number;
};

/** `matrix[payor][debtor]` = how much `debtor` owes `payor`. */
export type OwedMatrix = Record<string, Record<string, number>>;

export type NetBalance = {
  member: string;
  /** Positive = is owed back, negative = owes, 0 = settled up. */
  amount: number;
};

export type SettlementLine = {
  creditor: string;
  amount: number;
};

export type Settlement = {
  debtor: string;
  lines: SettlementLine[];
  total: number;
};
