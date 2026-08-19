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

export type AppData = {
  schemaVersion: number;
  members: string[];
  records: PurchaseRecord[];
};

/** Input shape accepted by `addRecord` — ids and timestamps are filled in for you. */
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
