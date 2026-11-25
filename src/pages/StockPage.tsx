import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Download,
  Flame,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import { useErp } from '@/store/erp-store';
import type { Product, ProductCategory } from '@/types/erp';

const CATEGORIES: ProductCategory[] = ['T-Shirt', 'Shirt', 'Pant'];
type StockStatusFilter = 'All' | 'Low Stock' | 'Healthy';
type ActiveTab = 'ledger' | 'damages';

const DAMAGE_REASON_PRESETS = [
  'Fabric tear during handling',
  'Stain / water damage in store',
  'Stitching or zipper defect',
  'Transit / packaging damage',
];

interface DamageFormState {
  date: string;
  productId: string;
  quantity: string;
  unitCost: string;
  reason: string;
}

export function StockPage() {
  const { state, stockByProductId, addDamage } = useErp();

  const canRecordDamage = canMutate(state.currentRole, 'stock');
  const isSalesperson = state.currentRole === 'salesperson';

  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ProductCategory>('All');
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('All');

  const [damageDialogOpen, setDamageDialogOpen] = useState(false);
  const [damageForm, setDamageForm] = useState<DamageFormState>(() => {
    const first = state.products[0];
    return {
      date: todayISO(),
      productId: first?.id ?? '',
      quantity: '1',
      unitCost: first ? String(first.purchasePrice) : '0',
      reason: '',
    };
  });
  const [damageError, setDamageError] = useState<string | null>(null);

  const productsById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const p of state.products) {
      map[p.id] = p;
    }
    return map;
  }, [state.products]);

  const ledgerRows = useMemo(() => {
    return state.products.map((product) => {
      const summary = stockByProductId[product.id];
      const opening = summary?.opening ?? product.openingStock;
      const purchased = summary?.purchased ?? 0;
      const sold = summary?.sold ?? 0;
      const salesReturned = summary?.salesReturned ?? 0;
      const purchaseReturned = summary?.purchaseReturned ?? 0;
      const damaged = summary?.damaged ?? 0;
      const currentStock = summary?.currentStock ?? product.openingStock;
      const isLowStock = summary?.isLowStock ?? currentStock <= product.lowStockLimit;
      const isOutOfStock = currentStock <= 0;

      return {
        product,
        opening,
        purchased,
        sold,
        salesReturned,
        purchaseReturned,
        damaged,
        currentStock,
        isLowStock,
        isOutOfStock,
      };
    });
  }, [state.products, stockByProductId]);

  const totals = useMemo(() => {
    let opening = 0;
    let purchased = 0;
    let sold = 0;
    let salesReturned = 0;
    let purchaseReturned = 0;
    let damaged = 0;
    let currentStock = 0;
    let lowStockCount = 0;

    for (const row of ledgerRows) {
      opening += row.opening;
      purchased += row.purchased;
      sold += row.sold;
      salesReturned += row.salesReturned;
      purchaseReturned += row.purchaseReturned;
      damaged += row.damaged;
      currentStock += row.currentStock;
      if (row.isLowStock) lowStockCount += 1;
    }

    const totalDamageLossBDT = state.damages.reduce((acc, d) => acc + d.totalLoss, 0);

    return {
      opening,
      purchased,
      sold,
      salesReturned,
      purchaseReturned,
      netReturned: salesReturned - purchaseReturned,
      damaged,
      currentStock,
      lowStockCount,
      totalDamageLossBDT,
    };
  }, [ledgerRows, state.damages]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledgerRows.filter((row) => {
      if (categoryFilter !== 'All' && row.product.category !== categoryFilter) return false;
      if (statusFilter === 'Low Stock' && !row.isLowStock) return false;
      if (statusFilter === 'Healthy' && row.isLowStock) return false;
      if (!q) return true;
      const p = row.product;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.size.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q)
      );
    });
  }, [ledgerRows, search, categoryFilter, statusFilter]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        opening: acc.opening + r.opening,
        purchased: acc.purchased + r.purchased,
        sold: acc.sold + r.sold,
        salesReturned: acc.salesReturned + r.salesReturned,
        purchaseReturned: acc.purchaseReturned + r.purchaseReturned,
        damaged: acc.damaged + r.damaged,
        currentStock: acc.currentStock + r.currentStock,
      }),
      {
        opening: 0,
        purchased: 0,
        sold: 0,
        salesReturned: 0,
        purchaseReturned: 0,
        damaged: 0,
        currentStock: 0,
      },
    );
  }, [filteredRows]);

  const maxStockForBar = useMemo(() => {
    let maxVal = 1;
    for (const r of ledgerRows) {
      if (r.currentStock > maxVal) maxVal = r.currentStock;
      if (r.product.lowStockLimit * 2 > maxVal) maxVal = r.product.lowStockLimit * 2;
    }
    return maxVal;
  }, [ledgerRows]);

  const sortedDamages = useMemo(() => {
    return [...state.damages].sort((a, b) => b.date.localeCompare(a.date));
  }, [state.damages]);

  const openDamageModal = () => {
    const first = state.products[0];
    setDamageForm({
      date: todayISO(),
      productId: first?.id ?? '',
      quantity: '1',
      unitCost: first ? String(first.purchasePrice) : '0',
      reason: '',
    });
    setDamageError(null);
    setDamageDialogOpen(true);
  };

  const handleProductSelectChange = (productId: string) => {
    const selected = productsById[productId];
    setDamageForm((prev) => ({
      ...prev,
      productId,
      unitCost: selected ? String(selected.purchasePrice) : prev.unitCost,
    }));
  };

  const handleRecordDamage = (e: React.FormEvent) => {
    e.preventDefault();
    const product = productsById[damageForm.productId];
    if (!product) {
      setDamageError('Please select a product SKU.');
      return;
    }
    const quantity = Number(damageForm.quantity);
    const unitCost = Number(damageForm.unitCost);
    const reason = damageForm.reason.trim();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setDamageError('Damaged quantity must be greater than 0.');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setDamageError('Unit cost must be a valid non-negative number.');
      return;
    }
    if (!reason) {
      setDamageError('Please provide a reason for the damage loss.');
      return;
    }

    const totalLoss = Math.round(quantity * unitCost);
    addDamage({
      date: damageForm.date || todayISO(),
      productId: product.id,
      quantity,
      unitCost,
      totalLoss,
      reason,
    });

    toast.success(
      `Recorded ${quantity} damaged pcs of ${product.code} (${formatBDT(totalLoss)} loss)`,
    );
    setDamageDialogOpen(false);
  };

  const handleExportCSV = () => {
    const headers = [
      'Code',
      'Product',
      'Category',
      'Size',
      'Color',
      'Opening',
      'Purchased (+)',
      'Sold (-)',
      'Sales Ret (+)',
      'Purch Ret (-)',
      'Damaged (-)',
      'Current Stock',
      'Low Limit',
      'Status',
    ];
    const rows = filteredRows.map((r) => [
      r.product.code,
      r.product.name,
      r.product.category,
      r.product.size,
      r.product.color,
      r.opening,
      r.purchased,
      r.sold,
      r.salesReturned,
      r.purchaseReturned,
      r.damaged,
      r.currentStock,
      r.product.lowStockLimit,
      r.isOutOfStock ? 'Out of Stock' : r.isLowStock ? 'Low Stock' : 'Healthy',
    ]);
    exportToPDF({
      filename: `stock-ledger-${todayISO()}`,
      title: 'Stock & Damage Movement Ledger',
      subtitle: 'Opening + Purchases − Sales + Sales Returns − Purchase Returns − Damaged = Current Stock',
      headers,
      rows,
      company: state.company,
      orientation: 'landscape',
    });
    toast.success(`Opened Stock Ledger PDF (${rows.length} SKUs)`);
  };

  const previewDamageLoss = useMemo(() => {
    const q = Number(damageForm.quantity);
    const c = Number(damageForm.unitCost);
    if (!Number.isFinite(q) || !Number.isFinite(c) || q < 0 || c < 0) return 0;
    return Math.round(q * c);
  }, [damageForm.quantity, damageForm.unitCost]);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            Stock &amp; Damage Ledger
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Real-time SKU balances reconciled across opening stock, purchases, sales, returns, and
            damages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="h-9 rounded-full border-border bg-card px-3.5 text-xs hover:bg-accent sm:px-4 sm:text-sm"
          >
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Export PDF
          </Button>
          {canRecordDamage && (
            <Button
              onClick={openDamageModal}
              className="h-9 rounded-full bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90 sm:px-5 sm:text-sm"
            >
              <Flame className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Record Damage Loss
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-7">
        <div className="card-surface min-w-0 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Opening</span>
            <Boxes className="h-3.5 w-3.5 shrink-0" />
          </div>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-foreground sm:text-2xl">
            {totals.opening.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Purchased</span>
            <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-success" />
          </div>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-success sm:text-2xl">
            +{totals.purchased.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Sold</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground" />
          </div>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-foreground sm:text-2xl">
            −{totals.sold.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Net Returned</span>
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-foreground sm:text-2xl">
            {totals.netReturned >= 0 ? `+${totals.netReturned}` : totals.netReturned}
          </p>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Damaged</span>
            <Flame className="h-3.5 w-3.5 shrink-0 text-peach" />
          </div>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-peach sm:text-2xl">
            −{totals.damaged.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="card-surface min-w-0 border border-lime/40 bg-lime-soft/40 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] font-medium text-foreground sm:text-xs">
            <span className="truncate">Current Stock</span>
            <PackageCheck className="h-3.5 w-3.5 shrink-0 text-success" />
          </div>
          <p className="mt-2 truncate text-lg font-bold tabular-nums text-foreground sm:text-2xl">
            {totals.currentStock.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="card-surface col-span-2 min-w-0 p-3.5 sm:col-span-1 sm:p-4">
          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
            <span className="truncate">Low-Stock Alerts</span>
            <AlertTriangle
              className={`h-3.5 w-3.5 shrink-0 ${
                totals.lowStockCount > 0 ? 'text-peach' : 'text-success'
              }`}
            />
          </div>
          <p
            className={`mt-2 truncate text-lg font-semibold tabular-nums sm:text-2xl ${
              totals.lowStockCount > 0 ? 'text-peach' : 'text-success'
            }`}
          >
            {totals.lowStockCount}
          </p>
        </div>
      </div>

      {/* Visual Formula Banner */}
      <div className="card-surface flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          Stock Formula
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium sm:gap-1.5 sm:text-xs">
          <span className="rounded-full bg-primary px-2.5 py-0.5 font-semibold text-primary-foreground sm:px-3 sm:py-1">
            Current stock
          </span>
          <span className="px-0.5 text-muted-foreground">=</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-foreground sm:px-2.5 sm:py-1">
            Opening
          </span>
          <span className="font-bold text-success">+</span>
          <span className="rounded-full bg-lime-soft px-2 py-0.5 text-success sm:px-2.5 sm:py-1">
            Purchases
          </span>
          <span className="font-bold text-peach">−</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-foreground sm:px-2.5 sm:py-1">
            Sales
          </span>
          <span className="font-bold text-success">+</span>
          <span className="rounded-full bg-lime-soft px-2 py-0.5 text-success sm:px-2.5 sm:py-1">
            Sales returns
          </span>
          <span className="font-bold text-peach">−</span>
          <span className="rounded-full bg-peach-soft px-2 py-0.5 text-peach sm:px-2.5 sm:py-1">
            Purchase returns
          </span>
          <span className="font-bold text-peach">−</span>
          <span className="rounded-full bg-peach-soft px-2 py-0.5 text-peach sm:px-2.5 sm:py-1">
            Damaged
          </span>
        </div>
      </div>

      {/* Tabbed Section: Stock Movement Ledger vs Recent Damage Log */}
      <div className="card-surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 p-3.5 sm:p-5">
          {/* Tabs Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex w-full flex-wrap gap-1 rounded-2xl bg-secondary/70 p-1 sm:inline-flex sm:w-auto sm:rounded-full">
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`flex-1 cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:flex-initial sm:rounded-full sm:px-4 ${
                  activeTab === 'ledger'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Stock Ledger ({state.products.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('damages')}
                className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:flex-initial sm:rounded-full sm:px-4 ${
                  activeTab === 'damages'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Flame className="h-3.5 w-3.5 text-peach" />
                Damage Log ({state.damages.length})
              </button>
            </div>

            {activeTab === 'damages' && !isSalesperson && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-peach-soft px-3 py-1.5 text-xs font-semibold text-peach sm:gap-2 sm:px-3.5">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                Total Damage Loss: {formatBDT(totals.totalDamageLossBDT)}
              </div>
            )}
          </div>

          {/* Search & Filters (for Ledger tab) */}
          {activeTab === 'ledger' && (
            <div className="flex flex-col gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search SKU code, product, size, color..."
                  className="h-9 w-full rounded-full border-border bg-secondary/50 pl-10 pr-4 text-xs sm:h-10 sm:text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {(['All', ...CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      categoryFilter === cat
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {cat}
                  </button>
                ))}

                <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

                {(['All', 'Low Stock', 'Healthy'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      statusFilter === st
                        ? st === 'Low Stock'
                          ? 'border-peach/40 bg-peach-soft text-peach shadow-sm'
                          : st === 'Healthy'
                            ? 'border-lime/50 bg-lime-soft text-success shadow-sm'
                            : 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Ledger Table */}
        {activeTab === 'ledger' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-secondary/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
                    <th className="px-3.5 py-3 sm:px-5 sm:py-3.5">Product SKU</th>
                    <th className="px-2.5 py-3 text-right sm:px-3 sm:py-3.5">Opening</th>
                    <th className="px-2.5 py-3 text-right text-success sm:px-3 sm:py-3.5">Purchased (+)</th>
                    <th className="px-2.5 py-3 text-right sm:px-3 sm:py-3.5">Sold (−)</th>
                    <th className="px-2.5 py-3 text-right text-success sm:px-3 sm:py-3.5">Sales Ret (+)</th>
                    <th className="px-2.5 py-3 text-right text-peach sm:px-3 sm:py-3.5">Purch Ret (−)</th>
                    <th className="px-2.5 py-3 text-right text-peach sm:px-3 sm:py-3.5">Damaged (−)</th>
                    <th className="px-3 py-3 sm:px-4 sm:py-3.5">Current Stock</th>
                    <th className="px-2.5 py-3 text-right sm:px-3 sm:py-3.5">Low Limit</th>
                    <th className="px-3.5 py-3 sm:px-5 sm:py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground sm:px-6 sm:py-14">
                        <Boxes className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        <p className="font-medium text-foreground">No stock records match your filter</p>
                        <p className="mt-1 text-xs">
                          Clear the search or status filter to view all SKUs.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const pct = Math.min(
                        100,
                        Math.max(4, Math.round((Math.max(0, row.currentStock) / maxStockForBar) * 100)),
                      );
                      const barClass = row.isOutOfStock
                        ? 'bg-destructive'
                        : row.isLowStock
                          ? 'bg-peach'
                          : 'bar-lime';

                      return (
                        <tr
                          key={row.product.id}
                          className="transition-colors hover:bg-secondary/35"
                        >
                          <td className="px-3.5 py-2.5 align-middle sm:px-5 sm:py-3.5">
                            <div className="flex items-center gap-2 sm:gap-2.5">
                              <span className="rounded-lg bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground sm:py-1 sm:text-xs">
                                {row.product.code}
                              </span>
                              <div>
                                <div className="font-medium text-foreground">
                                  {row.product.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground sm:text-xs">
                                  {row.product.size} · {row.product.color} · {row.product.category}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle tabular-nums text-muted-foreground sm:px-3 sm:py-3.5">
                            {row.opening}
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle font-medium tabular-nums text-success sm:px-3 sm:py-3.5">
                            {row.purchased > 0 ? `+${row.purchased}` : '0'}
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle font-medium tabular-nums text-foreground sm:px-3 sm:py-3.5">
                            {row.sold > 0 ? `−${row.sold}` : '0'}
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle tabular-nums text-success sm:px-3 sm:py-3.5">
                            {row.salesReturned > 0 ? `+${row.salesReturned}` : '0'}
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle tabular-nums text-peach sm:px-3 sm:py-3.5">
                            {row.purchaseReturned > 0 ? `−${row.purchaseReturned}` : '0'}
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle tabular-nums text-peach sm:px-3 sm:py-3.5">
                            {row.damaged > 0 ? `−${row.damaged}` : '0'}
                          </td>
                          <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                            <div className="flex items-center gap-2.5 sm:gap-3">
                              <span
                                className={`w-9 text-right text-xs font-bold tabular-nums sm:w-10 sm:text-sm ${
                                  row.isOutOfStock
                                    ? 'text-destructive'
                                    : row.isLowStock
                                      ? 'text-peach'
                                      : 'text-foreground'
                                }`}
                              >
                                {row.currentStock}
                              </span>
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-secondary sm:h-2.5 sm:w-24">
                                <div
                                  className={`h-full rounded-full transition-all ${barClass}`}
                                  style={{ width: `${row.currentStock <= 0 ? 0 : pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 text-right align-middle tabular-nums text-muted-foreground sm:px-3 sm:py-3.5">
                            {row.product.lowStockLimit}
                          </td>
                          <td className="px-3.5 py-2.5 align-middle sm:px-5 sm:py-3.5">
                            {row.isOutOfStock ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive sm:px-2.5 sm:py-1 sm:text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                Out of Stock
                              </span>
                            ) : row.isLowStock ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-peach-soft px-2 py-0.5 text-[11px] font-medium text-peach sm:px-2.5 sm:py-1 sm:text-xs">
                                <AlertTriangle className="h-3 w-3" />
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-success sm:px-2.5 sm:py-1 sm:text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                Healthy
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/40 text-[11px] font-semibold text-foreground sm:text-xs">
                      <td className="px-3.5 py-3 sm:px-5 sm:py-3.5">
                        Total ({filteredRows.length} SKUs)
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums sm:px-3 sm:py-3.5">
                        {filteredTotals.opening}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-success sm:px-3 sm:py-3.5">
                        +{filteredTotals.purchased}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums sm:px-3 sm:py-3.5">
                        −{filteredTotals.sold}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-success sm:px-3 sm:py-3.5">
                        +{filteredTotals.salesReturned}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-peach sm:px-3 sm:py-3.5">
                        −{filteredTotals.purchaseReturned}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-peach sm:px-3 sm:py-3.5">
                        −{filteredTotals.damaged}
                      </td>
                      <td className="px-3 py-3 text-xs font-bold tabular-nums sm:px-4 sm:py-3.5 sm:text-sm">
                        {filteredTotals.currentStock} pcs
                      </td>
                      <td colSpan={2} className="px-3.5 py-3 text-right text-muted-foreground sm:px-5 sm:py-3.5">
                        Formula verified
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        ) : (
          /* Recent Damage Log Tab */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
                  <th className="px-3.5 py-3 sm:px-5 sm:py-3.5">Date</th>
                  <th className="px-3 py-3 sm:px-4 sm:py-3.5">Product SKU</th>
                  <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Damaged Qty</th>
                  {!isSalesperson && <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Unit Cost</th>}
                  {!isSalesperson && <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Total Loss</th>}
                  <th className="px-3.5 py-3 sm:px-5 sm:py-3.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedDamages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isSalesperson ? 4 : 6}
                      className="px-4 py-12 text-center text-muted-foreground sm:px-6 sm:py-14"
                    >
                      <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success opacity-60" />
                      <p className="font-medium text-foreground">No damage losses recorded</p>
                      <p className="mt-1 text-xs">
                        Damaged pieces logged here automatically deduct from stock and P&amp;L.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedDamages.map((entry) => {
                    const product = productsById[entry.productId];
                    return (
                      <tr key={entry.id} className="transition-colors hover:bg-secondary/35">
                        <td className="px-3.5 py-2.5 align-middle text-[11px] font-medium whitespace-nowrap text-muted-foreground sm:px-5 sm:py-3.5 sm:text-xs">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                          {product ? (
                            <div className="flex items-center gap-2">
                              <span className="rounded-lg bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground sm:text-xs">
                                {product.code}
                              </span>
                              <div>
                                <div className="font-medium text-foreground">{product.name}</div>
                                <div className="text-[11px] text-muted-foreground sm:text-xs">
                                  {product.size} · {product.color}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Removed SKU</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right align-middle font-semibold whitespace-nowrap tabular-nums text-peach sm:px-4 sm:py-3.5">
                          −{entry.quantity} pcs
                        </td>
                        {!isSalesperson && (
                          <td className="px-3 py-2.5 text-right align-middle tabular-nums text-muted-foreground sm:px-4 sm:py-3.5">
                            {formatBDT(entry.unitCost)}
                          </td>
                        )}
                        {!isSalesperson && (
                          <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-peach sm:px-4 sm:py-3.5">
                            {formatBDT(entry.totalLoss)}
                          </td>
                        )}
                        <td className="px-3.5 py-2.5 align-middle text-xs text-foreground sm:px-5 sm:py-3.5 sm:text-sm">
                          {entry.reason}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedDamages.length > 0 && !isSalesperson && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-peach-soft/40 text-[11px] font-semibold text-foreground sm:text-xs">
                    <td colSpan={2} className="px-3.5 py-3 sm:px-5 sm:py-3.5">
                      Total Recorded Damage ({sortedDamages.length} entries)
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-peach sm:px-4 sm:py-3.5">
                      −{totals.damaged} pcs
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-3.5" />
                    <td className="px-3 py-3 text-right text-xs font-bold tabular-nums text-peach sm:px-4 sm:py-3.5 sm:text-sm">
                      {formatBDT(totals.totalDamageLossBDT)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-muted-foreground sm:px-5 sm:py-3.5">
                      Deducted from Net Profit
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Record Damage Loss Modal */}
      <Dialog open={damageDialogOpen} onOpenChange={setDamageDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto rounded-3xl border-border bg-card p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
                <Flame className="h-4 w-4" />
              </span>
              Record Damage Loss
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Log damaged garment pieces. Stock quantity is deducted immediately and loss is
              reflected in P&amp;L.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordDamage} className="space-y-4">
            {damageError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
                {damageError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dmg-date">Date *</Label>
                <Input
                  id="dmg-date"
                  type="date"
                  value={damageForm.date}
                  onChange={(e) => setDamageForm((f) => ({ ...f, date: e.target.value }))}
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dmg-qty">Damaged Quantity (pcs) *</Label>
                <Input
                  id="dmg-qty"
                  type="number"
                  min={1}
                  step="1"
                  value={damageForm.quantity}
                  onChange={(e) => setDamageForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dmg-product">Product SKU *</Label>
              <select
                id="dmg-product"
                value={damageForm.productId}
                onChange={(e) => handleProductSelectChange(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>
                  Select a product SKU...
                </option>
                {state.products.map((p) => {
                  const stock = stockByProductId[p.id]?.currentStock ?? p.openingStock;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name} ({p.size} / {p.color}) · Stock: {stock}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dmg-cost">Unit Cost (৳) *</Label>
                <Input
                  id="dmg-cost"
                  type="number"
                  min={0}
                  step="1"
                  value={damageForm.unitCost}
                  onChange={(e) => setDamageForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="rounded-xl tabular-nums"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Auto-filled from SKU purchase price
                </p>
              </div>

              <div className="flex flex-col justify-center rounded-2xl border border-peach/25 bg-peach-soft/60 px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-peach">
                  Estimated Loss
                </span>
                <span className="mt-0.5 text-xl font-bold tabular-nums text-peach">
                  {formatBDT(previewDamageLoss)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dmg-reason">Reason *</Label>
              <Input
                id="dmg-reason"
                value={damageForm.reason}
                onChange={(e) => setDamageForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Describe what caused the damage..."
                className="rounded-xl"
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {DAMAGE_REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDamageForm((f) => ({ ...f, reason: preset }))}
                    className="cursor-pointer rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDamageDialogOpen(false)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-full px-6">
                <Plus className="h-4 w-4" />
                Save Damage Loss
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
