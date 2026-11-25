import { useMemo } from "react";
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { calcBestSellingProducts, calcFinancialSummary } from "@/lib/calculations";
import { exportToPDF, formatBDT, formatCompactBDT, formatDate, todayISO } from "@/lib/format";
import { canAccessPage, canViewProfit } from "@/lib/rbac";
import { useErp } from "@/store/erp-store";
import type { DateFilter, PageId, PaymentAccount } from "@/types/erp";

const AVATAR_TONES = [
  "bg-lime-soft",
  "bg-peach-soft",
  "bg-accent",
  "bg-lime-soft",
  "bg-peach-soft",
  "bg-accent",
  "bg-lime-soft",
  "bg-peach-soft",
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getPeriodRange(period: "Today" | "Month" | "Year", refDate: string): {
  current: DateFilter;
  previous: DateFilter;
  subtitle: string;
  barSubtitle: string;
} {
  const [yStr, mStr, dStr] = refDate.split("-");
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 11;
  const day = Number(dStr) || 25;

  if (period === "Today") {
    const prevDateObj = new Date(year, month - 1, day - 1);
    const prevIso = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, "0")}-${String(prevDateObj.getDate()).padStart(2, "0")}`;
    return {
      current: { from: refDate, to: refDate },
      previous: { from: prevIso, to: prevIso },
      subtitle: `Today · ${formatDate(refDate)} · compared with yesterday · all amounts in BDT`,
      barSubtitle: "Pieces sold today",
    };
  }

  if (period === "Month") {
    const mm = String(month).padStart(2, "0");
    const prevMonthDate = new Date(year, month - 2, 1);
    const py = prevMonthDate.getFullYear();
    const pm = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
    const monthName = SHORT_MONTHS[month - 1] ?? mm;
    const prevMonthName = SHORT_MONTHS[prevMonthDate.getMonth()] ?? pm;
    return {
      current: { from: `${year}-${mm}-01`, to: `${year}-${mm}-31` },
      previous: { from: `${py}-${pm}-01`, to: `${py}-${pm}-31` },
      subtitle: `${monthName} ${year} · compared with ${prevMonthName} ${py} · all amounts in BDT`,
      barSubtitle: "Pieces sold, month to date",
    };
  }

  return {
    current: { from: `${year}-01-01`, to: `${year}-12-31` },
    previous: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    subtitle: `Year ${year} · year-to-date overview · all amounts in BDT`,
    barSubtitle: `Pieces sold in ${year}`,
  };
}

function formatDeltaPct(current: number, previous: number): { text: string; positive: boolean } {
  if (previous <= 0) {
    if (current > 0) return { text: "+100%", positive: true };
    return { text: "0%", positive: true };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded >= 0) return { text: `+${rounded}%`, positive: true };
  return { text: `−${Math.abs(rounded)}%`, positive: false };
}

function getShortCode(code: string, name: string): string {
  const prefix = code.split("-")[0];
  if (prefix && prefix.length <= 3) return prefix.toUpperCase();
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DashboardPage({
  period,
  onNavigate,
}: {
  period: "Today" | "Month" | "Year";
  onNavigate: (page: PageId) => void;
}) {
  const { state, cashLedger, stockByProductId, partyAccountsById } = useErp();
  const role = state.currentRole;
  const showProfit = canViewProfit(role);

  const refDate = useMemo(() => todayISO(), []);

  const periodInfo = useMemo(() => getPeriodRange(period, refDate), [period, refDate]);

  const summary = useMemo(
    () => calcFinancialSummary(state, periodInfo.current),
    [state, periodInfo.current],
  );
  const prevSummary = useMemo(
    () => calcFinancialSummary(state, periodInfo.previous),
    [state, periodInfo.previous],
  );

  const customerDueStats = useMemo(() => {
    let totalDue = 0;
    let count = 0;
    for (const p of state.parties) {
      if (p.type !== "customer") continue;
      const due = partyAccountsById[p.id]?.currentDue ?? 0;
      if (due > 0) {
        totalDue += due;
        count += 1;
      }
    }
    return { totalDue, count };
  }, [state.parties, partyAccountsById]);

  const stockTotals = useMemo(() => {
    let opening = 0;
    let purchased = 0;
    let sold = 0;
    let returned = 0;
    let current = 0;
    let lowStockCount = 0;

    for (const st of Object.values(stockByProductId)) {
      opening += st.opening;
      purchased += st.purchased;
      sold += st.sold;
      returned += st.salesReturned + st.purchaseReturned;
      current += Math.max(0, st.currentStock);
      if (st.isLowStock) lowStockCount += 1;
    }

    return { opening, purchased, sold, returned, current, lowStockCount };
  }, [stockByProductId]);

  const bestSelling = useMemo(() => {
    const list = calcBestSellingProducts(state, periodInfo.current);
    // Group by product name or take top 8 SKUs
    return list.slice(0, 8);
  }, [state, periodInfo.current]);

  const totalBestSellingPcs = useMemo(
    () => bestSelling.reduce((s, item) => s + item.netUnitsSold, 0),
    [bestSelling],
  );
  const maxBestSelling = useMemo(
    () => Math.max(1, ...bestSelling.map((b) => b.netUnitsSold)),
    [bestSelling],
  );

  // Cash & Bank Donut accounts
  const donutAccounts = useMemo(() => {
    const map: Array<{ key: PaymentAccount; name: string; color: string; stroke: string }> = [
      { key: "cash", name: "Cash", color: "bg-primary", stroke: "var(--primary)" },
      { key: "bank", name: "Bank", color: "bg-lime", stroke: "var(--lime)" },
      { key: "bKash", name: "bKash", color: "bg-sage", stroke: "var(--sage)" },
      { key: "Nagad", name: "Nagad", color: "bg-stone", stroke: "var(--stone)" },
    ];
    const positiveSum = map.reduce(
      (s, a) => s + Math.max(0, cashLedger.balancesByAccount[a.key] ?? 0),
      0,
    );
    return map.map((a) => {
      const amount = cashLedger.balancesByAccount[a.key] ?? 0;
      const pct = positiveSum > 0 ? Math.round((Math.max(0, amount) / positiveSum) * 100) : 0;
      return { ...a, amount, pct };
    });
  }, [cashLedger.balancesByAccount]);

  // Weekly sales trend (last 6 weeks up to refDate)
  const weeklySales = useMemo(() => {
    const [yStr, mStr, dStr] = refDate.split("-");
    const end = new Date(Number(yStr) || 2026, (Number(mStr) || 11) - 1, Number(dStr) || 25);
    const buckets: Array<{ label: string; from: string; to: string; value: number }> = [];

    for (let i = 5; i >= 0; i--) {
      const bEnd = new Date(end);
      bEnd.setDate(end.getDate() - i * 7);
      const bStart = new Date(bEnd);
      bStart.setDate(bEnd.getDate() - 6);
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      buckets.push({
        label: `W${6 - i}`,
        from: fmt(bStart),
        to: fmt(bEnd),
        value: 0,
      });
    }

    for (const sale of state.sales) {
      for (const b of buckets) {
        if (sale.date >= b.from && sale.date <= b.to) {
          b.value += sale.total;
          break;
        }
      }
    }

    const total = buckets.reduce((s, b) => s + b.value, 0);
    const valuesK = buckets.map((b) => Math.round(b.value / 1000));
    const maxK = Math.max(20, Math.ceil(Math.max(...valuesK, 1) / 25) * 25);
    const minVal = Math.min(...buckets.map((b) => b.value));
    const maxVal = Math.max(...buckets.map((b) => b.value));
    const avgVal = total / buckets.length;
    const minIdx = buckets.findIndex((b) => b.value === minVal);
    const maxIdx = buckets.findIndex((b) => b.value === maxVal);
    const lastTwo = buckets.slice(-2);
    const delta = formatDeltaPct(lastTwo[1]?.value ?? 0, lastTwo[0]?.value ?? 0);

    return {
      total,
      valuesK,
      labels: buckets.map((b) => b.label),
      maxK,
      ticks: [0, Math.round(maxK * 0.25), Math.round(maxK * 0.5), Math.round(maxK * 0.75), maxK],
      lowest: { val: minVal, label: buckets[minIdx]?.label ?? "W1" },
      average: avgVal,
      highest: { val: maxVal, label: buckets[maxIdx]?.label ?? "W6" },
      delta,
    };
  }, [state.sales, refDate]);

  // Monthly expenses trend (last 6 months ending at refDate's month)
  const monthlyExpenses = useMemo(() => {
    const [yStr, mStr] = refDate.split("-");
    const baseYear = Number(yStr) || 2026;
    const baseMonth = (Number(mStr) || 11) - 1;

    const months: Array<{ key: string; label: string; value: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(baseYear, baseMonth - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: SHORT_MONTHS[dt.getMonth()] ?? key, value: 0 });
    }

    for (const exp of state.expenses) {
      const ym = exp.date.slice(0, 7);
      const bucket = months.find((m) => m.key === ym);
      if (bucket) bucket.value += exp.amount;
    }

    const valuesK = months.map((m) => Math.round(m.value / 1000));
    const maxK = Math.max(30, Math.ceil(Math.max(...valuesK, 1) / 30) * 30);
    const latest = months[months.length - 1]?.value ?? 0;
    const prev = months[months.length - 2]?.value ?? 0;
    const delta = formatDeltaPct(latest, prev);

    // Paid salaries in latest month
    const latestMonthKey = months[months.length - 1]?.key ?? "";
    const paidSalariesLatest = state.salaries
      .filter((s) => s.status === "paid" && (s.month === latestMonthKey || (s.paymentDate ?? "").startsWith(latestMonthKey)))
      .reduce((sum, s) => sum + s.netSalary, 0);
    const totalPaidSalaries = state.salaries
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.netSalary, 0);

    return {
      latest,
      valuesK,
      labels: months.map((m) => m.label),
      maxK,
      ticks: [0, Math.round(maxK / 3), Math.round((maxK * 2) / 3), maxK],
      delta,
      salariesNoteAmount: paidSalariesLatest > 0 ? paidSalariesLatest : totalPaidSalaries,
    };
  }, [state.expenses, state.salaries, refDate]);

  const stockBars = [
    { label: "Opening stock", v: stockTotals.opening },
    { label: "Purchased", v: stockTotals.purchased },
    { label: "Sold", v: stockTotals.sold },
    { label: "Returned", v: stockTotals.returned },
    { label: "Low-stock items", v: stockTotals.lowStockCount, lime: true },
  ];
  const stockBarMax = Math.max(1, stockTotals.opening, stockTotals.purchased, stockTotals.sold);

  const kpiCards = useMemo(() => {
    const netSalesDelta = formatDeltaPct(summary.netSales, prevSummary.netSales);

    if (showProfit) {
      const gpDelta = formatDeltaPct(summary.grossProfit, prevSummary.grossProfit);
      const npDelta = formatDeltaPct(summary.netProfit, prevSummary.netProfit);
      return [
        {
          label: "Net sales",
          value: formatBDT(summary.netSales),
          delta: netSalesDelta.text,
          positive: netSalesDelta.positive,
        },
        {
          label: "Gross profit",
          value: formatBDT(summary.grossProfit),
          delta: gpDelta.text,
          positive: gpDelta.positive,
        },
        {
          label: "Net profit",
          value: formatBDT(summary.netProfit),
          delta: npDelta.text,
          positive: npDelta.positive,
        },
        {
          label: "Customer due",
          value: formatBDT(customerDueStats.totalDue),
          delta: `${customerDueStats.count} parties`,
          positive: customerDueStats.totalDue === 0,
        },
      ];
    }

    // Manager / Salesperson — strictly NO Gross Profit or Net Profit
    return [
      {
        label: "Net sales",
        value: formatBDT(summary.netSales),
        delta: netSalesDelta.text,
        positive: netSalesDelta.positive,
      },
      {
        label: "Total Stock",
        value: `${stockTotals.current.toLocaleString("en-IN")} pcs`,
        delta: `${state.products.length} SKUs`,
        positive: true,
      },
      {
        label: "Customer due",
        value: formatBDT(customerDueStats.totalDue),
        delta: `${customerDueStats.count} parties`,
        positive: customerDueStats.totalDue === 0,
      },
      {
        label: "Low-stock SKUs",
        value: `${stockTotals.lowStockCount} items`,
        delta: stockTotals.lowStockCount > 0 ? "Needs reorder" : "Healthy",
        positive: stockTotals.lowStockCount === 0,
      },
    ];
  }, [summary, prevSummary, showProfit, customerDueStats, stockTotals, state.products.length]);

  const handleExportReport = () => {
    const rows: (string | number)[][] = [
      ["Period", period],
      ["Date Range", `${periodInfo.current.from ?? ""} to ${periodInfo.current.to ?? ""}`],
      ["Gross Sales (BDT)", Math.round(summary.grossSales)],
      ["Discounts (BDT)", Math.round(summary.totalDiscounts)],
      ["Sales Returns (BDT)", Math.round(summary.salesReturns)],
      ["Net Sales (BDT)", Math.round(summary.netSales)],
    ];

    if (showProfit) {
      rows.push(
        ["COGS (BDT)", Math.round(summary.cogs)],
        ["Gross Profit (BDT)", Math.round(summary.grossProfit)],
        ["Other Income (BDT)", Math.round(summary.otherIncome)],
        ["Operating Expenses (BDT)", Math.round(summary.totalExpenses)],
        ["Staff Salaries Paid (BDT)", Math.round(summary.totalSalaries)],
        ["Damage Loss (BDT)", Math.round(summary.totalDamageLoss)],
        ["Loan Interest (BDT)", Math.round(summary.totalLoanInterest)],
        ["Net Profit (BDT)", Math.round(summary.netProfit)],
      );
    }

    rows.push(
      ["Customer Due (BDT)", Math.round(customerDueStats.totalDue)],
      ["Total Stock (pcs)", stockTotals.current],
      ["Low-Stock SKUs", stockTotals.lowStockCount],
      ["Total Cash & Bank Balance (BDT)", Math.round(cashLedger.totalBalance)],
    );

    exportToPDF({
      filename: `dashboard-summary-${period.toLowerCase()}-${refDate}`,
      title: `Business Overview — ${period} Summary`,
      subtitle: periodInfo.subtitle,
      headers: ["Metric", "Value"],
      rows: rows.map(([metric, val]) => {
        const label = String(metric ?? "");
        const value = val ?? "";
        return [
          label,
          typeof value === "number" && label.includes("(BDT)") ? formatBDT(value) : value,
        ];
      }),
      company: state.company,
      summary: kpiCards.map((k) => ({ label: k.label, value: k.value })),
      orientation: "portrait",
    });
    toast.success(`Opened ${period} Business Overview PDF`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Business Overview
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{periodInfo.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAccessPage(role, "reports") && (
            <button
              onClick={() => onNavigate("reports")}
              className="rounded-full border bg-card/80 px-3.5 py-2 text-xs font-medium transition hover:bg-card sm:px-4 sm:py-2.5 sm:text-sm"
            >
              All reports
            </button>
          )}
          <button
            onClick={handleExportReport}
            className="rounded-full bg-card px-4 py-2 text-xs font-medium shadow-sm transition hover:bg-accent sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 xl:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="card-surface min-w-0 p-3.5 sm:p-5">
            <p className="truncate text-[11px] text-muted-foreground sm:text-sm">{k.label}</p>
            <div className="mt-1.5 flex flex-col gap-1 sm:mt-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="truncate text-base font-semibold tracking-tight tabular-nums sm:text-2xl">
                {k.value}
              </p>
              <span
                className={`flex items-center gap-0.5 text-[11px] font-medium sm:text-sm ${
                  k.positive ? "text-success" : "text-peach"
                }`}
              >
                {k.positive ? (
                  <TrendingUp className="size-3 shrink-0 sm:size-3.5" />
                ) : (
                  <TrendingDown className="size-3 shrink-0 sm:size-3.5" />
                )}
                <span className="truncate">{k.delta}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2: Best-selling products & Cash/Bank mix */}
      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-[1.7fr_1fr]">
        {/* Bar chart */}
        <section className="card-surface min-w-0 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                Best-selling products
              </h2>
            </div>
            <span className="rounded-full bg-lime-soft px-2.5 py-1 text-xs font-medium tabular-nums sm:px-3 sm:text-sm">
              Total {totalBestSellingPcs.toLocaleString("en-IN")} pcs
            </span>
          </div>

          {bestSelling.length === 0 ? (
            <div className="mt-5 flex h-48 flex-col items-center justify-center rounded-2xl bg-muted/60 p-6 text-center sm:mt-6 sm:h-56">
              <p className="text-sm font-medium">No sales recorded for this period</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Switch to Month or Year, or create a new sale to see live rankings.
              </p>
            </div>
          ) : (
            <>
              <div
                className="mt-5 grid h-44 items-end gap-1 sm:mt-6 sm:h-64 sm:gap-4"
                style={{ gridTemplateColumns: `repeat(${bestSelling.length}, minmax(0, 1fr))` }}
              >
                {bestSelling.map((p, i) => {
                  const pct = Math.max(12, Math.round((p.netUnitsSold / maxBestSelling) * 85));
                  return (
                    <div
                      key={p.productId}
                      className="flex h-full flex-col items-center justify-end"
                      title={`${p.name} (${p.size}, ${p.color}) — ${p.netUnitsSold} pcs · ${formatBDT(p.netRevenue)}`}
                    >
                      <span className="mb-1 text-[10px] tabular-nums text-muted-foreground sm:mb-1.5 sm:text-[11px]">
                        {p.netUnitsSold}
                      </span>
                      <div
                        key={`${period}-${p.productId}-bar`}
                        className={`animate-bar-y w-full rounded-lg transition-transform duration-300 hover:scale-[1.03] sm:rounded-2xl ${
                          i === 0 ? "bar-lime" : i < 3 ? "bar-dark" : "bar-stone"
                        }`}
                        style={{
                          height: `${pct}%`,
                          animationDelay: `${i * 65}ms`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div
                className="mt-2.5 grid gap-1 sm:mt-4 sm:gap-4"
                style={{ gridTemplateColumns: `repeat(${bestSelling.length}, minmax(0, 1fr))` }}
              >
                {bestSelling.map((p, i) => (
                  <div key={p.productId} className="flex min-w-0 flex-col items-center gap-1">
                    <span
                      title={`${p.name} (${p.size}, ${p.color})`}
                      className={`rounded-md px-1 py-0.5 text-[9px] font-semibold sm:px-1.5 sm:py-1 sm:text-[10px] ${
                        AVATAR_TONES[i % AVATAR_TONES.length]
                      }`}
                    >
                      {getShortCode(p.code, p.name)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Donut */}
        <section className="card-surface flex min-w-0 flex-col p-4 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Cash & bank mix</h2>
          <div className="mt-5 flex flex-1 flex-col items-center gap-5 sm:mt-6 sm:flex-row sm:flex-wrap sm:gap-6">
            <CashDonut accounts={donutAccounts} totalBalance={cashLedger.totalBalance} />
            <ul className="w-full flex-1 space-y-3 sm:space-y-4">
              {donutAccounts.map((a) => (
                <li key={a.name} className="flex items-center gap-2.5 text-xs sm:gap-3 sm:text-sm">
                  <span className={`size-2 shrink-0 rounded-full ${a.color}`} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {formatBDT(a.amount)}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums">{a.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-5 border-t pt-4 sm:mt-6 sm:pt-5">
            {canAccessPage(role, "cash-bank") ? (
              <button
                onClick={() => onNavigate("cash-bank")}
                className="rounded-xl border px-4 py-2 text-xs font-medium shadow-sm transition hover:bg-accent sm:px-5 sm:text-sm"
              >
                View cash closing
              </button>
            ) : canAccessPage(role, "reports") ? (
              <button
                onClick={() => onNavigate("reports")}
                className="rounded-xl border px-4 py-2 text-xs font-medium shadow-sm transition hover:bg-accent sm:px-5 sm:text-sm"
              >
                View daily closing report
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cash closing details are available to Manager & Owner roles.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Row 3: Stock movement, Daily/Weekly sales, Monthly expenses */}
      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-3">
        {/* Stock bars */}
        <section className="card-surface p-4 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight sm:text-lg">Stock movement</h2>
            </div>
            <button
              onClick={() => onNavigate("stock")}
              className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums transition hover:bg-accent sm:px-3 sm:text-xs"
            >
              {stockTotals.current.toLocaleString("en-IN")} in hand
            </button>
          </div>
          <div className="mt-4 space-y-3.5 sm:mt-5 sm:space-y-4">
            {stockBars.map((s, idx) => (
              <div key={s.label}>
                <div className="mb-1.5 flex justify-between text-xs sm:text-sm">
                  <span>{s.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {s.v.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="h-6 overflow-hidden rounded-lg bg-muted sm:h-7">
                  <div
                    className={`animate-bar-x h-full rounded-lg transition-all duration-700 ${
                      s.lime ? "bar-lime" : "bar-dark"
                    }`}
                    style={{
                      width: `${s.v === 0 ? 6 : Math.max((s.v / stockBarMax) * 100, 18)}%`,
                      animationDelay: `${idx * 85}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <LineCard
          title="Weekly sales"
          sub="Last 6 weeks, ৳ thousand"
          big={formatCompactBDT(weeklySales.total)}
          delta={weeklySales.delta.text}
          positive={weeklySales.delta.positive}
          tone="lime"
          data={weeklySales.valuesK}
          labels={weeklySales.labels}
          max={weeklySales.maxK}
          ticks={weeklySales.ticks}
          footer={
            <div className="grid grid-cols-3 divide-x">
              {[
                ["Lowest", formatCompactBDT(weeklySales.lowest.val), weeklySales.lowest.label],
                ["Average", formatCompactBDT(weeklySales.average), "Per week"],
                ["Highest", formatCompactBDT(weeklySales.highest.val), weeklySales.highest.label],
              ].map(([a, b, c]) => (
                <div key={a} className="min-w-0 px-1.5 first:pl-0 sm:px-3">
                  <p className="truncate text-sm font-semibold tabular-nums sm:text-xl">{b}</p>
                  <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{c}</p>
                </div>
              ))}
            </div>
          }
        />

        <LineCard
          title="Monthly expenses"
          sub="Rent, utilities, transport & more"
          big={formatCompactBDT(monthlyExpenses.latest)}
          delta={monthlyExpenses.delta.text}
          positive={!monthlyExpenses.delta.positive}
          tone="peach"
          data={monthlyExpenses.valuesK}
          labels={monthlyExpenses.labels}
          max={monthlyExpenses.maxK}
          ticks={monthlyExpenses.ticks}
          footer={
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Paid salaries of {formatCompactBDT(monthlyExpenses.salariesNoteAmount)} are tracked
              separately. Owner withdrawals and loan principal repayments are not counted as
              expenses.
            </p>
          }
        />
      </div>
    </div>
  );
}

function CashDonut({
  accounts,
  totalBalance,
}: {
  accounts: Array<{ name: string; pct: number; stroke: string }>;
  totalBalance: number;
}) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let off = 0;

  return (
    <div className="relative size-36 shrink-0 sm:size-44">
      <svg viewBox="0 0 180 180" className="animate-donut-reveal -rotate-90">
        {accounts.map((a) => {
          const len = (a.pct / 100) * c;
          const dash = Math.max(0, len - 2);
          const el = (
            <circle
              key={a.name}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={a.stroke}
              strokeWidth="26"
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={-off}
              className="transition-all duration-700 ease-out"
            />
          );
          off += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">
            {formatCompactBDT(totalBalance)}
          </p>
          <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[10px]">
            Total balance
          </p>
        </div>
      </div>
    </div>
  );
}

function LineCard({
  title,
  sub,
  big,
  delta,
  positive,
  tone,
  data,
  labels,
  max,
  ticks,
  footer,
}: {
  title: string;
  sub: string;
  big: string;
  delta: string;
  positive: boolean;
  tone: "lime" | "peach";
  data: number[];
  labels: string[];
  max: number;
  ticks: number[];
  footer: React.ReactNode;
}) {
  const W = 300;
  const H = 180;
  const safeMax = Math.max(1, max);
  const pts = data.map(
    (v, i) =>
      [
        20 + (i * (W - 40)) / Math.max(1, data.length - 1),
        H - Math.min(1, Math.max(0, v / safeMax)) * H,
      ] as const,
  );
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const area = `${d} L${pts[pts.length - 1]![0]},${H} L${pts[0]![0]},${H} Z`;
  const stroke = tone === "lime" ? "var(--sage)" : "var(--peach)";
  const fill = tone === "lime" ? "var(--lime)" : "var(--peach)";
  const id = `g-${tone}-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="card-surface flex min-w-0 flex-col p-4 sm:p-6">
      <div className="flex justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">{big}</p>
          <p
            className={`flex items-center justify-end gap-0.5 text-xs font-medium sm:text-sm ${
              positive ? "text-success" : "text-peach"
            }`}
          >
            {positive ? (
              <ArrowUp className="size-3 sm:size-3.5" />
            ) : (
              <ArrowDown className="size-3 sm:size-3.5" />
            )}
            {delta}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2 sm:mt-5">
        <div className="flex h-[150px] flex-col-reverse justify-between text-[10px] tabular-nums text-muted-foreground sm:h-[180px] sm:text-xs">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[150px] w-full overflow-visible sm:h-[180px]"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={fill} stopOpacity="0.35" />
                <stop offset="1" stopColor={fill} stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <line
                key={t}
                x1="0"
                x2={W}
                y1={H - (t / safeMax) * H}
                y2={H - (t / safeMax) * H}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
            ))}
            <path d={area} fill={`url(#${id})`} className="animate-area-fade" />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth="1.8"
              pathLength={1}
              className="animate-line-draw"
            />
            {pts.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3.5"
                fill="var(--card)"
                stroke={stroke}
                strokeWidth="1.5"
                className="animate-dot-pop transition-transform duration-200 hover:scale-150"
                style={{ animationDelay: `${260 + i * 90}ms` }}
              />
            ))}
          </svg>
          <div className="mt-2 flex justify-between px-1 text-[10px] text-muted-foreground sm:px-2 sm:text-xs">
            {labels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto border-t pt-4 sm:pt-5">{footer}</div>
    </section>
  );
}
