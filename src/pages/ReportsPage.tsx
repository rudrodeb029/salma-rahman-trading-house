import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Lock,
  Printer,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcBestSellingProducts, calcFinancialSummary } from "@/lib/calculations";
import { exportToPDF, formatBDT, formatCompactBDT, formatDate, todayISO } from "@/lib/format";
import { canViewProfit } from "@/lib/rbac";
import { useErp } from "@/store/erp-store";
import type { ExpenseCategory, PaymentAccount } from "@/types/erp";

const ACCOUNTS: Array<{ key: PaymentAccount; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank" },
  { key: "bKash", label: "bKash" },
  { key: "Nagad", label: "Nagad" },
];

const EXPENSE_CATEGORIES: Array<{ key: ExpenseCategory; label: string }> = [
  { key: "rent", label: "Shop / Godown Rent" },
  { key: "electricity", label: "Electricity" },
  { key: "internet", label: "Internet & Phone" },
  { key: "transport", label: "Transport & Delivery" },
  { key: "food", label: "Staff Tea & Food" },
  { key: "packaging", label: "Packaging & Poly" },
  { key: "marketing", label: "Marketing & Promo" },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ReportTab =
  | "daily-closing"
  | "profit-loss"
  | "stock-report"
  | "best-selling"
  | "dues"
  | "expense-salary";

export function ReportsPage() {
  const { state, cashLedger, stockByProductId, partyAccountsById } = useErp();
  const role = state.currentRole;
  const isOwner = canViewProfit(role);

  const [activeTab, setActiveTab] = useState<ReportTab>("daily-closing");
  const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());
  const [pnlMode, setPnlMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayISO().slice(0, 7));
  const [bestPeriod, setBestPeriod] = useState<"all" | "month" | "year">("all");

  // Available months from data
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const currentYm = todayISO().slice(0, 7);
    set.add(currentYm);
    for (const s of state.sales) set.add(s.date.slice(0, 7));
    for (const e of state.expenses) set.add(e.date.slice(0, 7));
    for (const sal of state.salaries) set.add(sal.month);
    return Array.from(set).sort().reverse();
  }, [state.sales, state.expenses, state.salaries]);

  // 1. Daily Sales & Cash Closing
  const dailyData = useMemo(() => {
    const salesOnDate = state.sales.filter((s) => s.date === selectedDate);
    const partyMap = new Map(state.parties.map((p) => [p.id, p]));
    const prodMap = new Map(state.products.map((p) => [p.id, p]));

    let grossSales = 0;
    let totalDiscount = 0;
    let netSales = 0;
    let totalPaid = 0;
    let totalDue = 0;

    for (const s of salesOnDate) {
      grossSales += s.quantity * s.rate;
      totalDiscount += s.discount;
      netSales += s.total;
      totalPaid += s.paid;
      totalDue += s.due;
    }

    const accountRows = ACCOUNTS.map(({ key, label }) => {
      let opening = 0;
      let moneyIn = 0;
      let moneyOut = 0;

      for (const entry of cashLedger.entries) {
        if (entry.account !== key) continue;
        if (entry.date < selectedDate) {
          opening += entry.moneyIn - entry.moneyOut;
        } else if (entry.date === selectedDate) {
          moneyIn += entry.moneyIn;
          moneyOut += entry.moneyOut;
        }
      }
      return {
        key,
        label,
        opening,
        moneyIn,
        moneyOut,
        closing: opening + moneyIn - moneyOut,
      };
    });

    const totals = accountRows.reduce(
      (acc, r) => ({
        opening: acc.opening + r.opening,
        moneyIn: acc.moneyIn + r.moneyIn,
        moneyOut: acc.moneyOut + r.moneyOut,
        closing: acc.closing + r.closing,
      }),
      { opening: 0, moneyIn: 0, moneyOut: 0, closing: 0 },
    );

    return {
      salesOnDate: salesOnDate.map((s) => ({
        ...s,
        customerName: partyMap.get(s.customerId)?.shopName ?? "Walk-in",
        productName: prodMap.get(s.productId)?.name ?? s.productId,
        productCode: prodMap.get(s.productId)?.code ?? "",
      })),
      grossSales,
      totalDiscount,
      netSales,
      totalPaid,
      totalDue,
      accountRows,
      totals,
    };
  }, [state.sales, state.parties, state.products, cashLedger.entries, selectedDate]);

  // 2. Profit & Loss (Owner only)
  const pnlSummary = useMemo(() => {
    if (pnlMode === "monthly") {
      return calcFinancialSummary(state, {
        from: `${selectedMonth}-01`,
        to: `${selectedMonth}-31`,
      });
    }
    const year = selectedMonth.slice(0, 4) || "2026";
    return calcFinancialSummary(state, {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    });
  }, [state, pnlMode, selectedMonth]);

  const monthlyPnlChart = useMemo(() => {
    const monthsAsc = [...availableMonths].sort().slice(-6);
    return monthsAsc.map((ym) => {
      const f = calcFinancialSummary(state, { from: `${ym}-01`, to: `${ym}-31` });
      const mIdx = Number(ym.split("-")[1]) - 1;
      const totalOperating = f.totalExpenses + f.totalSalaries + f.totalDamageLoss + f.totalLoanInterest;
      return {
        month: SHORT_MONTHS[mIdx] ?? ym,
        netSales: Math.round(f.netSales),
        expenses: Math.round(totalOperating),
        netProfit: Math.round(f.netProfit),
      };
    });
  }, [state, availableMonths]);

  // 3. Stock & Low Stock Report
  const stockReport = useMemo(() => {
    const rows = state.products.map((p) => {
      const st = stockByProductId[p.id];
      return {
        product: p,
        opening: st?.opening ?? p.openingStock,
        purchased: st?.purchased ?? 0,
        sold: st?.sold ?? 0,
        salesReturned: st?.salesReturned ?? 0,
        purchaseReturned: st?.purchaseReturned ?? 0,
        damaged: st?.damaged ?? 0,
        currentStock: st?.currentStock ?? p.openingStock,
        isLowStock: st?.isLowStock ?? false,
        avgUnitCost: st?.avgUnitCost ?? p.purchasePrice,
        stockValue: st?.stockValue ?? 0,
      };
    });
    const totalUnits = rows.reduce((s, r) => s + Math.max(0, r.currentStock), 0);
    const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
    const lowStockRows = rows.filter((r) => r.isLowStock);
    return { rows, totalUnits, totalValue, lowStockRows };
  }, [state.products, stockByProductId]);

  // 4. Best-Selling Products
  const bestSellingData = useMemo(() => {
    const today = todayISO();
    const filter =
      bestPeriod === "month"
        ? { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` }
        : bestPeriod === "year"
          ? { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
          : undefined;
    const ranked = calcBestSellingProducts(state, filter);

    const catMap = new Map<string, { category: string; units: number; revenue: number }>();
    for (const item of ranked) {
      const cur = catMap.get(item.category) ?? { category: item.category, units: 0, revenue: 0 };
      cur.units += item.netUnitsSold;
      cur.revenue += Math.round(item.netRevenue);
      catMap.set(item.category, cur);
    }

    return {
      ranked,
      byCategory: Array.from(catMap.values()),
    };
  }, [state, bestPeriod]);

  // 5. Customer & Supplier Dues
  const duesData = useMemo(() => {
    const customers = state.parties
      .filter((p) => p.type === "customer")
      .map((p) => ({ party: p, acc: partyAccountsById[p.id] }))
      .sort((a, b) => (b.acc?.currentDue ?? 0) - (a.acc?.currentDue ?? 0));

    const suppliers = state.parties
      .filter((p) => p.type === "supplier")
      .map((p) => ({ party: p, acc: partyAccountsById[p.id] }))
      .sort((a, b) => (b.acc?.currentDue ?? 0) - (a.acc?.currentDue ?? 0));

    const totalReceivable = customers.reduce((s, c) => s + Math.max(0, c.acc?.currentDue ?? 0), 0);
    const totalPayable = suppliers.reduce((s, c) => s + Math.max(0, c.acc?.currentDue ?? 0), 0);

    return {
      customers,
      suppliers,
      totalReceivable,
      totalPayable,
      netPosition: totalReceivable - totalPayable,
    };
  }, [state.parties, partyAccountsById]);

  // 6. Expense & Salary Reports
  const expenseSalaryData = useMemo(() => {
    const expByCategory = EXPENSE_CATEGORIES.map(({ key, label }) => {
      const entries = state.expenses.filter((e) => e.type === key);
      const total = entries.reduce((s, e) => s + e.amount, 0);
      return { key, label, count: entries.length, total };
    });
    const totalExpenses = expByCategory.reduce((s, c) => s + c.total, 0);

    const staffMap = new Map(state.staff.map((s) => [s.id, s]));
    const salaryRows = [...state.salaries]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((sal) => ({
        ...sal,
        staffName: staffMap.get(sal.staffId)?.name ?? sal.staffId,
        position: staffMap.get(sal.staffId)?.position ?? "",
      }));

    const totalPaidSalary = salaryRows
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.netSalary, 0);
    const totalPendingSalary = salaryRows
      .filter((s) => s.status === "pending")
      .reduce((sum, s) => sum + s.netSalary, 0);

    return {
      expByCategory,
      totalExpenses,
      salaryRows,
      totalPaidSalary,
      totalPendingSalary,
    };
  }, [state.expenses, state.salaries, state.staff]);

  const handleExportCurrentCSV = () => {
    if (activeTab === "daily-closing") {
      exportToPDF({
        filename: `daily-cash-closing-${selectedDate}`,
        title: `Daily Sales & Cash Closing Report — ${formatDate(selectedDate)}`,
        subtitle: "Account-wise opening, inflow, outflow, and closing balance in BDT",
        headers: ["Account", "Opening Balance", "Money In", "Money Out", "Closing Balance"],
        rows: [
          ...dailyData.accountRows.map((r) => [
            r.label,
            formatBDT(r.opening),
            formatBDT(r.moneyIn),
            formatBDT(r.moneyOut),
            formatBDT(r.closing),
          ]),
          [
            "TOTAL",
            formatBDT(dailyData.totals.opening),
            formatBDT(dailyData.totals.moneyIn),
            formatBDT(dailyData.totals.moneyOut),
            formatBDT(dailyData.totals.closing),
          ],
        ],
        company: state.company,
        orientation: "portrait",
      });
      toast.success("Opened Daily Sales & Cash Closing PDF");
      return;
    }

    if (activeTab === "profit-loss") {
      if (!isOwner) {
        toast.error("Profit & Loss export is restricted to Owner role");
        return;
      }
      const periodLabel = pnlMode === "monthly" ? selectedMonth : selectedMonth.slice(0, 4);
      exportToPDF({
        filename: `profit-loss-${pnlMode}-${periodLabel}`,
        title: `${pnlMode === "monthly" ? "Monthly" : "Yearly"} Profit & Loss Statement`,
        subtitle: `Period: ${pnlMode === "monthly" ? formatDate(selectedMonth) : periodLabel} • Owner Confidential`,
        headers: ["Line Item", "Amount (BDT)"],
        rows: [
          ["Gross Sales", formatBDT(pnlSummary.grossSales)],
          ["Less: Discounts", formatBDT(-pnlSummary.totalDiscounts)],
          ["Less: Sales Returns", formatBDT(-pnlSummary.salesReturns)],
          ["= Net Sales", formatBDT(pnlSummary.netSales)],
          ["Less: COGS (incl. transport)", formatBDT(-pnlSummary.cogs)],
          ["= Gross Profit", formatBDT(pnlSummary.grossProfit)],
          ["Plus: Other Income", formatBDT(pnlSummary.otherIncome)],
          ["Less: Operating Expenses", formatBDT(-pnlSummary.totalExpenses)],
          ["Less: Staff Salaries (Paid)", formatBDT(-pnlSummary.totalSalaries)],
          ["Less: Damage Loss", formatBDT(-pnlSummary.totalDamageLoss)],
          ["Less: Loan Interest", formatBDT(-pnlSummary.totalLoanInterest)],
          ["= Net Profit", formatBDT(pnlSummary.netProfit)],
          ["Non-Expense Cash Memo: Owner Investments", formatBDT(pnlSummary.ownerInvestments)],
          ["Non-Expense Cash Memo: Owner Withdrawals", formatBDT(pnlSummary.ownerWithdrawals)],
          ["Non-Expense Cash Memo: Loan Principal Repaid", formatBDT(pnlSummary.loanPrincipalRepaid)],
          ["Non-Expense Cash Memo: Loan Remaining Principal", formatBDT(pnlSummary.loanRemainingBalance)],
        ],
        company: state.company,
        summary: [
          { label: "Net Sales", value: formatBDT(pnlSummary.netSales) },
          { label: "Gross Profit", value: formatBDT(pnlSummary.grossProfit), tone: pnlSummary.grossProfit >= 0 ? "success" : "danger" },
          { label: "Net Profit", value: formatBDT(pnlSummary.netProfit), tone: pnlSummary.netProfit >= 0 ? "success" : "danger" },
        ],
        orientation: "portrait",
      });
      toast.success("Opened Profit & Loss PDF");
      return;
    }

    if (activeTab === "stock-report") {
      exportToPDF({
        filename: `stock-valuation-${todayISO()}`,
        title: "Stock & Low Stock Valuation Report",
        subtitle: `${stockReport.rows.length} SKU(s) • All costs & valuations in BDT`,
        headers: ["SKU", "Product", "Category", "Size", "Color", "Current Stock", "Low Limit", "Avg Cost", "Stock Value", "Status"],
        rows: stockReport.rows.map((r) => [
          r.product.code,
          r.product.name,
          r.product.category,
          r.product.size,
          r.product.color,
          r.currentStock,
          r.product.lowStockLimit,
          formatBDT(r.avgUnitCost),
          formatBDT(r.stockValue),
          r.isLowStock ? "LOW STOCK" : "OK",
        ]),
        company: state.company,
        orientation: "landscape",
      });
      toast.success("Opened Stock & Low Stock PDF");
      return;
    }

    if (activeTab === "best-selling") {
      const headers = isOwner
        ? ["Rank", "SKU", "Product", "Category", "Size", "Color", "Net Units Sold", "Net Revenue", "Est. Profit"]
        : ["Rank", "SKU", "Product", "Category", "Size", "Color", "Net Units Sold", "Net Revenue"];
      exportToPDF({
        filename: `best-selling-products-${bestPeriod}`,
        title: "Best-Selling Products Ranking",
        subtitle: `Period: ${bestPeriod} • Ranked by net units sold`,
        headers,
        rows: bestSellingData.ranked.map((item, idx) => {
          const base = [
            idx + 1,
            item.code,
            item.name,
            item.category,
            item.size,
            item.color,
            item.netUnitsSold,
            formatBDT(item.netRevenue),
          ];
          return isOwner ? [...base, formatBDT(item.estimatedProfit)] : base;
        }),
        company: state.company,
        orientation: "landscape",
      });
      toast.success("Opened Best-Selling Products PDF");
      return;
    }

    if (activeTab === "dues") {
      exportToPDF({
        filename: `customer-supplier-dues-${todayISO()}`,
        title: "Customer Due & Supplier Due Report",
        subtitle: "Receivables & payables ledger summary in BDT",
        headers: ["Type", "Code", "Shop Name", "Contact", "Opening Due", "Total Volume", "Total Paid", "Current Due", "Last Payment"],
        rows: [
          ...duesData.customers.map((c) => [
            "Customer",
            c.party.code,
            c.party.shopName,
            c.party.name,
            formatBDT(c.acc?.openingDue ?? 0),
            formatBDT(c.acc?.totalVolume ?? 0),
            formatBDT(c.acc?.totalPaid ?? 0),
            formatBDT(c.acc?.currentDue ?? 0),
            c.acc?.lastPaymentDate ? formatDate(c.acc.lastPaymentDate) : "—",
          ]),
          ...duesData.suppliers.map((s) => [
            "Supplier",
            s.party.code,
            s.party.shopName,
            s.party.name,
            formatBDT(s.acc?.openingDue ?? 0),
            formatBDT(s.acc?.totalVolume ?? 0),
            formatBDT(s.acc?.totalPaid ?? 0),
            formatBDT(s.acc?.currentDue ?? 0),
            s.acc?.lastPaymentDate ? formatDate(s.acc.lastPaymentDate) : "—",
          ]),
        ],
        company: state.company,
        orientation: "landscape",
      });
      toast.success("Opened Customer & Supplier Dues PDF");
      return;
    }

    exportToPDF({
      filename: `expense-salary-report-${todayISO()}`,
      title: "Expense & Salary Disbursement Report",
      subtitle: "Operating expenses by category and paid staff salaries in BDT",
      headers: ["Category", "Entries", "Total Amount (BDT)"],
      rows: [
        ...expenseSalaryData.expByCategory.map((c) => [c.label, c.count, formatBDT(c.total)]),
        ["TOTAL OPERATING EXPENSES", state.expenses.length, formatBDT(expenseSalaryData.totalExpenses)],
        ["TOTAL PAID SALARIES", expenseSalaryData.salaryRows.filter((s) => s.status === "paid").length, formatBDT(expenseSalaryData.totalPaidSalary)],
      ],
      company: state.company,
      orientation: "portrait",
    });
    toast.success("Opened Expense & Salary PDF");
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Reports Center
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Six core financial, inventory, sales, due, and payroll reports, branded PDF ready.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handleExportCurrentCSV}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            <Download className="size-3.5 sm:size-4" />
            Export PDF
          </button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ReportTab)}
        className="space-y-4 sm:space-y-5"
      >
        <div className="card-surface p-1.5 sm:p-2 print:hidden">
          <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0">
            <TabsTrigger
              value="daily-closing"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              1. Daily Sales & Cash Closing
            </TabsTrigger>
            <TabsTrigger
              value="profit-loss"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              2. Profit & Loss {!isOwner && <Lock className="ml-1 size-3 opacity-60" />}
            </TabsTrigger>
            <TabsTrigger
              value="stock-report"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              3. Stock & Low Stock
            </TabsTrigger>
            <TabsTrigger
              value="best-selling"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              4. Best-Selling Products
            </TabsTrigger>
            <TabsTrigger
              value="dues"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              5. Customer & Supplier Dues
            </TabsTrigger>
            <TabsTrigger
              value="expense-salary"
              className="shrink-0 rounded-xl px-3 py-2 text-xs sm:px-3.5 sm:text-sm"
            >
              6. Expense & Salary
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: DAILY SALES & CASH CLOSING */}
        <TabsContent value="daily-closing" className="space-y-5">
          <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-semibold">Daily Sales & Cash Closing</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl border bg-background px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={() => setSelectedDate(todayISO())}
                className="rounded-xl border bg-muted px-3 py-2 text-xs font-medium hover:bg-accent"
              >
                Today
              </button>
              {state.sales[0]?.date && state.sales[0].date !== selectedDate && (
                <button
                  onClick={() => setSelectedDate(state.sales[0]!.date)}
                  className="rounded-xl bg-lime-soft px-3 py-2 text-xs font-medium hover:opacity-90"
                >
                  Latest sale ({formatDate(state.sales[0].date)})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Invoices on date</p>
              <p className="mt-2 text-2xl font-semibold">{dailyData.salesOnDate.length}</p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Net sales</p>
              <p className="mt-2 text-2xl font-semibold">{formatBDT(dailyData.netSales)}</p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Collected on sales</p>
              <p className="mt-2 text-2xl font-semibold text-success">
                {formatBDT(dailyData.totalPaid)}
              </p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Closing cash & bank</p>
              <p className="mt-2 text-2xl font-semibold">{formatBDT(dailyData.totals.closing)}</p>
            </div>
          </div>

          {/* Account-wise Cash Closing Table */}
          <section className="card-surface overflow-hidden p-5 sm:p-6">
            <h3 className="text-base font-semibold">Cash & Bank Closing by Account</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2.5 pr-4">Account</th>
                    <th className="py-2.5 px-4 text-right">Opening</th>
                    <th className="py-2.5 px-4 text-right">Money In</th>
                    <th className="py-2.5 px-4 text-right">Money Out</th>
                    <th className="py-2.5 pl-4 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dailyData.accountRows.map((r) => (
                    <tr key={r.key}>
                      <td className="py-3 pr-4 font-medium">{r.label}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        {formatBDT(r.opening)}
                      </td>
                      <td className="py-3 px-4 text-right text-success">
                        {r.moneyIn > 0 ? `+${formatBDT(r.moneyIn)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right text-peach">
                        {r.moneyOut > 0 ? `-${formatBDT(r.moneyOut)}` : "—"}
                      </td>
                      <td className="py-3 pl-4 text-right font-semibold">{formatBDT(r.closing)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50 font-semibold">
                    <td className="py-3 pr-4">Total</td>
                    <td className="py-3 px-4 text-right">{formatBDT(dailyData.totals.opening)}</td>
                    <td className="py-3 px-4 text-right text-success">
                      +{formatBDT(dailyData.totals.moneyIn)}
                    </td>
                    <td className="py-3 px-4 text-right text-peach">
                      -{formatBDT(dailyData.totals.moneyOut)}
                    </td>
                    <td className="py-3 pl-4 text-right">{formatBDT(dailyData.totals.closing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Daily Sales Breakdown */}
          <section className="card-surface overflow-hidden p-5 sm:p-6">
            <h3 className="text-base font-semibold">
              Sales Breakdown ({formatDate(selectedDate)})
            </h3>
            {dailyData.salesOnDate.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-muted/60 p-6 text-center text-sm text-muted-foreground">
                No sales invoices recorded on {formatDate(selectedDate)}.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2.5 pr-4">Invoice</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 pl-3 text-right">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dailyData.salesOnDate.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-4 font-medium">{s.invoiceNo}</td>
                        <td className="py-2.5 px-3">{s.customerName}</td>
                        <td className="py-2.5 px-3">
                          {s.productName}{" "}
                          <span className="text-xs text-muted-foreground">({s.productCode})</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">{s.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatBDT(s.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-success">
                          {formatBDT(s.paid)}
                        </td>
                        <td className="py-2.5 pl-3 text-right text-peach">
                          {s.due > 0 ? formatBDT(s.due) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* TAB 2: PROFIT & LOSS (OWNER ONLY) */}
        <TabsContent value="profit-loss" className="space-y-5">
          {!isOwner ? (
            <div className="card-surface flex flex-col items-center justify-center p-12 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-peach-soft text-peach">
                <ShieldAlert className="size-7" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Owner Access Required</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Profit &amp; Loss statements, COGS, Gross Profit, and Net Profit are restricted to
                the <strong>Owner</strong> role. Switch to Owner in Settings or the sidebar profile
                menu to view financial profitability.
              </p>
            </div>
          ) : (
            <>
              <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div>
                  <h2 className="text-lg font-semibold">
                    {pnlMode === "monthly"
                      ? `Monthly Profit & Loss — ${formatDate(selectedMonth)}`
                      : `Yearly Profit & Loss — ${selectedMonth.slice(0, 4)}`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Standard garment trading waterfall (Formulas 1–3)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <div className="flex rounded-full bg-muted p-1">
                    {(["monthly", "yearly"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setPnlMode(m)}
                        className={`rounded-full px-4 py-1 text-xs font-medium capitalize transition ${
                          pnlMode === m
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {pnlMode === "monthly" && (
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="rounded-xl border bg-background px-3 py-1.5 text-sm outline-none"
                    >
                      {availableMonths.map((ym) => (
                        <option key={ym} value={ym}>
                          {formatDate(ym)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
                {/* Waterfall Table */}
                <section className="card-surface p-5 sm:p-6">
                  <h3 className="text-base font-semibold">Income Statement Waterfall</h3>
                  <div className="mt-4 divide-y text-sm">
                    <PnlRow label="Gross Sales" amount={pnlSummary.grossSales} />
                    <PnlRow label="Less: Sales Discounts" amount={-pnlSummary.totalDiscounts} muted />
                    <PnlRow label="Less: Sales Returns" amount={-pnlSummary.salesReturns} muted />
                    <PnlRow label="= Net Sales" amount={pnlSummary.netSales} bold highlight />
                    <PnlRow
                      label="Less: Cost of Goods Sold (COGS incl. transport)"
                      amount={-pnlSummary.cogs}
                      muted
                    />
                    <PnlRow
                      label="= Gross Profit"
                      amount={pnlSummary.grossProfit}
                      sub={
                        pnlSummary.netSales > 0
                          ? `${Math.round((pnlSummary.grossProfit / pnlSummary.netSales) * 1000) / 10}% margin`
                          : undefined
                      }
                      bold
                      highlight
                    />
                    <PnlRow label="Plus: Other Income" amount={pnlSummary.otherIncome} positive />
                    <PnlRow
                      label="Less: Operating Expenses (7 categories)"
                      amount={-pnlSummary.totalExpenses}
                      muted
                    />
                    <PnlRow
                      label="Less: Staff Salaries (Paid)"
                      amount={-pnlSummary.totalSalaries}
                      muted
                    />
                    <PnlRow
                      label="Less: Damage / Spoilage Loss"
                      amount={-pnlSummary.totalDamageLoss}
                      muted
                    />
                    <PnlRow
                      label="Less: Loan Interest Paid"
                      amount={-pnlSummary.totalLoanInterest}
                      muted
                    />
                    <div className="flex items-center justify-between rounded-2xl bg-lime-soft/70 px-4 py-3.5 font-semibold">
                      <div>
                        <span className="text-base">= Net Profit</span>
                        {pnlSummary.netSales > 0 && (
                          <span className="ml-2 text-xs font-medium text-muted-foreground">
                            ({Math.round((pnlSummary.netProfit / pnlSummary.netSales) * 1000) / 10}%
                            net margin)
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-lg ${
                          pnlSummary.netProfit >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatBDT(pnlSummary.netProfit)}
                      </span>
                    </div>
                  </div>

                  {/* Non-Expense Memo Box */}
                  <div className="mt-5 rounded-2xl border bg-muted/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Non-Expense Cash Flow Memo (Excluded from Net Profit)
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Owner Investments</p>
                        <p className="font-semibold text-success">
                          {formatBDT(pnlSummary.ownerInvestments)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Owner Withdrawals</p>
                        <p className="font-semibold text-peach">
                          {formatBDT(pnlSummary.ownerWithdrawals)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Loan Principal Repaid</p>
                        <p className="font-semibold">
                          {formatBDT(pnlSummary.loanPrincipalRepaid)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2.5 text-xs text-muted-foreground">
                      Owner withdrawals and loan principal repayments reduce Cash/Bank balances only
                      — they are never counted as business expenses. Remaining loan principal:{" "}
                      <strong className="text-foreground">
                        {formatBDT(pnlSummary.loanRemainingBalance)}
                      </strong>
                      .
                    </p>
                  </div>
                </section>

                {/* Monthly Revenue vs Expenses vs Net Profit Chart */}
                <section className="card-surface flex flex-col p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold">Monthly Revenue, Costs &amp; Profit</h3>
                      <p className="text-xs text-muted-foreground">Last 6 months trend (BDT)</p>
                    </div>
                    <TrendingUp className="size-4 text-success" />
                  </div>
                  <div className="mt-4 h-56 w-full flex-1 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthlyPnlChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatCompactBDT(Number(v))}
                        />
                        <Tooltip
                          formatter={(value: number) => formatBDT(value)}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            background: "var(--card)",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="netSales"
                          name="Net Sales"
                          fill="oklch(0.2 0.008 110)"
                          radius={[6, 6, 0, 0]}
                          isAnimationActive
                          animationDuration={850}
                          animationEasing="ease-out"
                        />
                        <Bar
                          dataKey="expenses"
                          name="OpEx + Salaries"
                          fill="oklch(0.75 0.1 50)"
                          radius={[6, 6, 0, 0]}
                          isAnimationActive
                          animationDuration={900}
                          animationBegin={100}
                          animationEasing="ease-out"
                        />
                        <Line
                          type="monotone"
                          dataKey="netProfit"
                          name="Net Profit"
                          stroke="oklch(0.55 0.15 145)"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                          isAnimationActive
                          animationDuration={1000}
                          animationBegin={180}
                          animationEasing="ease-out"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
            </>
          )}
        </TabsContent>

        {/* TAB 3: STOCK & LOW STOCK REPORT */}
        <TabsContent value="stock-report" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Total SKUs</p>
              <p className="mt-2 text-2xl font-semibold">{stockReport.rows.length}</p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Total Units in Hand</p>
              <p className="mt-2 text-2xl font-semibold">
                {stockReport.totalUnits.toLocaleString("en-IN")} pcs
              </p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Total Stock Valuation</p>
              <p className="mt-2 text-2xl font-semibold">{formatBDT(stockReport.totalValue)}</p>
            </div>
            <div className="card-surface p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">Low-Stock Reorder Items</p>
              <p className="mt-2 text-2xl font-semibold text-peach">
                {stockReport.lowStockRows.length}
              </p>
            </div>
          </div>

          {stockReport.lowStockRows.length > 0 && (
            <section className="card-surface border border-peach/30 bg-peach-soft/25 p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-peach" />
                <h3 className="text-base font-semibold">Low-Stock Reorder List</h3>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stockReport.lowStockRows.map((r) => (
                  <div key={r.product.id} className="rounded-2xl border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {r.product.code}
                      </span>
                      <span className="rounded-full bg-peach-soft px-2 py-0.5 text-[11px] font-semibold text-peach">
                        {r.currentStock} left (min {r.product.lowStockLimit})
                      </span>
                    </div>
                    <p className="mt-1 font-medium">
                      {r.product.name} ({r.product.size}, {r.product.color})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Suggested reorder: +{Math.max(20, r.product.lowStockLimit * 2 - r.currentStock)}{" "}
                      {r.product.unit}s
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card-surface overflow-hidden p-5 sm:p-6">
            <h3 className="text-base font-semibold">Complete Stock Valuation Table</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2.5 pr-3">SKU</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Variant</th>
                    <th className="py-2.5 px-3 text-right">Opening</th>
                    <th className="py-2.5 px-3 text-right">Purchased</th>
                    <th className="py-2.5 px-3 text-right">Sold</th>
                    <th className="py-2.5 px-3 text-right">Current</th>
                    <th className="py-2.5 px-3 text-right">Avg Cost</th>
                    <th className="py-2.5 pl-3 text-right">Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockReport.rows.map((r) => (
                    <tr key={r.product.id}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{r.product.code}</td>
                      <td className="py-2.5 px-3 font-medium">{r.product.name}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {r.product.size} · {r.product.color}
                      </td>
                      <td className="py-2.5 px-3 text-right">{r.opening}</td>
                      <td className="py-2.5 px-3 text-right text-success">+{r.purchased}</td>
                      <td className="py-2.5 px-3 text-right text-peach">-{r.sold}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            r.isLowStock ? "bg-peach-soft text-peach" : "bg-lime-soft text-foreground"
                          }`}
                        >
                          {r.currentStock}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatBDT(r.avgUnitCost)}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold">
                        {formatBDT(r.stockValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        {/* TAB 4: BEST-SELLING PRODUCTS */}
        <TabsContent value="best-selling" className="space-y-5">
          <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-semibold">Best-Selling Products</h2>
              <p className="text-sm text-muted-foreground">
                Ranked by net units sold and net revenue
              </p>
            </div>
            <div className="flex rounded-full bg-muted p-1 print:hidden">
              {(
                [
                  { id: "all", label: "All Time" },
                  { id: "month", label: "This Month" },
                  { id: "year", label: "This Year" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setBestPeriod(p.id)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
                    bestPeriod === p.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <section className="card-surface overflow-hidden p-5 sm:p-6">
              <h3 className="text-base font-semibold">Product Performance Ranking</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2.5 pr-2">#</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Net Units</th>
                      <th className="py-2.5 px-3 text-right">Net Revenue</th>
                      {isOwner && <th className="py-2.5 pl-3 text-right">Est. Profit</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bestSellingData.ranked.map((item, i) => (
                      <tr key={item.productId}>
                        <td className="py-2.5 pr-2 font-semibold text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 px-3">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.code} · {item.size} · {item.color}
                          </p>
                        </td>
                        <td className="py-2.5 px-3">{item.category}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {item.netUnitsSold} pcs
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatBDT(item.netRevenue)}
                        </td>
                        {isOwner && (
                          <td className="py-2.5 pl-3 text-right font-medium text-success">
                            {formatBDT(item.estimatedProfit)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card-surface flex flex-col p-5 sm:p-6">
              <h3 className="text-base font-semibold">Category Breakdown</h3>
              <p className="text-xs text-muted-foreground">Net revenue by garment category</p>
              <div className="mt-4 h-56 w-full sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bestSellingData.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCompactBDT(Number(v))}
                    />
                    <Tooltip formatter={(value: number) => formatBDT(value)} />
                    <Bar
                      dataKey="revenue"
                      name="Net Revenue"
                      fill="oklch(0.2 0.008 110)"
                      radius={[8, 8, 0, 0]}
                      isAnimationActive
                      animationDuration={850}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 divide-y border-t pt-3 text-sm">
                {bestSellingData.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between py-2">
                    <span className="font-medium">{c.category}</span>
                    <span className="text-xs text-muted-foreground">{c.units} pcs</span>
                    <span className="font-semibold">{formatBDT(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* TAB 5: CUSTOMER DUE & SUPPLIER DUE */}
        <TabsContent value="dues" className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Total Customer Receivables</p>
              <p className="mt-2 text-2xl font-semibold text-success">
                {formatBDT(duesData.totalReceivable)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Total Supplier Payables</p>
              <p className="mt-2 text-2xl font-semibold text-peach">
                {formatBDT(duesData.totalPayable)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Net Position (Receivable − Payable)</p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  duesData.netPosition >= 0 ? "text-success" : "text-peach"
                }`}
              >
                {formatBDT(duesData.netPosition)}
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Customer Receivables */}
            <section className="card-surface overflow-hidden p-5 sm:p-6">
              <h3 className="text-base font-semibold">Customer Receivables</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 px-2 text-right">Sales</th>
                      <th className="py-2 px-2 text-right">Paid</th>
                      <th className="py-2 pl-2 text-right">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {duesData.customers.map(({ party, acc }) => (
                      <tr key={party.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{party.shopName}</p>
                          <p className="text-xs text-muted-foreground">
                            {party.name} · Last paid:{" "}
                            {acc?.lastPaymentDate ? formatDate(acc.lastPaymentDate) : "—"}
                          </p>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {formatBDT(acc?.totalVolume ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-success">
                          {formatBDT(acc?.totalPaid ?? 0)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-semibold text-peach">
                          {formatBDT(acc?.currentDue ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Supplier Payables */}
            <section className="card-surface overflow-hidden p-5 sm:p-6">
              <h3 className="text-base font-semibold">Supplier Payables</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Supplier</th>
                      <th className="py-2 px-2 text-right">Purchases</th>
                      <th className="py-2 px-2 text-right">Paid</th>
                      <th className="py-2 pl-2 text-right">Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {duesData.suppliers.map(({ party, acc }) => (
                      <tr key={party.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{party.shopName}</p>
                          <p className="text-xs text-muted-foreground">
                            {party.name} · Last paid:{" "}
                            {acc?.lastPaymentDate ? formatDate(acc.lastPaymentDate) : "—"}
                          </p>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {formatBDT(acc?.totalVolume ?? 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-success">
                          {formatBDT(acc?.totalPaid ?? 0)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-semibold text-peach">
                          {formatBDT(acc?.currentDue ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* TAB 6: EXPENSE & SALARY REPORTS */}
        <TabsContent value="expense-salary" className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Total Operating Expenses</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatBDT(expenseSalaryData.totalExpenses)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Total Paid Salaries</p>
              <p className="mt-2 text-2xl font-semibold text-success">
                {formatBDT(expenseSalaryData.totalPaidSalary)}
              </p>
            </div>
            <div className="card-surface p-5">
              <p className="text-xs text-muted-foreground">Pending Salaries</p>
              <p className="mt-2 text-2xl font-semibold text-peach">
                {formatBDT(expenseSalaryData.totalPendingSalary)}
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Expense Breakdown by 7 Categories */}
            <section className="card-surface p-5 sm:p-6">
              <h3 className="text-base font-semibold">Expenses by Category (7 Categories)</h3>
              <div className="mt-4 h-56 w-full sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseSalaryData.expByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCompactBDT(Number(v))}
                    />
                    <YAxis type="category" dataKey="label" width={125} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatBDT(value)} />
                    <Bar
                      dataKey="total"
                      name="Amount"
                      fill="oklch(0.6 0.12 45)"
                      radius={[0, 6, 6, 0]}
                      isAnimationActive
                      animationDuration={850}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 divide-y border-t pt-2 text-sm">
                {expenseSalaryData.expByCategory.map((c) => (
                  <div key={c.key} className="flex items-center justify-between py-2">
                    <span>{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.count} entries</span>
                    <span className="font-semibold">{formatBDT(c.total)}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Monthly Salary Disbursement */}
            <section className="card-surface overflow-hidden p-5 sm:p-6">
              <h3 className="text-base font-semibold">Monthly Salary Disbursement</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Staff</th>
                      <th className="py-2 px-2">Month</th>
                      <th className="py-2 px-2 text-right">Net Salary</th>
                      <th className="py-2 pl-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expenseSalaryData.salaryRows.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{s.staffName}</p>
                          <p className="text-xs text-muted-foreground">{s.position}</p>
                        </td>
                        <td className="py-2.5 px-2">{formatDate(s.month)}</td>
                        <td className="py-2.5 px-2 text-right font-semibold">
                          {formatBDT(s.netSalary)}
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              s.status === "paid"
                                ? "bg-lime-soft text-foreground"
                                : "bg-peach-soft text-peach"
                            }`}
                          >
                            {s.status === "paid" ? "Paid" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PnlRow({
  label,
  amount,
  sub,
  bold,
  muted,
  highlight,
  positive,
}: {
  label: string;
  amount: number;
  sub?: string | undefined;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${
        highlight ? "bg-muted/40 px-3 rounded-xl my-1" : ""
      }`}
    >
      <div>
        <span className={`${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
          {label}
        </span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">({sub})</span>}
      </div>
      <span
        className={`${bold ? "font-semibold" : ""} ${
          positive && amount > 0
            ? "text-success"
            : muted && amount < 0
              ? "text-muted-foreground"
              : ""
        }`}
      >
        {formatBDT(amount)}
      </span>
    </div>
  );
}
