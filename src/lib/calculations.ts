import type {
  AlertItem,
  BestSellingProduct,
  CashLedgerEntry,
  CashLedgerSummary,
  DamageEntry,
  DateFilter,
  ErpState,
  FinancialSummary,
  Party,
  PartyAccountSummary,
  PaymentAccount,
  Product,
  ProductStockSummary,
  Purchase,
  ReturnEntry,
  Sale,
} from '@/types/erp';

function isWithinDateRange(date: string, filter?: DateFilter): boolean {
  if (!filter) return true;
  if (filter.from && date < filter.from) return false;
  if (filter.to && date > filter.to) return false;
  return true;
}

/**
 * Computes weighted average unit purchase cost (including transport cost) for a product.
 * Falls back to product.purchasePrice if there is no opening stock or purchases.
 */
export function calcWeightedAvgUnitCost(product: Product, purchases: Purchase[]): number {
  let totalUnits = Math.max(0, product.openingStock);
  let totalCost = totalUnits * product.purchasePrice;

  for (const p of purchases) {
    if (p.productId !== product.id || p.quantity <= 0) continue;
    totalUnits += p.quantity;
    totalCost += p.quantity * p.rate + p.transportCost;
  }

  if (totalUnits <= 0) return product.purchasePrice;
  return totalCost / totalUnits;
}

/**
 * Formula 4: Current Stock = Opening Stock + Purchased - Sold + Sales Return - Purchase Return - Damaged
 */
export function calcProductStock(
  product: Product,
  purchases: Purchase[],
  sales: Sale[],
  returns: ReturnEntry[],
  damages: DamageEntry[],
): ProductStockSummary {
  const opening = product.openingStock;
  let purchased = 0;
  let sold = 0;
  let salesReturned = 0;
  let purchaseReturned = 0;
  let damaged = 0;

  for (const p of purchases) {
    if (p.productId === product.id) purchased += p.quantity;
  }
  for (const s of sales) {
    if (s.productId === product.id) sold += s.quantity;
  }
  for (const r of returns) {
    if (r.productId !== product.id) continue;
    if (r.type === 'sales_return') salesReturned += r.quantity;
    else if (r.type === 'purchase_return') purchaseReturned += r.quantity;
  }
  for (const d of damages) {
    if (d.productId === product.id) damaged += d.quantity;
  }

  const currentStock = opening + purchased - sold + salesReturned - purchaseReturned - damaged;
  const avgUnitCost = calcWeightedAvgUnitCost(product, purchases);
  const stockValue = Math.max(0, currentStock) * avgUnitCost;

  return {
    productId: product.id,
    opening,
    purchased,
    sold,
    salesReturned,
    purchaseReturned,
    damaged,
    currentStock,
    isLowStock: currentStock <= product.lowStockLimit,
    avgUnitCost,
    stockValue,
  };
}

/**
 * Formula 5: Net Salary = Basic + Overtime + Bonus - Advance - Deduction
 */
export function calcNetSalary(input: {
  basic: number;
  overtime: number;
  bonus: number;
  advanceTaken: number;
  deductions: number;
}): number {
  return input.basic + input.overtime + input.bonus - input.advanceTaken - input.deductions;
}

/**
 * Formulas 1, 2, 3:
 * 1. Net Sales = Gross Sales - Discount - Sales Return
 * 2. Gross Profit = Net Sales - Cost of Goods Sold (COGS)
 * 3. Net Profit = Gross Profit + Other Income - Total Operating Expenses - Staff Salaries - Damage Loss - Loan Interest
 *
 * CRITICAL: Owner withdrawals and loan principal repayments reduce cash, NEVER expenses or net profit.
 */
export function calcFinancialSummary(state: ErpState, dateFilter?: DateFilter): FinancialSummary {
  const filteredSales = state.sales.filter((s) => isWithinDateRange(s.date, dateFilter));
  const filteredReturns = state.returns.filter((r) => isWithinDateRange(r.date, dateFilter));
  const filteredExpenses = state.expenses.filter((e) => isWithinDateRange(e.date, dateFilter));
  const filteredOtherIncome = state.otherIncomes.filter((i) =>
    isWithinDateRange(i.date, dateFilter),
  );
  const filteredDamages = state.damages.filter((d) => isWithinDateRange(d.date, dateFilter));
  const filteredOwnerTx = state.ownerTransactions.filter((t) =>
    isWithinDateRange(t.date, dateFilter),
  );
  const filteredLoans = state.loans.filter((l) => isWithinDateRange(l.date, dateFilter));
  const filteredInstallments = state.loanInstallments.filter((i) =>
    isWithinDateRange(i.date, dateFilter),
  );
  const filteredPaidSalaries = state.salaries.filter((s) => {
    if (s.status !== 'paid') return false;
    const effectiveDate = s.paymentDate ?? `${s.month}-28`;
    return isWithinDateRange(effectiveDate, dateFilter);
  });

  let grossSales = 0;
  let totalDiscounts = 0;
  const soldQtyByProduct = new Map<string, number>();

  for (const s of filteredSales) {
    grossSales += s.quantity * s.rate;
    totalDiscounts += s.discount;
    soldQtyByProduct.set(s.productId, (soldQtyByProduct.get(s.productId) ?? 0) + s.quantity);
  }

  let salesReturns = 0;
  const returnedQtyByProduct = new Map<string, number>();
  for (const r of filteredReturns) {
    if (r.type === 'sales_return') {
      salesReturns += r.amount;
      returnedQtyByProduct.set(
        r.productId,
        (returnedQtyByProduct.get(r.productId) ?? 0) + r.quantity,
      );
    }
  }

  const netSales = grossSales - totalDiscounts - salesReturns;

  // Compute weighted average unit cost per product across available purchases
  const avgCostByProduct = new Map<string, number>();
  for (const product of state.products) {
    avgCostByProduct.set(product.id, calcWeightedAvgUnitCost(product, state.purchases));
  }

  let cogs = 0;
  for (const [productId, soldQty] of soldQtyByProduct.entries()) {
    const retQty = returnedQtyByProduct.get(productId) ?? 0;
    const netUnits = Math.max(0, soldQty - retQty);
    const unitCost = avgCostByProduct.get(productId) ?? 0;
    cogs += netUnits * unitCost;
  }

  const grossProfit = netSales - cogs;

  const otherIncome = filteredOtherIncome.reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSalaries = filteredPaidSalaries.reduce((sum, s) => sum + s.netSalary, 0);
  const totalDamageLoss = filteredDamages.reduce((sum, d) => sum + d.totalLoss, 0);
  const totalLoanInterest = filteredInstallments.reduce((sum, i) => sum + i.interestPaid, 0);

  const netProfit =
    grossProfit +
    otherIncome -
    totalExpenses -
    totalSalaries -
    totalDamageLoss -
    totalLoanInterest;

  let ownerInvestments = 0;
  let ownerWithdrawals = 0;
  for (const t of filteredOwnerTx) {
    if (t.type === 'investment') ownerInvestments += t.amount;
    else if (t.type === 'withdrawal') ownerWithdrawals += t.amount;
  }

  const loansTaken = filteredLoans.reduce((sum, l) => sum + l.principalAmount, 0);
  const loanPrincipalRepaid = filteredInstallments.reduce((sum, i) => sum + i.principalPaid, 0);

  // Remaining loan balance up to `dateFilter.to` (or overall if no upper bound)
  const loansUpTo = dateFilter?.to
    ? state.loans.filter((l) => l.date <= dateFilter.to!)
    : state.loans;
  const installmentsUpTo = dateFilter?.to
    ? state.loanInstallments.filter((i) => i.date <= dateFilter.to!)
    : state.loanInstallments;
  const totalLoansPrincipal = loansUpTo.reduce((sum, l) => sum + l.principalAmount, 0);
  const totalPrincipalRepaidAll = installmentsUpTo.reduce((sum, i) => sum + i.principalPaid, 0);
  const loanRemainingBalance = Math.max(0, totalLoansPrincipal - totalPrincipalRepaidAll);

  return {
    grossSales,
    totalDiscounts,
    salesReturns,
    netSales,
    cogs,
    grossProfit,
    otherIncome,
    totalExpenses,
    totalSalaries,
    totalDamageLoss,
    totalLoanInterest,
    netProfit,
    ownerInvestments,
    ownerWithdrawals,
    loansTaken,
    loanPrincipalRepaid,
    loanRemainingBalance,
  };
}

/**
 * Calculates running volume, payments, current due, and last payment date for a customer or supplier.
 */
export function calcPartyAccount(party: Party, state: ErpState): PartyAccountSummary {
  let totalVolume = 0;
  let directPaid = 0;
  let lastPaymentDate: string | null = null;

  const trackDate = (d: string) => {
    if (!lastPaymentDate || d > lastPaymentDate) {
      lastPaymentDate = d;
    }
  };

  if (party.type === 'customer') {
    for (const s of state.sales) {
      if (s.customerId !== party.id) continue;
      totalVolume += s.total;
      directPaid += s.paid;
      if (s.paid > 0) trackDate(s.date);
    }
  } else {
    for (const p of state.purchases) {
      if (p.supplierId !== party.id) continue;
      totalVolume += p.total;
      directPaid += p.paid;
      if (p.paid > 0) trackDate(p.date);
    }
  }

  let ledgerPaid = 0;
  for (const pay of state.partyPayments) {
    if (pay.partyId !== party.id) continue;
    ledgerPaid += pay.amount;
    if (pay.amount > 0) trackDate(pay.date);
  }

  const totalPaid = directPaid + ledgerPaid;
  const currentDue = party.openingDue + totalVolume - totalPaid;

  return {
    partyId: party.id,
    openingDue: party.openingDue,
    totalVolume,
    totalPaid,
    currentDue,
    lastPaymentDate,
  };
}

/**
 * Combines opening balances and all cash-affecting transactions across every module
 * into a chronological Cash & Bank ledger with running balances and per-account totals.
 */
export function calcCashLedger(state: ErpState): CashLedgerSummary {
  const balancesByAccount: Record<PaymentAccount, number> = {
    cash: state.company.openingCash,
    bank: state.company.openingBank,
    bKash: state.company.openingBkash,
    Nagad: state.company.openingNagad,
  };

  interface RawLedgerItem {
    id: string;
    date: string;
    account: PaymentAccount;
    moneyIn: number;
    moneyOut: number;
    reference: string;
    category: string;
    note?: string | undefined;
    isSystemGenerated?: boolean | undefined;
    sortOrder: number;
  }

  const raw: RawLedgerItem[] = [];

  const openingEntries: Array<{ account: PaymentAccount; amount: number; label: string }> = [
    { account: 'cash', amount: state.company.openingCash, label: 'Cash' },
    { account: 'bank', amount: state.company.openingBank, label: 'Bank' },
    { account: 'bKash', amount: state.company.openingBkash, label: 'bKash' },
    { account: 'Nagad', amount: state.company.openingNagad, label: 'Nagad' },
  ];

  for (const op of openingEntries) {
    if (op.amount > 0) {
      raw.push({
        id: `opening-${op.account}`,
        date: '2026-01-01',
        account: op.account,
        moneyIn: op.amount,
        moneyOut: 0,
        reference: 'OPENING',
        category: 'Opening Balance',
        note: `Opening ${op.label} balance`,
        isSystemGenerated: true,
        sortOrder: 0,
      });
    }
  }

  for (const s of state.sales) {
    if (s.paid > 0) {
      raw.push({
        id: `sale-${s.id}`,
        date: s.date,
        account: s.account,
        moneyIn: s.paid,
        moneyOut: 0,
        reference: s.invoiceNo,
        category: 'Sales Receipt',
        note: s.note,
        isSystemGenerated: true,
        sortOrder: 1,
      });
      balancesByAccount[s.account] += s.paid;
    }
  }

  for (const p of state.purchases) {
    if (p.paid > 0) {
      raw.push({
        id: `purchase-${p.id}`,
        date: p.date,
        account: p.account,
        moneyIn: 0,
        moneyOut: p.paid,
        reference: p.billNo,
        category: 'Purchase Payment',
        note: p.note,
        isSystemGenerated: true,
        sortOrder: 2,
      });
      balancesByAccount[p.account] -= p.paid;
    }
  }

  for (const r of state.returns) {
    if (r.amount <= 0) continue;
    if (r.type === 'sales_return') {
      raw.push({
        id: `return-${r.id}`,
        date: r.date,
        account: r.account,
        moneyIn: 0,
        moneyOut: r.amount,
        reference: r.originalRef,
        category: 'Sales Return Refund',
        note: r.reason,
        isSystemGenerated: true,
        sortOrder: 3,
      });
      balancesByAccount[r.account] -= r.amount;
    } else {
      raw.push({
        id: `return-${r.id}`,
        date: r.date,
        account: r.account,
        moneyIn: r.amount,
        moneyOut: 0,
        reference: r.originalRef,
        category: 'Purchase Return Refund',
        note: r.reason,
        isSystemGenerated: true,
        sortOrder: 3,
      });
      balancesByAccount[r.account] += r.amount;
    }
  }

  for (const e of state.expenses) {
    if (e.amount <= 0) continue;
    raw.push({
      id: `expense-${e.id}`,
      date: e.date,
      account: e.account,
      moneyIn: 0,
      moneyOut: e.amount,
      reference: `EXP-${e.type.toUpperCase()}`,
      category: `Expense (${e.type})`,
      note: e.note,
      isSystemGenerated: true,
      sortOrder: 4,
    });
    balancesByAccount[e.account] -= e.amount;
  }

  for (const inc of state.otherIncomes) {
    if (inc.amount <= 0) continue;
    raw.push({
      id: `income-${inc.id}`,
      date: inc.date,
      account: inc.account,
      moneyIn: inc.amount,
      moneyOut: 0,
      reference: inc.source,
      category: 'Other Income',
      note: inc.note,
      isSystemGenerated: true,
      sortOrder: 5,
    });
    balancesByAccount[inc.account] += inc.amount;
  }

  const partyNameMap = new Map<string, string>();
  for (const p of state.parties) {
    partyNameMap.set(p.id, p.shopName || p.name);
  }

  for (const pay of state.partyPayments) {
    if (pay.amount <= 0) continue;
    const partyLabel = partyNameMap.get(pay.partyId) ?? pay.partyId;
    if (pay.partyType === 'customer') {
      raw.push({
        id: `partypay-${pay.id}`,
        date: pay.date,
        account: pay.account,
        moneyIn: pay.amount,
        moneyOut: 0,
        reference: pay.reference,
        category: 'Customer Due Collection',
        note: pay.note ?? partyLabel,
        isSystemGenerated: true,
        sortOrder: 6,
      });
      balancesByAccount[pay.account] += pay.amount;
    } else {
      raw.push({
        id: `partypay-${pay.id}`,
        date: pay.date,
        account: pay.account,
        moneyIn: 0,
        moneyOut: pay.amount,
        reference: pay.reference,
        category: 'Supplier Due Payment',
        note: pay.note ?? partyLabel,
        isSystemGenerated: true,
        sortOrder: 6,
      });
      balancesByAccount[pay.account] -= pay.amount;
    }
  }

  const staffNameMap = new Map<string, string>();
  for (const st of state.staff) {
    staffNameMap.set(st.id, st.name);
  }

  for (const sal of state.salaries) {
    if (sal.status !== 'paid' || sal.netSalary <= 0) continue;
    const staffLabel = staffNameMap.get(sal.staffId) ?? sal.staffId;
    raw.push({
      id: `salary-${sal.id}`,
      date: sal.paymentDate ?? `${sal.month}-28`,
      account: sal.account,
      moneyIn: 0,
      moneyOut: sal.netSalary,
      reference: `SAL-${sal.month}`,
      category: 'Staff Salary',
      note: `${staffLabel} (${sal.month})`,
      isSystemGenerated: true,
      sortOrder: 7,
    });
    balancesByAccount[sal.account] -= sal.netSalary;
  }

  for (const ot of state.ownerTransactions) {
    if (ot.amount <= 0) continue;
    if (ot.type === 'investment') {
      raw.push({
        id: `owner-${ot.id}`,
        date: ot.date,
        account: ot.account,
        moneyIn: ot.amount,
        moneyOut: 0,
        reference: 'OWNER-INV',
        category: 'Owner Investment',
        note: ot.note,
        isSystemGenerated: true,
        sortOrder: 8,
      });
      balancesByAccount[ot.account] += ot.amount;
    } else {
      raw.push({
        id: `owner-${ot.id}`,
        date: ot.date,
        account: ot.account,
        moneyIn: 0,
        moneyOut: ot.amount,
        reference: 'OWNER-WD',
        category: 'Owner Withdrawal',
        note: ot.note,
        isSystemGenerated: true,
        sortOrder: 8,
      });
      balancesByAccount[ot.account] -= ot.amount;
    }
  }

  for (const loan of state.loans) {
    if (loan.principalAmount <= 0) continue;
    raw.push({
      id: `loan-${loan.id}`,
      date: loan.date,
      account: 'bank',
      moneyIn: loan.principalAmount,
      moneyOut: 0,
      reference: `LOAN-${loan.lenderName}`,
      category: 'Loan Disbursed',
      note: loan.note,
      isSystemGenerated: true,
      sortOrder: 9,
    });
    balancesByAccount.bank += loan.principalAmount;
  }

  const loanLenderMap = new Map<string, string>();
  for (const loan of state.loans) {
    loanLenderMap.set(loan.id, loan.lenderName);
  }

  for (const inst of state.loanInstallments) {
    const totalOut = inst.principalPaid + inst.interestPaid;
    if (totalOut <= 0) continue;
    const lender = loanLenderMap.get(inst.loanId) ?? inst.loanId;
    raw.push({
      id: `loan-inst-${inst.id}`,
      date: inst.date,
      account: inst.account,
      moneyIn: 0,
      moneyOut: totalOut,
      reference: `INST-${lender}`,
      category: 'Loan Installment',
      note: inst.note ?? `Principal ৳${inst.principalPaid} + Interest ৳${inst.interestPaid}`,
      isSystemGenerated: true,
      sortOrder: 10,
    });
    balancesByAccount[inst.account] -= totalOut;
  }

  for (const entry of state.cashEntries) {
    raw.push({
      id: entry.id,
      date: entry.date,
      account: entry.account,
      moneyIn: entry.moneyIn,
      moneyOut: entry.moneyOut,
      reference: entry.reference,
      category: entry.category,
      note: entry.note,
      isSystemGenerated: false,
      sortOrder: 11,
    });
    balancesByAccount[entry.account] += entry.moneyIn - entry.moneyOut;
  }

  raw.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });

  let runningBalance = 0;
  const entries: CashLedgerEntry[] = raw.map((item) => {
    runningBalance += item.moneyIn - item.moneyOut;
    return {
      id: item.id,
      date: item.date,
      account: item.account,
      moneyIn: item.moneyIn,
      moneyOut: item.moneyOut,
      reference: item.reference,
      category: item.category,
      note: item.note,
      isSystemGenerated: item.isSystemGenerated,
      runningBalance,
    };
  });

  const totalBalance =
    balancesByAccount.cash +
    balancesByAccount.bank +
    balancesByAccount.bKash +
    balancesByAccount.Nagad;

  return {
    entries,
    balancesByAccount,
    totalBalance,
  };
}

/**
 * Ranks products by sales performance within an optional date range.
 */
export function calcBestSellingProducts(
  state: ErpState,
  dateFilter?: DateFilter,
): BestSellingProduct[] {
  const filteredSales = state.sales.filter((s) => isWithinDateRange(s.date, dateFilter));
  const filteredReturns = state.returns.filter(
    (r) => r.type === 'sales_return' && isWithinDateRange(r.date, dateFilter),
  );

  const statsMap = new Map<
    string,
    { unitsSold: number; unitsReturned: number; grossRevenue: number; discount: number; returnAmt: number }
  >();

  for (const s of filteredSales) {
    const cur = statsMap.get(s.productId) ?? {
      unitsSold: 0,
      unitsReturned: 0,
      grossRevenue: 0,
      discount: 0,
      returnAmt: 0,
    };
    cur.unitsSold += s.quantity;
    cur.grossRevenue += s.quantity * s.rate;
    cur.discount += s.discount;
    statsMap.set(s.productId, cur);
  }

  for (const r of filteredReturns) {
    const cur = statsMap.get(r.productId) ?? {
      unitsSold: 0,
      unitsReturned: 0,
      grossRevenue: 0,
      discount: 0,
      returnAmt: 0,
    };
    cur.unitsReturned += r.quantity;
    cur.returnAmt += r.amount;
    statsMap.set(r.productId, cur);
  }

  const results: BestSellingProduct[] = [];

  for (const product of state.products) {
    const st = statsMap.get(product.id);
    if (!st || st.unitsSold === 0) continue;
    const avgCost = calcWeightedAvgUnitCost(product, state.purchases);
    const netUnitsSold = Math.max(0, st.unitsSold - st.unitsReturned);
    const netRevenue = st.grossRevenue - st.discount - st.returnAmt;
    const estimatedProfit = netRevenue - netUnitsSold * avgCost;

    results.push({
      productId: product.id,
      code: product.code,
      name: product.name,
      category: product.category,
      size: product.size,
      color: product.color,
      unitsSold: st.unitsSold,
      unitsReturned: st.unitsReturned,
      netUnitsSold,
      grossRevenue: st.grossRevenue,
      netRevenue,
      estimatedProfit,
    });
  }

  results.sort((a, b) => b.netUnitsSold - a.netUnitsSold || b.netRevenue - a.netRevenue);
  return results;
}

/**
 * Generates actionable operational alerts across stock, customer/supplier dues,
 * pending salaries, and active loan balances.
 */
export function calcAlerts(state: ErpState): AlertItem[] {
  const readSet = new Set(state.readNotificationIds);
  const alerts: AlertItem[] = [];

  // 1. Low stock alerts
  for (const product of state.products) {
    const stock = calcProductStock(
      product,
      state.purchases,
      state.sales,
      state.returns,
      state.damages,
    );
    if (stock.isLowStock) {
      const id = `alert-stock-${product.id}`;
      alerts.push({
        id,
        category: 'low_stock',
        severity: stock.currentStock <= Math.floor(product.lowStockLimit / 2) ? 'critical' : 'warning',
        title: `Low Stock: ${product.name} (${product.size}, ${product.color})`,
        description: `Only ${stock.currentStock} ${product.unit}(s) left (reorder limit: ${product.lowStockLimit}).`,
        targetPage: 'stock',
        entityId: product.id,
        read: readSet.has(id),
      });
    }
  }

  // 2. Customer & Supplier dues
  for (const party of state.parties) {
    const acc = calcPartyAccount(party, state);
    if (acc.currentDue > 0) {
      if (party.type === 'customer') {
        const id = `alert-customer-due-${party.id}`;
        alerts.push({
          id,
          category: 'customer_due',
          severity: acc.currentDue >= 50_000 ? 'critical' : 'warning',
          title: `Customer Receivable: ${party.shopName}`,
          description: `${party.name} has an outstanding balance of ৳${Math.round(acc.currentDue).toLocaleString('en-IN')}.`,
          targetPage: 'customers',
          amount: acc.currentDue,
          entityId: party.id,
          read: readSet.has(id),
        });
      } else {
        const id = `alert-supplier-due-${party.id}`;
        alerts.push({
          id,
          category: 'supplier_due',
          severity: acc.currentDue >= 80_000 ? 'warning' : 'info',
          title: `Supplier Payable: ${party.shopName}`,
          description: `Due to ${party.name}: ৳${Math.round(acc.currentDue).toLocaleString('en-IN')}.`,
          targetPage: 'suppliers',
          amount: acc.currentDue,
          entityId: party.id,
          read: readSet.has(id),
        });
      }
    }
  }

  // 3. Pending staff salaries
  const staffMap = new Map(state.staff.map((s) => [s.id, s]));
  for (const sal of state.salaries) {
    if (sal.status === 'pending') {
      const member = staffMap.get(sal.staffId);
      const id = `alert-salary-${sal.id}`;
      alerts.push({
        id,
        category: 'pending_salary',
        severity: 'warning',
        title: `Pending Salary: ${member?.name ?? sal.staffId} (${sal.month})`,
        description: `Net salary of ৳${Math.round(sal.netSalary).toLocaleString('en-IN')} is awaiting disbursement.`,
        targetPage: 'staff',
        amount: sal.netSalary,
        entityId: sal.id,
        read: readSet.has(id),
      });
    }
  }

  // 4. Active business loans with remaining principal
  for (const loan of state.loans) {
    const repaid = state.loanInstallments
      .filter((i) => i.loanId === loan.id)
      .reduce((sum, i) => sum + i.principalPaid, 0);
    const remaining = Math.max(0, loan.principalAmount - repaid);
    if (remaining > 0) {
      const id = `alert-loan-${loan.id}`;
      alerts.push({
        id,
        category: 'loan_balance',
        severity: 'info',
        title: `Active Loan: ${loan.lenderName}`,
        description: `Remaining principal ৳${Math.round(remaining).toLocaleString('en-IN')} at ${loan.interestRate}% p.a.`,
        targetPage: 'owner-loans',
        amount: remaining,
        entityId: loan.id,
        read: readSet.has(id),
      });
    }
  }

  const severityRank: Record<AlertItem['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return alerts;
}
