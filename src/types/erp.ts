export type Role = 'owner' | 'manager' | 'salesperson';

export type PageId =
  | 'dashboard'
  | 'notifications'
  | 'products'
  | 'stock'
  | 'sales'
  | 'purchases'
  | 'returns'
  | 'expenses'
  | 'cash-bank'
  | 'customers'
  | 'suppliers'
  | 'staff'
  | 'attendance'
  | 'owner-loans'
  | 'reports'
  | 'settings';

export type PaymentAccount = 'cash' | 'bank' | 'bKash' | 'Nagad';

export type ProductCategory = 'Shirt' | 'Pant' | 'T-Shirt';

export type ProductUnit = 'piece' | 'dozen';

export type ExpenseCategory =
  | 'rent'
  | 'electricity'
  | 'internet'
  | 'transport'
  | 'food'
  | 'packaging'
  | 'marketing';

export interface CompanySetup {
  name: string;
  tagline: string;
  logoText: string;
  logoDataUrl?: string | undefined;
  currency: 'BDT';
  openingCash: number;
  openingBank: number;
  openingBkash: number;
  openingNagad: number;
  address: string;
  phone: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  brand: string;
  size: string;
  color: string;
  unit: ProductUnit;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  lowStockLimit: number;
  openingStock: number;
}

export interface Purchase {
  id: string;
  date: string;
  billNo: string;
  supplierId: string;
  productId: string;
  quantity: number;
  rate: number;
  transportCost: number;
  total: number;
  paid: number;
  due: number;
  account: PaymentAccount;
  note?: string | undefined;
}

export interface Sale {
  id: string;
  date: string;
  invoiceNo: string;
  customerId: string;
  productId: string;
  quantity: number;
  rate: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  salesperson: string;
  priceType: 'retail' | 'wholesale';
  account: PaymentAccount;
  note?: string | undefined;
}

export interface ReturnEntry {
  id: string;
  date: string;
  type: 'sales_return' | 'purchase_return';
  originalRef: string;
  productId: string;
  quantity: number;
  amount: number;
  reason: string;
  account: PaymentAccount;
}

export interface DamageEntry {
  id: string;
  date: string;
  productId: string;
  quantity: number;
  unitCost: number;
  totalLoss: number;
  reason: string;
}

export interface Expense {
  id: string;
  date: string;
  type: ExpenseCategory;
  amount: number;
  paidBy: string;
  account: PaymentAccount;
  note?: string | undefined;
}

export interface OtherIncome {
  id: string;
  date: string;
  source: string;
  amount: number;
  account: PaymentAccount;
  note?: string | undefined;
}

export interface CashEntry {
  id: string;
  date: string;
  account: PaymentAccount;
  moneyIn: number;
  moneyOut: number;
  reference: string;
  category: string;
  note?: string | undefined;
}

export interface Party {
  id: string;
  type: 'customer' | 'supplier';
  code: string;
  name: string;
  shopName: string;
  mobile: string;
  address: string;
  openingDue: number;
}

export interface PartyPayment {
  id: string;
  partyId: string;
  partyType: 'customer' | 'supplier';
  date: string;
  amount: number;
  account: PaymentAccount;
  reference: string;
  note?: string | undefined;
}

export interface StaffMember {
  id: string;
  code: string;
  name: string;
  mobile: string;
  nid: string;
  address: string;
  position: string;
  joiningDate: string;
  basicSalary: number;
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  date: string;
  status: 'present' | 'absent' | 'leave';
  overtimeHours: number;
}

export interface SalaryRecord {
  id: string;
  staffId: string;
  month: string; // YYYY-MM
  basic: number;
  overtime: number;
  bonus: number;
  advanceTaken: number;
  deductions: number;
  netSalary: number;
  paymentDate?: string | undefined;
  status: 'paid' | 'pending';
  account: PaymentAccount;
}

export interface OwnerTransaction {
  id: string;
  date: string;
  type: 'investment' | 'withdrawal';
  amount: number;
  account: PaymentAccount;
  note?: string | undefined;
}

export interface Loan {
  id: string;
  lenderName: string;
  date: string;
  principalAmount: number;
  interestRate: number;
  note?: string | undefined;
}

export interface LoanInstallment {
  id: string;
  loanId: string;
  date: string;
  principalPaid: number;
  interestPaid: number;
  account: PaymentAccount;
  note?: string | undefined;
}

export interface ErpState {
  company: CompanySetup;
  currentRole: Role;
  products: Product[];
  purchases: Purchase[];
  sales: Sale[];
  returns: ReturnEntry[];
  damages: DamageEntry[];
  expenses: Expense[];
  otherIncomes: OtherIncome[];
  cashEntries: CashEntry[];
  parties: Party[];
  partyPayments: PartyPayment[];
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  salaries: SalaryRecord[];
  ownerTransactions: OwnerTransaction[];
  loans: Loan[];
  loanInstallments: LoanInstallment[];
  readNotificationIds: string[];
}

export interface DateFilter {
  from?: string | undefined;
  to?: string | undefined;
}

export interface ProductStockSummary {
  productId: string;
  opening: number;
  purchased: number;
  sold: number;
  salesReturned: number;
  purchaseReturned: number;
  damaged: number;
  currentStock: number;
  isLowStock: boolean;
  avgUnitCost: number;
  stockValue: number;
}

export interface FinancialSummary {
  grossSales: number;
  totalDiscounts: number;
  salesReturns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  otherIncome: number;
  totalExpenses: number;
  totalSalaries: number;
  totalDamageLoss: number;
  totalLoanInterest: number;
  netProfit: number;
  ownerInvestments: number;
  ownerWithdrawals: number;
  loansTaken: number;
  loanPrincipalRepaid: number;
  loanRemainingBalance: number;
}

export interface PartyAccountSummary {
  partyId: string;
  openingDue: number;
  totalVolume: number;
  totalPaid: number;
  currentDue: number;
  lastPaymentDate: string | null;
}

export interface CashLedgerEntry extends CashEntry {
  runningBalance: number;
  isSystemGenerated?: boolean | undefined;
}

export interface CashLedgerSummary {
  entries: CashLedgerEntry[];
  balancesByAccount: Record<PaymentAccount, number>;
  totalBalance: number;
}

export interface BestSellingProduct {
  productId: string;
  code: string;
  name: string;
  category: ProductCategory;
  size: string;
  color: string;
  unitsSold: number;
  unitsReturned: number;
  netUnitsSold: number;
  grossRevenue: number;
  netRevenue: number;
  estimatedProfit: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertCategory = 'low_stock' | 'customer_due' | 'supplier_due' | 'pending_salary' | 'loan_balance';

export interface AlertItem {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  targetPage: PageId;
  amount?: number | undefined;
  entityId: string;
  read: boolean;
}
