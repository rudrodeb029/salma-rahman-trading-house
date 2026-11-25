import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Download,
  ImagePlus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { exportToPDF, formatBDT, todayISO } from "@/lib/format";
import { getRoleMeta } from "@/lib/rbac";
import { useErp } from "@/store/erp-store";
import type { Role } from "@/types/erp";

const ROLES: Role[] = ["owner", "manager", "salesperson"];

const PERMISSION_MATRIX: Array<{
  capability: string;
  owner: "Full" | "View" | "No";
  manager: "Full" | "View" | "No";
  salesperson: "Full" | "View" | "No";
}> = [
  { capability: "Dashboard & KPIs", owner: "Full", manager: "View", salesperson: "View" },
  { capability: "Gross Profit & Net Profit", owner: "Full", manager: "No", salesperson: "No" },
  { capability: "Sales & Invoices", owner: "Full", manager: "Full", salesperson: "Full" },
  { capability: "Products & Live Stock", owner: "Full", manager: "Full", salesperson: "View" },
  { capability: "Purchases & Returns / Damages", owner: "Full", manager: "Full", salesperson: "No" },
  { capability: "Operating Expenses", owner: "Full", manager: "Full", salesperson: "No" },
  { capability: "Customers & Suppliers Ledger", owner: "Full", manager: "Full", salesperson: "No" },
  { capability: "Cash & Bank Ledger", owner: "Full", manager: "No", salesperson: "No" },
  { capability: "Staff, Attendance & Salaries", owner: "Full", manager: "No", salesperson: "No" },
  { capability: "Owner Equity & Business Loans", owner: "Full", manager: "No", salesperson: "No" },
  { capability: "Operational Reports (CSV/Print)", owner: "Full", manager: "Full", salesperson: "No" },
  { capability: "Company Setup & Role Admin", owner: "Full", manager: "No", salesperson: "No" },
];

export function SettingsPage() {
  const { state, updateCompany, setRole, resetDemoData } = useErp();

  const [name, setName] = useState(state.company.name);
  const [tagline, setTagline] = useState(state.company.tagline);
  const [logoText, setLogoText] = useState(state.company.logoText);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(state.company.logoDataUrl);
  const [address, setAddress] = useState(state.company.address);
  const [phone, setPhone] = useState(state.company.phone);
  const [openingCash, setOpeningCash] = useState(String(state.company.openingCash));
  const [openingBank, setOpeningBank] = useState(String(state.company.openingBank));
  const [openingBkash, setOpeningBkash] = useState(String(state.company.openingBkash));
  const [openingNagad, setOpeningNagad] = useState(String(state.company.openingNagad));

  useEffect(() => {
    setName(state.company.name);
    setTagline(state.company.tagline);
    setLogoText(state.company.logoText);
    setLogoDataUrl(state.company.logoDataUrl);
    setAddress(state.company.address);
    setPhone(state.company.phone);
    setOpeningCash(String(state.company.openingCash));
    setOpeningBank(String(state.company.openingBank));
    setOpeningBkash(String(state.company.openingBkash));
    setOpeningNagad(String(state.company.openingNagad));
  }, [state.company]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("Please choose an image smaller than 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoDataUrl(reader.result);
        toast.success("Logo preview loaded. Click Save Changes to apply.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Company name is required");
      return;
    }
    updateCompany({
      name: name.trim(),
      tagline: tagline.trim(),
      logoText: logoText.trim().slice(0, 4).toUpperCase() || "SR",
      logoDataUrl,
      address: address.trim(),
      phone: phone.trim(),
      openingCash: Math.max(0, Number(openingCash) || 0),
      openingBank: Math.max(0, Number(openingBank) || 0),
      openingBkash: Math.max(0, Number(openingBkash) || 0),
      openingNagad: Math.max(0, Number(openingNagad) || 0),
    });
    toast.success("Company setup & opening balances saved");
  };

  const handleResetDemo = () => {
    resetDemoData();
    toast.success("Demo data restored to initial state");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Settings
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Company identity, opening cash/bank balances, and role-based access control.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            exportToPDF({
              filename: `company-profile-rbac-${todayISO()}`,
              title: "Company Setup & Role Access Policy",
              subtitle: "Opening balances and permission matrix",
              headers: ["Setting / Field", "Value"],
              rows: [
                ["Company Name", state.company.name],
                ["Tagline", state.company.tagline],
                ["Currency", `${state.company.currency} (৳)`],
                ["Address", state.company.address],
                ["Phone", state.company.phone],
                ["Opening Cash Balance", formatBDT(state.company.openingCash)],
                ["Opening Bank Balance", formatBDT(state.company.openingBank)],
                ["Opening bKash Balance", formatBDT(state.company.openingBkash)],
                ["Opening Nagad Balance", formatBDT(state.company.openingNagad)],
                ["Active Role", getRoleMeta(state.currentRole).label],
                ["Owner Access", getRoleMeta("owner").description],
                ["Manager Access", getRoleMeta("manager").description],
                ["Salesperson Access", getRoleMeta("salesperson").description],
              ],
              company: state.company,
              orientation: "portrait",
            });
            toast.success("Opened Company Setup & Access Policy PDF");
          }}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-xs font-medium shadow-sm transition hover:bg-accent sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <Download className="size-3.5 sm:size-4" />
          Export PDF
        </button>
      </div>

      {/* Section 1: Company Setup */}
      <form onSubmit={handleSaveCompany} className="card-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-soft sm:size-10">
              <Building2 className="size-4 text-foreground sm:size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold sm:text-lg">Company Setup</h2>
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            <Save className="size-3.5 sm:size-4" />
            Save Changes
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          {/* Logo Preview & Upload */}
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/40 p-4 text-center sm:p-5">
            {logoDataUrl ? (
              <div className="relative">
                <img
                  src={logoDataUrl}
                  alt="Company logo preview"
                  className="size-20 rounded-2xl object-cover shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setLogoDataUrl(undefined)}
                  aria-label="Remove logo"
                  className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid size-20 place-items-center rounded-2xl bar-dark shadow-md">
                <span className="text-2xl font-bold text-lime">
                  {(logoText || "SR").slice(0, 2)}
                </span>
              </div>
            )}
            <p className="mt-3 text-xs font-medium">{name || "Company Name"}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-accent">
              <ImagePlus className="size-3.5" />
              Upload Logo
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tagline</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Logo Initials (fallback)
              </label>
              <input
                value={logoText}
                onChange={(e) => setLogoText(e.target.value)}
                maxLength={4}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <input
                value="BDT (৳) — Bangladeshi Taka"
                readOnly
                className="mt-1.5 w-full rounded-xl border bg-muted px-3.5 py-2 text-sm text-muted-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Shop Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Opening Balances */}
        <div className="mt-6 border-t pt-5">
          <h3 className="text-sm font-semibold">Opening Cash &amp; Bank Balances (BDT)</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opening Cash (৳)</label>
              <input
                type="number"
                min={0}
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opening Bank (৳)</label>
              <input
                type="number"
                min={0}
                value={openingBank}
                onChange={(e) => setOpeningBank(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opening bKash (৳)</label>
              <input
                type="number"
                min={0}
                value={openingBkash}
                onChange={(e) => setOpeningBkash(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opening Nagad (৳)</label>
              <input
                type="number"
                min={0}
                value={openingNagad}
                onChange={(e) => setOpeningNagad(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </form>

      {/* Section 2: User Access & Role Simulator */}
      <section className="card-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-peach-soft sm:size-10">
              <Shield className="size-4 text-peach sm:size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold sm:text-lg">
                User Access &amp; Role Simulator
              </h2>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:gap-4 md:grid-cols-3">
          {ROLES.map((r) => {
            const meta = getRoleMeta(r);
            const active = state.currentRole === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  toast.success(`Switched active role to ${meta.label}`);
                }}
                className={`flex flex-col rounded-2xl border p-3.5 text-left transition sm:p-4 ${
                  active
                    ? "border-primary bg-lime-soft/50 ring-2 ring-primary/20"
                    : "bg-card hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  {active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      <Check className="size-3" /> Active
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Click to switch</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {meta.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Permission Matrix */}
        <div className="mt-5 overflow-x-auto sm:mt-6">
          <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
            <thead className="border-b text-[11px] uppercase text-muted-foreground sm:text-xs">
              <tr>
                <th className="py-2.5 pr-4">Module / Capability</th>
                <th className="py-2.5 px-3 text-center">Owner</th>
                <th className="py-2.5 px-3 text-center">Manager</th>
                <th className="py-2.5 pl-3 text-center">Salesperson</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.capability}>
                  <td className="py-2.5 pr-4 font-medium">{row.capability}</td>
                  <td className="py-2.5 px-3 text-center">
                    <AccessPill level={row.owner} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <AccessPill level={row.manager} />
                  </td>
                  <td className="py-2.5 pl-3 text-center">
                    <AccessPill level={row.salesperson} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Reset Demo Data */}
      <section className="card-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Reset Demo Data</h3>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Restore all products, sales, purchases, expenses, staff, and balances to the default
            Salma Rahman Trading House seed dataset.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <RotateCcw className="size-3.5 sm:size-4" />
              Reset Demo Data
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all ERP data to demo defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                This will overwrite all local changes you made to products, sales, purchases,
                expenses, parties, salaries, and company settings. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetDemo}>
                Yes, restore demo data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}

function AccessPill({ level }: { level: "Full" | "View" | "No" }) {
  if (level === "Full") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2.5 py-0.5 text-xs font-medium text-foreground">
        <Check className="size-3 text-success" /> Full
      </span>
    );
  }
  if (level === "View") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        View
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-peach-soft/60 px-2.5 py-0.5 text-xs font-medium text-peach">
      <X className="size-3" /> Restricted
    </span>
  );
}
