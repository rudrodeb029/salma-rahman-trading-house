import { describe, expect, it } from 'vitest';
import { createSeedState } from '@/data/seed';
import {
  calcAlerts,
  calcBestSellingProducts,
  calcCashLedger,
  calcFinancialSummary,
  calcNetSalary,
  calcPartyAccount,
  calcProductStock,
} from '@/lib/calculations';
import { formatBDT, formatCompactBDT, formatDate } from '@/lib/format';
import { canAccessPage, canMutate, canViewProfit, getAllowedPages } from '@/lib/rbac';
import type { ErpState, Product } from '@/types/erp';

function createEmptyState(): ErpState {
  return {
    company: {
      name: 'Test House',
      tagline: 'Test',
      logoText: 'TH',
      currency: 'BDT',
      openingCash: 100000,
      openingBank: 200000,
      openingBkash: 50000,
      openingNagad: 25000,
      address: 'Dhaka',
      phone: '01700000000',
    },
    currentRole: 'owner',
    products: [],
    purchases: [],
    sales: [],
    returns: [],
    damages: [],
    expenses: [],
    otherIncomes: [],
    cashEntries: [],
    parties: [],
    partyPayments: [],
    staff: [],
    attendance: [],
    salaries: [],
    ownerTransactions: [],
    loans: [],
    loanInstallments: [],
    readNotificationIds: [],
  };
}

describe('Core ERP Formulas (PDF Spec)', () => {
  it('Formula 4: calculates Current Stock = Opening + Purchased - Sold + Sales Return - Purchase Return - Damaged', () => {
    const product: Product = {
      id: 'p1',
      code: 'TS-01',
      name: 'T-Shirt',
      category: 'T-Shirt',
      brand: 'SR',
      size: 'L',
      color: 'Black',
      unit: 'piece',
      purchasePrice: 200,
      wholesalePrice: 300,
      retailPrice: 400,
      lowStockLimit: 20,
      openingStock: 50,
    };

    const result = calcProductStock(
      product,
      [
        {
          id: 'pur1',
          date: '2026-11-01',
          billNo: 'PB-1',
          supplierId: 's1',
          productId: 'p1',
          quantity: 40,
          rate: 200,
          transportCost: 800,
          total: 8800,
          paid: 8800,
          due: 0,
          account: 'cash',
        },
      ],
      [
        {
          id: 'sal1',
          date: '2026-11-05',
          invoiceNo: 'INV-1',
          customerId: 'c1',
          productId: 'p1',
          quantity: 65,
          rate: 300,
          discount: 500,
          total: 19000,
          paid: 19000,
          due: 0,
          salesperson: 'Tanvir',
          priceType: 'wholesale',
          account: 'cash',
        },
      ],
      [
        {
          id: 'ret1',
          date: '2026-11-06',
          type: 'sales_return',
          originalRef: 'INV-1',
          productId: 'p1',
          quantity: 5,
          amount: 1500,
          reason: 'Size issue',
          account: 'cash',
        },
        {
          id: 'ret2',
          date: '2026-11-07',
          type: 'purchase_return',
          originalRef: 'PB-1',
          productId: 'p1',
          quantity: 8,
          amount: 1600,
          reason: 'Defect',
          account: 'cash',
        },
      ],
      [
        {
          id: 'dmg1',
          date: '2026-11-08',
          productId: 'p1',
          quantity: 4,
          unitCost: 200,
          totalLoss: 800,
          reason: 'Tear',
        },
      ],
    );

    // 50 + 40 - 65 + 5 - 8 - 4 = 18
    expect(result.currentStock).toBe(18);
    expect(result.isLowStock).toBe(true); // 18 <= 20
    expect(result.opening).toBe(50);
    expect(result.purchased).toBe(40);
    expect(result.sold).toBe(65);
    expect(result.salesReturned).toBe(5);
    expect(result.purchaseReturned).toBe(8);
    expect(result.damaged).toBe(4);
  });

  it('Formula 5: calculates Net Salary = Basic + Overtime + Bonus - Advance - Deduction', () => {
    const net = calcNetSalary({
      basic: 20000,
      overtime: 2500,
      bonus: 1500,
      advanceTaken: 3000,
      deductions: 500,
    });
    expect(net).toBe(20500);
  });

  it('Formulas 1, 2, 3: Net Sales, Gross Profit, and Net Profit EXCLUDING owner withdrawals and loan principal', () => {
    const state = createEmptyState();
    state.products = [
      {
        id: 'p1',
        code: 'EP-1',
        name: 'Export Pant',
        category: 'Pant',
        brand: 'Export',
        size: '32',
        color: 'Navy',
        unit: 'piece',
        purchasePrice: 500,
        wholesalePrice: 700,
        retailPrice: 900,
        lowStockLimit: 10,
        openingStock: 100,
      },
    ];
    state.sales = [
      {
        id: 's1',
        date: '2026-11-10',
        invoiceNo: 'INV-1',
        customerId: 'c1',
        productId: 'p1',
        quantity: 20,
        rate: 800,
        discount: 1000,
        total: 15000,
        paid: 15000,
        due: 0,
        salesperson: 'Tanvir',
        priceType: 'wholesale',
        account: 'cash',
      },
    ];
    state.returns = [
      {
        id: 'r1',
        date: '2026-11-12',
        type: 'sales_return',
        originalRef: 'INV-1',
        productId: 'p1',
        quantity: 2,
        amount: 1600,
        reason: 'Wrong size',
        account: 'cash',
      },
    ];
    state.otherIncomes = [
      {
        id: 'i1',
        date: '2026-11-14',
        source: 'Scrap',
        amount: 2000,
        account: 'cash',
      },
    ];
    state.expenses = [
      {
        id: 'e1',
        date: '2026-11-15',
        type: 'rent',
        amount: 3000,
        paidBy: 'Owner',
        account: 'bank',
      },
    ];
    state.salaries = [
      {
        id: 'sal1',
        staffId: 'stf1',
        month: '2026-11',
        basic: 2000,
        overtime: 0,
        bonus: 0,
        advanceTaken: 0,
        deductions: 0,
        netSalary: 2000,
        paymentDate: '2026-11-20',
        status: 'paid',
        account: 'cash',
      },
      {
        id: 'sal2',
        staffId: 'stf2',
        month: '2026-11',
        basic: 5000,
        overtime: 0,
        bonus: 0,
        advanceTaken: 0,
        deductions: 0,
        netSalary: 5000,
        status: 'pending',
        account: 'cash',
      },
    ];
    state.damages = [
      {
        id: 'd1',
        date: '2026-11-16',
        productId: 'p1',
        quantity: 1,
        unitCost: 500,
        totalLoss: 500,
        reason: 'Damaged',
      },
    ];
    state.ownerTransactions = [
      {
        id: 'ot1',
        date: '2026-11-18',
        type: 'withdrawal',
        amount: 40000,
        account: 'bank',
        note: 'Personal drawing — must NOT reduce Net Profit!',
      },
    ];
    state.loans = [
      {
        id: 'l1',
        lenderName: 'BRAC Bank',
        date: '2026-11-01',
        principalAmount: 100000,
        interestRate: 12,
      },
    ];
    state.loanInstallments = [
      {
        id: 'li1',
        loanId: 'l1',
        date: '2026-11-25',
        principalPaid: 10000, // Must NOT reduce Net Profit!
        interestPaid: 1000, // MUST reduce Net Profit!
        account: 'bank',
      },
    ];

    const summary = calcFinancialSummary(state);

    // Gross Sales = 20 * 800 = 16,000
    // Net Sales = 16,000 - 1,000 - 1,600 = 13,400
    expect(summary.grossSales).toBe(16000);
    expect(summary.totalDiscounts).toBe(1000);
    expect(summary.salesReturns).toBe(1600);
    expect(summary.netSales).toBe(13400);

    // Net units sold = 20 - 2 = 18; unit cost = 500 => COGS = 9,000
    expect(summary.cogs).toBe(9000);
    // Gross Profit = 13,400 - 9,000 = 4,400
    expect(summary.grossProfit).toBe(4400);

    // Net Profit = 4,400 + 2,000 (other income) - 3,000 (expenses) - 2,000 (paid salaries only) - 500 (damage) - 1,000 (loan interest)
    // = -100 (and crucially NOT reduced by 40,000 withdrawal or 10,000 loan principal!)
    expect(summary.totalSalaries).toBe(2000);
    expect(summary.totalLoanInterest).toBe(1000);
    expect(summary.netProfit).toBe(-100);
    expect(summary.ownerWithdrawals).toBe(40000);
    expect(summary.loanPrincipalRepaid).toBe(10000);
    expect(summary.loanRemainingBalance).toBe(90000);
  });

  it('Cash & Bank ledger tracks opening balances, inflows, outflows, withdrawals, and loan repayments accurately', () => {
    const state = createEmptyState();
    state.sales = [
      {
        id: 's1',
        date: '2026-11-05',
        invoiceNo: 'INV-1',
        customerId: 'c1',
        productId: 'p1',
        quantity: 10,
        rate: 500,
        discount: 0,
        total: 5000,
        paid: 5000,
        due: 0,
        salesperson: 'Tanvir',
        priceType: 'retail',
        account: 'cash',
      },
    ];
    state.ownerTransactions = [
      {
        id: 'ot1',
        date: '2026-11-10',
        type: 'withdrawal',
        amount: 30000,
        account: 'bank',
      },
    ];
    state.loans = [
      {
        id: 'l1',
        lenderName: 'City Bank',
        date: '2026-11-02',
        principalAmount: 50000,
        interestRate: 10,
      },
    ];
    state.loanInstallments = [
      {
        id: 'li1',
        loanId: 'l1',
        date: '2026-11-20',
        principalPaid: 10000,
        interestPaid: 500,
        account: 'bank',
      },
    ];

    const ledger = calcCashLedger(state);
    // Cash: 100,000 + 5,000 = 105,000
    expect(ledger.balancesByAccount.cash).toBe(105000);
    // Bank: 200,000 + 50,000 (loan) - 30,000 (withdrawal) - 10,500 (installment) = 209,500
    expect(ledger.balancesByAccount.bank).toBe(209500);
    expect(ledger.balancesByAccount.bKash).toBe(50000);
    expect(ledger.balancesByAccount.Nagad).toBe(25000);
    expect(ledger.totalBalance).toBe(105000 + 209500 + 50000 + 25000);

    const lastEntry = ledger.entries[ledger.entries.length - 1];
    expect(lastEntry?.runningBalance).toBe(ledger.totalBalance);
  });
});

describe('Seed Data Integrity & Formatting', () => {
  it('loads all 8 required PDF products and produces realistic low-stock alerts and best sellers', () => {
    const seed = createSeedState();
    const productNames = new Set(seed.products.map((p) => p.name));
    for (const required of [
      'T-Shirt',
      'Export Pant',
      'Gabardine Pant',
      'Shirt',
      'Polo T-Shirt',
      'Brand Pant',
      'Drop Shoulder T-Shirt',
      'Denim Pant',
    ]) {
      expect(productNames.has(required)).toBe(true);
    }

    const alerts = calcAlerts(seed);
    expect(alerts.some((a) => a.category === 'low_stock')).toBe(true);
    expect(alerts.some((a) => a.category === 'pending_salary')).toBe(true);
    expect(alerts.some((a) => a.category === 'customer_due')).toBe(true);

    const bestSellers = calcBestSellingProducts(seed);
    expect(bestSellers.length).toBeGreaterThan(5);

    const cust1 = seed.parties.find((p) => p.id === 'cust-1');
    expect(cust1).toBeDefined();
    if (cust1) {
      const acc = calcPartyAccount(cust1, seed);
      expect(acc.totalVolume).toBeGreaterThan(0);
    }
  });

  it('formats BDT currency, compact values, and dates correctly', () => {
    expect(formatBDT(184250)).toBe('৳1,84,250');
    expect(formatBDT(-12500)).toBe('-৳12,500');
    expect(formatCompactBDT(1840000)).toBe('৳18.4L');
    expect(formatCompactBDT(47000)).toBe('৳47K');
    expect(formatDate('2026-11-25')).toBe('25 Nov 2026');
  });
});

describe('Role-Based Access Control (RBAC)', () => {
  it('enforces Owner, Manager, and Salesperson permissions accurately', () => {
    expect(canViewProfit('owner')).toBe(true);
    expect(canViewProfit('manager')).toBe(false);
    expect(canViewProfit('salesperson')).toBe(false);

    expect(canAccessPage('owner', 'owner-loans')).toBe(true);
    expect(canAccessPage('owner', 'settings')).toBe(true);

    expect(canAccessPage('manager', 'sales')).toBe(true);
    expect(canAccessPage('manager', 'purchases')).toBe(true);
    expect(canAccessPage('manager', 'reports')).toBe(true);
    expect(canAccessPage('manager', 'cash-bank')).toBe(false);
    expect(canAccessPage('manager', 'owner-loans')).toBe(false);
    expect(canAccessPage('manager', 'settings')).toBe(false);

    expect(canAccessPage('salesperson', 'sales')).toBe(true);
    expect(canAccessPage('salesperson', 'stock')).toBe(true);
    expect(canAccessPage('salesperson', 'purchases')).toBe(false);
    expect(canAccessPage('salesperson', 'expenses')).toBe(false);
    expect(canAccessPage('salesperson', 'reports')).toBe(false);

    expect(canMutate('salesperson', 'sales')).toBe(true);
    expect(canMutate('salesperson', 'products')).toBe(false);
    expect(canMutate('manager', 'purchases')).toBe(true);
    expect(canMutate('manager', 'settings')).toBe(false);

    expect(getAllowedPages('owner').length).toBe(16);
  });
});
