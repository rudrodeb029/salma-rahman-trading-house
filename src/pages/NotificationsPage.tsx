import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CheckCheck,
  Download,
  HandCoins,
  Info,
  Lock,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { exportToPDF, formatBDT, todayISO } from "@/lib/format";
import { canAccessPage } from "@/lib/rbac";
import { useErp } from "@/store/erp-store";
import type { AlertCategory, AlertSeverity, PageId } from "@/types/erp";

type SeverityFilter = "all" | AlertSeverity;

const CATEGORY_META: Record<AlertCategory, { label: string; icon: typeof Boxes }> = {
  low_stock: { label: "Low Stock", icon: Boxes },
  customer_due: { label: "Customer Due", icon: Users },
  supplier_due: { label: "Supplier Due", icon: Truck },
  pending_salary: { label: "Pending Salary", icon: UserRound },
  loan_balance: { label: "Active Loan", icon: HandCoins },
};

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: "bg-transparent text-destructive",
  warning: "bg-transparent text-peach",
  info: "bg-transparent text-foreground",
};

export function NotificationsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state, alerts, unreadAlertCount, markNotificationRead, markAllNotificationsRead } =
    useErp();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let info = 0;
    for (const a of alerts) {
      if (a.severity === "critical") critical += 1;
      else if (a.severity === "warning") warning += 1;
      else info += 1;
    }
    return { total: alerts.length, critical, warning, info };
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (showUnreadOnly && a.read) return false;
      return true;
    });
  }, [alerts, severityFilter, categoryFilter, showUnreadOnly]);

  const handleMarkAll = () => {
    markAllNotificationsRead();
    toast.success("All alerts marked as read");
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Notifications & Alerts
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Live operational alerts across inventory, receivables, payables, payroll, and loans.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              exportToPDF({
                filename: `operational-alerts-${todayISO()}`,
                title: "Operational Alerts & Action Log",
                subtitle: `${filtered.length} alert(s) • ${unreadAlertCount} unread`,
                headers: ["Severity", "Category", "Alert Title", "Details", "Amount", "Status"],
                rows: filtered.map((a) => [
                  a.severity.toUpperCase(),
                  CATEGORY_META[a.category].label,
                  a.title,
                  a.description,
                  a.amount !== undefined ? formatBDT(a.amount) : "—",
                  a.read ? "Read" : "Unread",
                ]),
                company: state.company,
                summary: [
                  { label: "Total Alerts", value: String(counts.total) },
                  { label: "Unread", value: String(unreadAlertCount) },
                  { label: "Critical", value: String(counts.critical), tone: counts.critical > 0 ? "danger" : "success" },
                ],
                orientation: "landscape",
              });
              toast.success("Opened Operational Alerts PDF");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-xs font-medium shadow-sm transition hover:bg-accent sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <Download className="size-3.5 sm:size-4" />
            Export PDF
          </button>
          <button
            onClick={handleMarkAll}
            disabled={unreadAlertCount === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            <CheckCheck className="size-3.5 sm:size-4" />
            Mark all read ({unreadAlertCount})
          </button>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5">
          <p className="text-[11px] text-muted-foreground sm:text-sm">Total active alerts</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl">
            {counts.total}
          </p>
        </div>
        <div className="card-surface p-3.5 sm:p-5">
          <p className="text-[11px] text-muted-foreground sm:text-sm">Unread</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl">
            {unreadAlertCount}
          </p>
        </div>
        <div className="card-surface p-3.5 sm:p-5">
          <p className="text-[11px] text-muted-foreground sm:text-sm">Critical</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums text-destructive sm:mt-2 sm:text-2xl">
            {counts.critical}
          </p>
        </div>
        <div className="card-surface p-3.5 sm:p-5">
          <p className="text-[11px] text-muted-foreground sm:text-sm">Warnings</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums text-peach sm:mt-2 sm:text-2xl">
            {counts.warning}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card-surface flex flex-col gap-3 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: `All (${counts.total})` },
              { id: "critical", label: `Critical (${counts.critical})` },
              { id: "warning", label: `Warning (${counts.warning})` },
              { id: "info", label: `Info (${counts.info})` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setSeverityFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-3.5 sm:text-sm ${
                severityFilter === f.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as AlertCategory | "all")}
            className="flex-1 rounded-xl border bg-background px-3 py-1.5 text-xs font-medium outline-none sm:flex-none sm:text-sm"
          >
            <option value="all">All Categories</option>
            <option value="low_stock">Low Stock</option>
            <option value="customer_due">Customer Due</option>
            <option value="supplier_due">Supplier Due</option>
            <option value="pending_salary">Pending Salary</option>
            <option value="loan_balance">Active Loans</option>
          </select>

          <button
            onClick={() => setShowUnreadOnly((v) => !v)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
              showUnreadOnly ? "border-primary bg-transparent text-foreground" : "bg-transparent hover:bg-accent"
            }`}
          >
            Unread only
          </button>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card-surface flex flex-col items-center justify-center p-10 text-center sm:p-12">
            <div className="grid size-12 place-items-center rounded-2xl border border-border bg-transparent">
              <Bell className="size-6 text-foreground" />
            </div>
            <h3 className="mt-4 text-base font-semibold">All caught up</h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              No notifications match your current filter.
            </p>
          </div>
        ) : (
          filtered.map((alert) => {
            const cat = CATEGORY_META[alert.category];
            const CatIcon = cat.icon;
            const canGo = canAccessPage(state.currentRole, alert.targetPage);
            const SeverityIcon =
              alert.severity === "critical"
                ? AlertCircle
                : alert.severity === "warning"
                  ? AlertTriangle
                  : Info;

            return (
              <div
                key={alert.id}
                className={`card-surface flex flex-col gap-3 p-3.5 transition sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${
                  alert.read ? "opacity-75" : "ring-1 ring-primary/10"
                }`}
              >
                <div className="flex items-start gap-3 sm:flex-1 sm:gap-3.5">
                  <div
                    className={`grid size-9 shrink-0 place-items-center sm:size-10 ${
                      alert.severity === "critical"
                        ? "text-destructive"
                        : alert.severity === "warning"
                          ? "text-peach"
                          : "text-foreground"
                    }`}
                  >
                    <SeverityIcon className="size-4 sm:size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h3 className="text-sm font-semibold sm:text-base">{alert.title}</h3>
                      <span
                        className={`inline-flex items-center gap-1 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          SEVERITY_BADGE[alert.severity]
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-transparent px-1 py-0.5 text-[11px] text-muted-foreground">
                        <CatIcon className="size-3" />
                        {cat.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                      {alert.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-2.5 sm:shrink-0 sm:border-t-0 sm:pt-0">
                  {typeof alert.amount === "number" && alert.amount > 0 && (
                    <span className="bg-transparent px-1.5 py-1 text-xs font-semibold tabular-nums sm:px-2">
                      {formatBDT(alert.amount)}
                    </span>
                  )}

                  {!alert.read && (
                    <button
                      onClick={() => {
                        markNotificationRead(alert.id);
                        toast.success("Marked as read");
                      }}
                      className="rounded-xl border bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                    >
                      Mark read
                    </button>
                  )}

                  {canGo ? (
                    <button
                      onClick={() => {
                        if (!alert.read) markNotificationRead(alert.id);
                        onNavigate(alert.targetPage);
                      }}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:ml-0"
                    >
                      Take Action
                      <ArrowRight className="size-3.5" />
                    </button>
                  ) : (
                    <span
                      title="Restricted for your active role"
                      className="ml-auto inline-flex items-center gap-1 rounded-xl border bg-muted px-3 py-1.5 text-xs text-muted-foreground sm:ml-0"
                    >
                      <Lock className="size-3" />
                      Owner/Manager
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
