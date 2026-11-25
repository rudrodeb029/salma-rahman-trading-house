import {
  Boxes,
  CalendarCheck,
  Check,
  FileBarChart,
  HandCoins,
  Landmark,
  LayoutGrid,
  Package,
  Plus,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Undo2,
  UserRound,
  Users,
  Wallet,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatBDT } from "@/lib/format";
import { canAccessPage, canMutate, getRoleMeta } from "@/lib/rbac";
import { useErp } from "@/store/erp-store";
import type { PageId, Role } from "@/types/erp";

const PAGE_ITEMS: Array<{ id: PageId; label: string; group: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", group: "Workspace", icon: LayoutGrid },
  { id: "notifications", label: "Notifications", group: "Workspace", icon: Bell },
  { id: "products", label: "Products", group: "Inventory", icon: Package },
  { id: "stock", label: "Stock", group: "Inventory", icon: Boxes },
  { id: "sales", label: "Sales", group: "Transactions", icon: ShoppingCart },
  { id: "purchases", label: "Purchases", group: "Transactions", icon: Receipt },
  { id: "returns", label: "Returns & Damages", group: "Transactions", icon: Undo2 },
  { id: "expenses", label: "Expenses", group: "Transactions", icon: Wallet },
  { id: "cash-bank", label: "Cash & Bank", group: "Transactions", icon: Landmark },
  { id: "customers", label: "Customers", group: "Parties", icon: Users },
  { id: "suppliers", label: "Suppliers", group: "Parties", icon: Truck },
  { id: "staff", label: "Staff & Salary", group: "People & Finance", icon: UserRound },
  { id: "attendance", label: "Attendance", group: "People & Finance", icon: CalendarCheck },
  { id: "owner-loans", label: "Owner & Loans", group: "People & Finance", icon: HandCoins },
  { id: "reports", label: "Reports", group: "People & Finance", icon: FileBarChart },
  { id: "settings", label: "Settings", group: "System", icon: Settings },
];

const ROLES: Role[] = ["owner", "manager", "salesperson"];

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onNewSale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigate: (page: PageId) => void;
  onNewSale: () => void;
}) {
  const { state, stockByProductId, partyAccountsById, setRole } = useErp();
  const role = state.currentRole;

  const allowedPages = PAGE_ITEMS.filter((p) => canAccessPage(role, p.id));
  const customers = state.parties.filter((p) => p.type === "customer");
  const suppliers = state.parties.filter((p) => p.type === "supplier");

  const runAndClose = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-hidden rounded-2xl p-0">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <CommandInput placeholder="Search pages, products, customers, suppliers..." />
          <CommandList className="max-h-[65vh] sm:max-h-[420px]">
        <CommandEmpty>No matching pages, products, or parties found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          {canMutate(role, "sales") && (
            <CommandItem
              value="action new sale create invoice"
              onSelect={() => runAndClose(onNewSale)}
            >
              <Plus className="size-4 text-primary" />
              <span className="flex-1 font-medium">New Sale Invoice</span>
              <span className="rounded-md bg-lime-soft px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                Quick Action
              </span>
            </CommandItem>
          )}
          {ROLES.map((r) => {
            const meta = getRoleMeta(r);
            const active = role === r;
            return (
              <CommandItem
                key={r}
                value={`switch role ${meta.label} ${r}`}
                onSelect={() =>
                  runAndClose(() => {
                    setRole(r);
                    toast.success(`Switched active role to ${meta.label}`);
                  })
                }
              >
                <Shield className="size-4 text-muted-foreground" />
                <span className="flex-1">Switch Role: {meta.label}</span>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-lime-soft px-1.5 py-0.5 text-[10px] font-medium">
                    <Check className="size-3" /> Active
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Pages">
          {allowedPages.map((item) => (
            <CommandItem
              key={item.id}
              value={`page ${item.label} ${item.group} ${item.id}`}
              onSelect={() => runAndClose(() => onNavigate(item.id))}
            >
              <item.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.group}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {canAccessPage(role, "products") && state.products.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Products">
              {state.products.map((prod) => {
                const stock = stockByProductId[prod.id];
                const qty = stock?.currentStock ?? 0;
                return (
                  <CommandItem
                    key={prod.id}
                    value={`product ${prod.code} ${prod.name} ${prod.category} ${prod.size} ${prod.color} ${prod.brand}`}
                    onSelect={() => runAndClose(() => onNavigate("products"))}
                  >
                    <Package className="size-4 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {prod.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({prod.size} · {prod.color})
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {prod.code} · {prod.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-medium ${
                          stock?.isLowStock
                            ? "bg-peach-soft text-peach"
                            : "bg-lime-soft text-foreground"
                        }`}
                      >
                        {qty} {prod.unit}
                      </span>
                      <span className="font-medium text-muted-foreground">
                        {formatBDT(prod.retailPrice)}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {canAccessPage(role, "customers") && customers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {customers.map((c) => {
                const acc = partyAccountsById[c.id];
                const due = acc?.currentDue ?? 0;
                return (
                  <CommandItem
                    key={c.id}
                    value={`customer ${c.code} ${c.name} ${c.shopName} ${c.mobile}`}
                    onSelect={() => runAndClose(() => onNavigate("customers"))}
                  >
                    <Users className="size-4 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{c.shopName}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.name} · {c.mobile}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        due > 0 ? "text-peach" : "text-success"
                      }`}
                    >
                      {due > 0 ? `Due ${formatBDT(due)}` : "Settled"}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {canAccessPage(role, "suppliers") && suppliers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Suppliers">
              {suppliers.map((s) => {
                const acc = partyAccountsById[s.id];
                const due = acc?.currentDue ?? 0;
                return (
                  <CommandItem
                    key={s.id}
                    value={`supplier ${s.code} ${s.name} ${s.shopName} ${s.mobile}`}
                    onSelect={() => runAndClose(() => onNavigate("suppliers"))}
                  >
                    <Truck className="size-4 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{s.shopName}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {s.name} · {s.mobile}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        due > 0 ? "text-peach" : "text-success"
                      }`}
                    >
                      {due > 0 ? `Payable ${formatBDT(due)}` : "Settled"}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
