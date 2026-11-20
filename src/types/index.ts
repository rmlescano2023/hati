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

/** One thing a member ordered, inside a Custom Amounts item (BR-CO5). */
export type OrderLine = {
  member: string;
  /** Tidied (`normaliseOrderName`); '' means the line has no name. */
  name: string;
  /** Above 0, rounded to the centavo. */
  amount: number;
};

/**
 * One row of a Custom item's receipt (BR-CA2 to BR-CA5). `amount` is always the
 * positive figure printed on the receipt, rounded to the centavo; `kind` says
 * whether it adds to the members' shares or comes off them.
 */
export type BillLine =
  /** One member's own order. */
  | { kind: 'order'; member: string; name: string; amount: number }
  /** Split equally across `members` (BR-CA3). */
  | { kind: 'shared'; members: string[]; name: string; amount: number }
  /** Comes off `members`' shares, split equally (BR-CA4). */
  | { kind: 'discount'; members: string[]; name: string; amount: number }
  /** Split equally across everyone in the item, the keys of `amounts` (BR-CA5). */
  | { kind: 'charge'; name: string; amount: number };

/** An explicit per-member amount; the item total is the sum of the amounts. */
export type CustomAmountItem = {
  id: string;
  mode: 'custom';
  name: string;
  /**
   * member -> amount owed for this item, the one place every calculation reads
   * money from (BR-CO10, BR-CA42). A member who isn't in the item is absent.
   * With `lines`, each amount is the sum of that member's lines. With `bill`,
   * every member in the item is present, at ₱0.00 too (BR-CA6), and each amount
   * is what the bill gives them (`billAmounts`).
   */
  amounts: Record<string, number>;
  /**
   * What each member ordered, by member alphabetically and then in the order
   * added (BR-CO13). Present only when at least one line has a name: an item
   * whose lines are all unnamed is stored as `amounts` alone (BR-CO12, BR-CO17).
   */
  lines?: OrderLine[];
  /**
   * The whole receipt, own orders included, in BR-CA34 order: own orders by
   * member alphabetically and then as added, then shared orders, discounts and
   * charges, each as added. Present only when the item has at least one shared
   * order, discount or charge, and never alongside `lines` (BR-CA8, BR-CA43).
   */
  bill?: BillLine[];
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

/** How the signed-in account relates to a session: it owns it, or it joined it as a member. */
export type SessionRole = 'owner' | 'participant';

/** An account that joined a finished session as one of its members, as the organizer sees it. */
export type Participant = {
  member: string;
  /** The joiner's Hati profile name, or null when they haven't set one. Never an email (D3). */
  name: string | null;
  /** ISO time they joined. */
  joinedAt: string;
};

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
  /**
   * 'participant' when the account joined this session rather than owning it; absent or 'owner'
   * otherwise. Test it as `role === 'participant'` (`isJoined`), never as `=== 'owner'`.
   */
  role?: SessionRole;
  /** The organizer's Hati profile name, on a joined session only; null when unset. */
  organizerName?: string | null;
  /** Who joined, for the organizer only (BR-O3); always empty on a joined session. */
  participants?: Participant[];
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

/** What a token holder sees before joining (I-4, AC-6.2). */
export type InvitePreview = {
  sessionId: string;
  title: string;
  closedAt: string;
  /**
   * The members the joiner may be shown: every member except the organizer's own, who is not
   * listed at all, so the preview never says which member that is (round 4).
   */
  members: string[];
  /** How many members the session has, the organizer's included, for "N members". */
  memberCount: number;
  /** Members an account has joined as. The only ones labelled "on Hati". */
  onHati: string[];
  organizerName: string | null;
};

/** The 200 and 201 bodies of a preview or a join. */
export type InviteAnswer =
  | { outcome: 'own'; sessionId: string; title: string }
  | { outcome: 'already'; sessionId: string; title: string; member: string }
  | { outcome: 'open'; preview: InvitePreview }
  | { outcome: 'joined'; session: Session };

/** How a preview or join ended, as the app sees it: the answer, a refusal, or no answer. */
export type JoinAnswer =
  | InviteAnswer
  | { outcome: 'taken'; preview: InvitePreview }
  | { outcome: 'dead' }
  | { outcome: 'failed' };

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
