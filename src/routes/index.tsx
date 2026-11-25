import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  CalendarCheck,
  Check,
  FileBarChart,
  HandCoins,
  Landmark,
  LayoutGrid,
  Menu,
  MoreVertical,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Undo2,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { CommandPalette } from "@/components/layout/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canAccessPage, canMutate, getAllowedPages, getRoleMeta } from "@/lib/rbac";
import { AttendancePage } from "@/pages/AttendancePage";
import { CashBankPage } from "@/pages/CashBankPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { OwnerLoansPage } from "@/pages/OwnerLoansPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { PurchasesPage } from "@/pages/PurchasesPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ReturnsPage } from "@/pages/ReturnsPage";
import { NewSaleDialog, SalesPage } from "@/pages/SalesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StaffSalaryPage } from "@/pages/StaffSalaryPage";
import { StockPage } from "@/pages/StockPage";
import { SuppliersPage } from "@/pages/SuppliersPage";
import { useErp } from "@/store/erp-store";
import type { PageId, Role } from "@/types/erp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Salma Rahman Trading House — Garments ERP" },
      {
        name: "description",
        content: "Sales, stock, cash, parties, payroll, and profit overview for Salma Rahman Trading House.",
      },
      { property: "og:title", content: "Salma Rahman Trading House — Garments ERP" },
      {
        property: "og:description",
        content: "Sales, stock, cash, parties, payroll, and profit overview for Salma Rahman Trading House.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppShell,
});

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
      { id: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    group: "Inventory",
    items: [
      { id: "products", label: "Products", icon: Package },
      { id: "stock", label: "Stock", icon: Boxes },
    ],
  },
  {
    group: "Transactions",
    items: [
      { id: "sales", label: "Sales", icon: ShoppingCart },
      { id: "purchases", label: "Purchases", icon: Receipt },
      { id: "returns", label: "Returns", icon: Undo2 },
      { id: "expenses", label: "Expenses", icon: Wallet },
      { id: "cash-bank", label: "Cash & Bank", icon: Landmark },
    ],
  },
  {
    group: "Parties",
    items: [
      { id: "customers", label: "Customers", icon: Users },
      { id: "suppliers", label: "Suppliers", icon: Truck },
    ],
  },
  {
    group: "People & Finance",
    items: [
      { id: "staff", label: "Staff & Salary", icon: UserRound },
      { id: "attendance", label: "Attendance", icon: CalendarCheck },
      { id: "owner-loans", label: "Owner & Loans", icon: HandCoins },
      { id: "reports", label: "Reports", icon: FileBarChart },
    ],
  },
];

const ALL_PAGE_IDS = new Set<PageId>([
  "dashboard",
  "notifications",
  "products",
  "stock",
  "sales",
  "purchases",
  "returns",
  "expenses",
  "cash-bank",
  "customers",
  "suppliers",
  "staff",
  "attendance",
  "owner-loans",
  "reports",
  "settings",
]);

const ROLES: Role[] = ["owner", "manager", "salesperson"];

function isValidPageId(value: string | null): value is PageId {
  return value !== null && ALL_PAGE_IDS.has(value as PageId);
}

function getPageBreadcrumb(pageId: PageId): { group: string; label: string } {
  if (pageId === "settings") return { group: "System", label: "Settings" };
  for (const g of NAV_GROUPS) {
    const found = g.items.find((i) => i.id === pageId);
    if (found) return { group: g.group, label: found.label };
  }
  return { group: "Workspace", label: "Dashboard" };
}

function AppShell() {
  const { state, unreadAlertCount, setRole } = useErp();
  const role = state.currentRole;
  const roleMeta = getRoleMeta(role);

  const [period, setPeriod] = useState<"Today" | "Month" | "Year">("Month");
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [newSaleOpen, setNewSaleOpen] = useState(false);

  // Sync initial page from URL ?page=<pageId> on client
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paramPage = params.get("page");
    if (isValidPageId(paramPage) && canAccessPage(role, paramPage)) {
      setActivePage(paramPage);
    }
  }, []);

  // Keep URL ?page=<pageId> in sync safely on client
  const navigate = useCallback(
    (page: PageId) => {
      if (!canAccessPage(role, page)) {
        toast.error(`Your current role (${roleMeta.shortLabel}) cannot access this section.`);
        return;
      }
      setActivePage(page);
      setMobileMenuOpen(false);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (page === "dashboard") {
          url.searchParams.delete("page");
        } else {
          url.searchParams.set("page", page);
        }
        window.history.replaceState({}, "", url.toString());
      }
    },
    [role, roleMeta.shortLabel],
  );

  // Gracefully fall back if role changes and current page is no longer allowed
  useEffect(() => {
    if (!canAccessPage(role, activePage)) {
      const allowed = getAllowedPages(role);
      const fallback = allowed[0] ?? "dashboard";
      setActivePage(fallback);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("page");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [role, activePage]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleNavGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => canAccessPage(role, item.id)),
    })).filter((g) => g.items.length > 0);
  }, [role]);

  const breadcrumb = getPageBreadcrumb(activePage);
  const canCreateSale = canMutate(role, "sales");
  const companyInitials = (state.company.logoText || state.company.name.slice(0, 2) || "SR")
    .slice(0, 2)
    .toUpperCase();

  const handleRoleSwitch = (nextRole: Role) => {
    setRole(nextRole);
    const nextMeta = getRoleMeta(nextRole);
    toast.success(`Switched to ${nextMeta.label}`);
  };

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <DashboardPage period={period} onNavigate={navigate} />;
      case "notifications":
        return <NotificationsPage onNavigate={navigate} />;
      case "products":
        return <ProductsPage />;
      case "stock":
        return <StockPage />;
      case "sales":
        return <SalesPage />;
      case "purchases":
        return <PurchasesPage />;
      case "returns":
        return <ReturnsPage />;
      case "expenses":
        return <ExpensesPage />;
      case "cash-bank":
        return <CashBankPage />;
      case "customers":
        return <CustomersPage />;
      case "suppliers":
        return <SuppliersPage />;
      case "staff":
        return <StaffSalaryPage />;
      case "attendance":
        return <AttendancePage />;
      case "owner-loans":
        return <OwnerLoansPage />;
      case "reports":
        return <ReportsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardPage period={period} onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden p-3 sm:p-4 lg:p-5">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex gap-5">
        {/* Sidebar */}
        <aside
          className={`card-surface fixed inset-y-3 left-3 z-50 w-64 max-w-[85vw] shrink-0 flex-col p-4 print:hidden lg:sticky lg:top-5 lg:flex lg:h-[calc(100vh-2.5rem)] ${
            mobileMenuOpen ? "flex" : "hidden"
          }`}
        >
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg hover:bg-accent lg:hidden"
          >
            <X className="size-4" />
          </button>

          {/* Dynamic Company Branding */}
          <button
            type="button"
            onClick={() => navigate("dashboard")}
            className="flex items-center gap-3 px-1 pt-1 text-left"
          >
            {state.company.logoDataUrl ? (
              <img
                src={state.company.logoDataUrl}
                alt={state.company.name}
                className="size-11 shrink-0 rounded-xl object-cover shadow-md"
              />
            ) : (
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bar-dark shadow-md">
                <span className="text-lg font-bold text-lime">{companyInitials}</span>
              </div>
            )}
            <div className="min-w-0 leading-none">
              <p className="font-brand-serif truncate text-[21px] font-medium leading-[1.05] tracking-[0.01em] text-[#2e241d]">
                {state.company.name}
              </p>
              <p className="font-brand-script mt-0.5 truncate text-[17px] leading-[1.1] text-[#6d513b]">
                {state.company.tagline}
              </p>
            </div>
          </button>

          {/* Search trigger -> Command Palette */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="mt-5 flex items-center gap-2 rounded-xl border bg-muted px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-accent"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate">Search everything</span>
            <kbd className="rounded-md border bg-card px-1.5 text-[10px]">⌘K</kbd>
          </button>

          {/* Navigation */}
          <nav className="mt-2 flex-1 overflow-y-auto pr-1">
            {visibleNavGroups.map((g) => (
              <div key={g.group} className="mt-4">
                <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {g.group}
                </p>
                {g.items.map((it) => {
                  const on = activePage === it.id;
                  const badge = it.id === "notifications" ? unreadAlertCount : 0;
                  return (
                    <button
                      key={it.id}
                      onClick={() => navigate(it.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      <it.icon className={`size-4 ${on ? "text-lime" : "text-muted-foreground"}`} />
                      <span className="flex-1 text-left">{it.label}</span>
                      {badge > 0 && (
                        <span
                          className={`rounded-md px-1.5 text-[10px] font-semibold ${
                            on
                              ? "bg-lime text-primary"
                              : "bg-peach-soft text-peach"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Settings link (Owner only) */}
          {canAccessPage(role, "settings") && (
            <button
              onClick={() => navigate("settings")}
              className={`mt-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                activePage === "settings"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <Settings
                className={`size-4 ${
                  activePage === "settings" ? "text-lime" : "text-muted-foreground"
                }`}
              />
              <span>Settings</span>
            </button>
          )}

          {/* Bottom Profile Card -> Role Switcher Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-3 rounded-xl border bg-muted p-2.5 text-left transition hover:bg-accent"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-lime-soft text-xs font-semibold">
                  {companyInitials}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">{roleMeta.shortLabel} View</p>
                  <p className="truncate text-[11px] text-muted-foreground">{roleMeta.label}</p>
                </div>
                <MoreVertical className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60 rounded-2xl p-1.5">
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="size-3.5" />
                Switch Active Role
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ROLES.map((r) => {
                const meta = getRoleMeta(r);
                const isCurrent = role === r;
                return (
                  <DropdownMenuItem
                    key={r}
                    onClick={() => handleRoleSwitch(r)}
                    className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer"
                  >
                    <div className="mt-0.5 size-4 shrink-0">
                      {isCurrent && <Check className="size-4 text-success" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">{meta.label}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-2 rounded-2xl border border-card bg-card/60 px-3 py-2.5 backdrop-blur print:hidden sm:gap-3 sm:px-5 sm:py-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="grid size-9 shrink-0 place-items-center rounded-xl border bg-card lg:hidden"
            >
              <Menu className="size-4" />
            </button>

            <p className="min-w-0 truncate text-sm font-semibold text-foreground sm:hidden">
              {breadcrumb.label}
            </p>

            <p className="hidden text-sm text-muted-foreground sm:block">
              {breadcrumb.group} <span className="mx-1.5">/</span>
              <span className="font-medium text-foreground">{breadcrumb.label}</span>
            </p>

            {/* Period selector shown on Dashboard */}
            {activePage === "dashboard" ? (
              <div className="order-last flex w-full items-center justify-center gap-1 rounded-full bg-muted p-1 sm:order-none sm:ml-auto sm:w-auto sm:bg-transparent sm:p-0">
                {(["Today", "Month", "Year"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`flex-1 rounded-full px-3 py-1 text-xs font-medium transition sm:flex-none sm:px-4 sm:py-1.5 sm:text-sm ${
                      period === p
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              <div className="hidden sm:ml-auto sm:block" />
            )}

            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

            {/* Alerts button */}
            <button
              onClick={() => navigate("notifications")}
              className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition sm:ml-0 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                activePage === "notifications"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent"
              }`}
            >
              <Bell className="size-3.5 sm:size-4" />
              <span className="hidden sm:inline">Alerts</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none sm:text-[11px] ${
                  unreadAlertCount > 0
                    ? activePage === "notifications"
                      ? "bg-lime text-primary"
                      : "bg-peach-soft text-peach"
                    : "text-muted-foreground"
                }`}
              >
                {unreadAlertCount}
              </span>
            </button>

            {/* + New Sale button */}
            {canCreateSale && (
              <button
                onClick={() => setNewSaleOpen(true)}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition hover:bg-primary/90 sm:gap-2 sm:px-5 sm:py-2 sm:text-sm"
              >
                <Plus className="size-3.5 sm:size-4" />
                <span className="hidden sm:inline">New Sale</span>
              </button>
            )}

            {/* Active role avatar */}
            <div
              title={`Active Role: ${roleMeta.label}`}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-peach-soft text-[11px] font-semibold ring-2 ring-card sm:size-10 sm:text-sm"
            >
              {roleMeta.shortLabel.slice(0, 2).toUpperCase()}
            </div>
          </header>

          {/* Active Page Content */}
          <div key={activePage} className="mt-5 sm:mt-6 animate-page-enter">
            {renderPage()}
          </div>
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onNavigate={navigate}
        onNewSale={() => {
          if (canCreateSale) setNewSaleOpen(true);
        }}
      />

      {/* Global New Sale Dialog */}
      {canCreateSale && (
        <NewSaleDialog open={newSaleOpen} onOpenChange={setNewSaleOpen} />
      )}
    </div>
  );
}
