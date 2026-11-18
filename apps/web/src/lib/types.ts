/** أنواع بيانات الـAPI — مطابقة لما يرجعه الخادم بعد jsonSafe */

export type Role = 'OWNER' | 'SELLER';
export type ItemType = 'PIECE' | 'SET';
export type ItemStatus = 'AVAILABLE' | 'SOLD';
export type PurchaseStatus = 'NEW' | 'USED' | 'SCRAP';
export type WeightBasis = 'NET_GOLD' | 'TOTAL' | 'MINUS_STONE' | 'MINUS_INLAYS';
export type ProfitMode = 'PERCENT' | 'FIXED' | 'MANUAL';
/** أساس الربح الثابت عند FIXED: لكل غرام أو لكل قطعة */
export type FixedBasis = 'GRAM' | 'PIECE';
export type CodeMode = 'AUTO' | 'MANUAL';
export type PriceSource = 'MANUAL' | 'API';
export type SaleStatus = 'COMPLETED' | 'CANCELLED';
export type SaleFxMode = 'CASH' | 'CHEQUE';
export type StocktakeType = 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type StocktakeStatus = 'OPEN' | 'CLOSED';
export type LookupKind = 'CATEGORY' | 'SUPPLIER' | 'MANUFACTURER' | 'COUNTRY' | 'PAYMENT_METHOD' | 'KARAT';
export type ComponentKind =
  | 'RING'
  | 'BRACELET'
  | 'NECKLACE'
  | 'EARRING'
  | 'ANKLET'
  | 'CHAIN'
  | 'PENDANT'
  | 'OTHER';

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface Setting {
  id: number;
  shopName: string;
  currency: string;
  codeMode: CodeMode;
  deductStone: boolean;
  deductInlays: boolean;
  weightBasis: WeightBasis;
  profitMode: ProfitMode;
  profitValue: number;
  fixedBasis: FixedBasis;
  fxSource: PriceSource;
  roundingStep: number;
  priceStaleHours: number;
  showCostToSeller: boolean;
  sellerCanAddItems: boolean;
  defaultKarat: number;
}

export interface Lookup {
  id: number;
  kind: LookupKind;
  value: string;
  sortOrder: number;
  active: boolean;
  createdAt?: string;
}

export type LookupGroups = Record<LookupKind, Lookup[]>;

export interface PriceSnapshot {
  value: number;
  at: string;
  source: PriceSource;
  userId: number;
  userName: string;
}

export interface CurrentPrices {
  ounce: PriceSnapshot | null;
  fx: PriceSnapshot | null;
  stale: boolean;
  staleHours: number;
  ageHours: number | null;
  ready: boolean;
}

export interface KaratPrice {
  karat: number;
  factor: number;
  pricePerGram: number;
  pricePerGramRaw: number;
}

export interface PriceTable {
  ounceUsd: number;
  fxRate: number;
  gramPrice24: number;
  gramPrice24Raw: number;
  rows: KaratPrice[];
}

export interface PriceTableView {
  ready: boolean;
  ounce: number | null;
  fx: number | null;
  table: PriceTable | null;
  current: CurrentPrices;
  providers?: {
    ounce: {
      mode: 'manual' | 'api';
      configured: boolean;
      docsUrl: string;
      autoRefresh: boolean;
      refreshMinutes: number;
    };
  };
}

export interface PriceUpdate {
  id: number;
  type: 'OUNCE' | 'FX';
  value: number;
  source: PriceSource;
  userId: number;
  createdAt: string;
  user?: { id: number; name: string };
}

export interface SetComponent {
  id: number;
  setItemId?: number;
  kind: ComponentKind;
  name: string | null;
  karat: number;
  weight: number;
  stoneWeight: number;
  stonePrice: number | null;
  inlaysWeight: number;
  netGoldWeight: number;
  notes: string | null;
  sortOrder: number;
}

export interface Item {
  id: number;
  type: ItemType;
  code: string;
  name: string;
  karat: number;
  categoryId: number | null;
  category?: Lookup | null;
  size: string | null;
  totalWeight: number;
  stoneWeight: number;
  stonePrice: number | null;
  inlaysWeight: number;
  netGoldWeight: number;
  quantity: number;
  purchaseGramPrice: number | null;
  purchasePrice: number;
  purchaseCurrency: string;
  purchaseFxRate: number;
  purchaseCostDinar: number;
  status: ItemStatus;
  purchaseStatus: PurchaseStatus;
  weightBasis: WeightBasis | null;
  supplierId: number | null;
  supplier?: Lookup | null;
  countryId: number | null;
  country?: Lookup | null;
  manufacturerId: number | null;
  manufacturerLookup?: Lookup | null;
  manufacturer: string | null;
  description: string | null;
  notes: string | null;
  addedAt: string;
  createdAt: string;
  updatedAt: string;
  components?: SetComponent[];
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaleLine {
  id: number;
  itemId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  item: { id: number; code: string; name: string; karat: number; type?: ItemType; totalWeight: number };
}

export interface Sale {
  id: number;
  invoiceNo: string;
  sellerId: number;
  seller: { id: number; name: string };
  paymentMethodId: number | null;
  paymentMethod?: Lookup | null;
  total: number;
  status: SaleStatus;
  profitMode: ProfitMode | null;
  profitValue: number | null;
  fixedBasis: FixedBasis | null;
  roundingStep: number | null;
  fxMode: SaleFxMode | null;
  fxRate: number | null;
  customerName: string | null;
  customerPhone: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelledBy?: { id: number; name: string } | null;
  createdAt: string;
  items: SaleLine[];
}

export interface DashboardData {
  shopName: string;
  currency: string;
  prices: CurrentPrices;
  table: PriceTable | null;
  today: { count: number; total: number };
  month: { count: number; total: number };
  inventory: {
    items: number;
    units: number;
    totalWeight: number;
    goldWeight: number;
    soldItems: number;
  };
  recentSales: Sale[];
  /** حالة النسخ الاحتياطي — للمالك فقط، وإلا null */
  backup: BackupSummary | null;
  lastStocktake: {
    id: number;
    type: StocktakeType;
    status: StocktakeStatus;
    openedAt: string;
    closedAt: string | null;
  } | null;
  user: User;
}

export interface InventoryGroup {
  karat: number;
  count: number;
  pieces: number;
  totalWeight: number;
  goldWeight: number;
  value: number;
  cost: number;
}

export interface InventorySummary {
  ready: boolean;
  prices: CurrentPrices;
  basis: WeightBasis;
  totals: {
    items: number;
    units: number;
    totalWeight: number;
    goldWeight: number;
    value: number;
    cost: number;
    margin: number;
  };
  byKarat: InventoryGroup[];
  rows: Array<{
    id: number;
    code: string;
    name: string;
    type: ItemType;
    karat: number;
    quantity: number;
    totalWeight: number;
    netGoldWeight: number;
    value: number;
    cost: number;
    margin: number;
  }>;
}

export interface StocktakeLine {
  id: number;
  itemId: number | null;
  itemCode: string;
  expectedWeight: number;
  countedWeight: number | null;
  weightDiff: number | null;
  valueAtOpen: number;
  present: boolean;
  item?: {
    id: number;
    code: string;
    name: string;
    karat: number;
    quantity: number;
  } | null;
}

export interface Stocktake {
  id: number;
  type: StocktakeType;
  status: StocktakeStatus;
  openedAt: string;
  openedBy: { id: number; name: string };
  closedAt: string | null;
  closedBy?: { id: number; name: string } | null;
  notes: string | null;
  lines?: StocktakeLine[];
  _count?: { lines: number };
}

export interface StocktakeDifferences {
  missing: StocktakeLine[];
  notRegistered: Array<{ id: number; code: string; name: string; karat: number; totalWeight: number }>;
  weightDiffs: StocktakeLine[];
  counts: { lines: number; missing: number; notRegistered: number; weightDiffs: number };
}

export interface SalesReport {
  count: number;
  total: number;
  average: number;
  bySeller: Array<{ id: number; name: string; count: number; total: number }>;
  byPayment: Array<{ name: string; count: number; total: number }>;
  byKarat: Array<{ karat: number; count: number; total: number; weight: number }>;
  rows: Sale[];
}

export interface ProfitReport {
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  rows: Array<{
    id: number;
    invoiceNo: string;
    date: string;
    code: string;
    name: string;
    karat: number;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
  }>;
}

export interface InventoryReport {
  ready: boolean;
  count: number;
  totalValue: number;
  totalCost: number;
  rows: Array<{
    id: number;
    code: string;
    name: string;
    type: ItemType;
    karat: number;
    quantity: number;
    totalWeight: number;
    netGoldWeight: number;
    value: number;
    cost: number;
    margin: number;
  }>;
}

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  user: { id: number; name: string; role: Role } | null;
}

/* ───────────── النسخ الاحتياطي ───────────── */

export type BackupStatus = 'RUNNING' | 'OK' | 'FAILED';
export type BackupTrigger = 'MANUAL' | 'SCHEDULED';
export type BackupHealth = 'ok' | 'warning' | 'none' | 'off';

export interface BackupSummary {
  health: BackupHealth;
  enabled: boolean;
  schedulerActive: boolean;
  running: boolean;
  intervalHours: number;
  lastOkAt: string | null;
  lastOkSizeBytes: number | null;
  /** يظهر فقط إذا فشلت محاولة بعد آخر نجاح */
  lastFailedAt: string | null;
  nextRunAt: string | null;
}

export interface BackupRunRow {
  id: number;
  trigger: BackupTrigger;
  status: BackupStatus;
  startedAt: string;
  finishedAt: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  fileExists: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  timeOfDay: string;
  retentionCount: number;
}

export interface BackupOverview {
  settings: BackupSettings;
  summary: BackupSummary;
  storage: {
    dir: string;
    copyDir: string | null;
    mysqldump: boolean;
    totalSizeBytes: number;
    count: number;
  };
  runs: BackupRunRow[];
}
