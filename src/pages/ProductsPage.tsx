import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Edit2,
  Eye,
  Layers,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wallet,
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
import { exportToPDF, formatBDT, formatCompactBDT, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import { useErp } from '@/store/erp-store';
import type { Product, ProductCategory, ProductUnit } from '@/types/erp';

const CATEGORIES: ProductCategory[] = ['T-Shirt', 'Shirt', 'Pant'];
const UNITS: ProductUnit[] = ['piece', 'dozen'];

interface ProductPreset {
  name: string;
  category: ProductCategory;
  codePrefix: string;
  defaultSizes: string[];
}

const PDF_PRODUCT_PRESETS: ProductPreset[] = [
  { name: 'T-Shirt', category: 'T-Shirt', codePrefix: 'TS', defaultSizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Export Pant', category: 'Pant', codePrefix: 'EP', defaultSizes: ['30', '32', '34', '36'] },
  { name: 'Gabardine Pant', category: 'Pant', codePrefix: 'GP', defaultSizes: ['30', '32', '34', '36'] },
  { name: 'Shirt', category: 'Shirt', codePrefix: 'SH', defaultSizes: ['M', 'L', 'XL', 'XXL'] },
  { name: 'Polo T-Shirt', category: 'T-Shirt', codePrefix: 'PT', defaultSizes: ['M', 'L', 'XL', 'XXL'] },
  { name: 'Brand Pant', category: 'Pant', codePrefix: 'BP', defaultSizes: ['30', '32', '34', '36'] },
  { name: 'Drop Shoulder T-Shirt', category: 'T-Shirt', codePrefix: 'DS', defaultSizes: ['M', 'L', 'XL'] },
  { name: 'Denim Pant', category: 'Pant', codePrefix: 'DP', defaultSizes: ['30', '32', '34', '36'] },
];

const QUICK_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36'];

interface ProductFormState {
  code: string;
  name: string;
  category: ProductCategory;
  brand: string;
  size: string;
  color: string;
  unit: ProductUnit;
  purchasePrice: string;
  wholesalePrice: string;
  retailPrice: string;
  lowStockLimit: string;
  openingStock: string;
}

const EMPTY_FORM: ProductFormState = {
  code: '',
  name: '',
  category: 'T-Shirt',
  brand: 'Salma Knit',
  size: 'L',
  color: 'Black',
  unit: 'piece',
  purchasePrice: '',
  wholesalePrice: '',
  retailPrice: '',
  lowStockLimit: '15',
  openingStock: '0',
};

function getColorDotClass(color: string): string {
  const c = color.toLowerCase();
  if (c.includes('black') || c.includes('charcoal')) return 'bg-neutral-900';
  if (c.includes('white') || c.includes('ivory') || c.includes('cream'))
    return 'bg-white border border-neutral-300';
  if (c.includes('navy') || c.includes('indigo')) return 'bg-indigo-950';
  if (c.includes('blue') || c.includes('sky')) return 'bg-sky-500';
  if (c.includes('olive') || c.includes('green') || c.includes('sage')) return 'bg-emerald-700';
  if (c.includes('khaki') || c.includes('beige') || c.includes('sand') || c.includes('stone'))
    return 'bg-amber-200 border border-amber-300';
  if (c.includes('red') || c.includes('maroon') || c.includes('burgundy')) return 'bg-rose-700';
  if (c.includes('grey') || c.includes('gray') || c.includes('ash')) return 'bg-neutral-400';
  if (c.includes('brown') || c.includes('coffee')) return 'bg-amber-800';
  return 'bg-stone-400';
}

function getCategoryPillClass(category: ProductCategory): string {
  switch (category) {
    case 'T-Shirt':
      return 'bg-lime-soft text-foreground border-lime/40';
    case 'Shirt':
      return 'bg-secondary text-foreground border-border';
    case 'Pant':
      return 'bg-peach-soft text-peach border-peach/20';
  }
}

export function ProductsPage() {
  const { state, stockByProductId, addProduct, updateProduct, deleteProduct } = useErp();

  const canEdit = canMutate(state.currentRole, 'products');
  const isSalesperson = state.currentRole === 'salesperson';

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ProductCategory>('All');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const kpis = useMemo(() => {
    let totalInventoryValue = 0;
    let totalRetailValue = 0;
    let totalUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const categoryCounts: Record<ProductCategory, number> = {
      'T-Shirt': 0,
      Shirt: 0,
      Pant: 0,
    };

    for (const product of state.products) {
      categoryCounts[product.category] += 1;
      const summary = stockByProductId[product.id];
      const current = summary ? summary.currentStock : product.openingStock;
      const safeCurrent = Math.max(0, current);
      totalUnits += safeCurrent;
      totalInventoryValue += safeCurrent * product.purchasePrice;
      totalRetailValue += safeCurrent * product.retailPrice;
      if (current <= 0) {
        outOfStockCount += 1;
        lowStockCount += 1;
      } else if (current <= product.lowStockLimit) {
        lowStockCount += 1;
      }
    }

    return {
      totalSkus: state.products.length,
      categoryCounts,
      totalInventoryValue,
      totalRetailValue,
      totalUnits,
      lowStockCount,
      outOfStockCount,
    };
  }, [state.products, stockByProductId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.products.filter((p) => {
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      const summary = stockByProductId[p.id];
      const currentStock = summary ? summary.currentStock : p.openingStock;
      const isLow = currentStock <= p.lowStockLimit;
      if (lowStockOnly && !isLow) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        p.size.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [state.products, stockByProductId, search, categoryFilter, lowStockOnly]);

  const suggestNextCode = (prefix = 'SR'): string => {
    const nextNum = state.products.length + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  };

  const openAddDialog = () => {
    setEditingProduct(null);
    setForm({
      ...EMPTY_FORM,
      code: suggestNextCode('TS'),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setForm({
      code: product.code,
      name: product.name,
      category: product.category,
      brand: product.brand,
      size: product.size,
      color: product.color,
      unit: product.unit,
      purchasePrice: String(product.purchasePrice),
      wholesalePrice: String(product.wholesalePrice),
      retailPrice: String(product.retailPrice),
      lowStockLimit: String(product.lowStockLimit),
      openingStock: String(product.openingStock),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const applyPreset = (preset: ProductPreset) => {
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      category: preset.category,
      code: editingProduct ? prev.code : suggestNextCode(preset.codePrefix),
      size: preset.defaultSizes[1] ?? prev.size,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const brand = form.brand.trim() || 'Salma House';
    const size = form.size.trim().toUpperCase();
    const color = form.color.trim();

    if (!code || !name || !size || !color) {
      setFormError('Code, product name, size, and color are required.');
      return;
    }

    const duplicateCode = state.products.some(
      (p) => p.code.toLowerCase() === code.toLowerCase() && p.id !== editingProduct?.id,
    );
    if (duplicateCode) {
      setFormError(`SKU code "${code}" already exists. Use a unique code per size & color variant.`);
      return;
    }

    const purchasePrice = Number(form.purchasePrice);
    const wholesalePrice = Number(form.wholesalePrice);
    const retailPrice = Number(form.retailPrice);
    const lowStockLimit = Number(form.lowStockLimit);
    const openingStock = Number(form.openingStock);

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0 ||
      !Number.isFinite(wholesalePrice) ||
      wholesalePrice < 0 ||
      !Number.isFinite(retailPrice) ||
      retailPrice < 0 ||
      !Number.isFinite(lowStockLimit) ||
      lowStockLimit < 0 ||
      !Number.isFinite(openingStock) ||
      openingStock < 0
    ) {
      setFormError('Prices, low stock limit, and opening stock must be valid non-negative numbers.');
      return;
    }

    const payload: Omit<Product, 'id'> = {
      code,
      name,
      category: form.category,
      brand,
      size,
      color,
      unit: form.unit,
      purchasePrice,
      wholesalePrice,
      retailPrice,
      lowStockLimit,
      openingStock,
    };

    if (editingProduct) {
      updateProduct(editingProduct.id, payload);
      toast.success(`Updated SKU ${code} (${name} · ${size} / ${color})`);
    } else {
      addProduct(payload);
      toast.success(`Added SKU ${code} (${name} · ${size} / ${color})`);
    }

    setDialogOpen(false);
    setEditingProduct(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteProduct(deleteTarget.id);
    toast.success(`Deleted SKU ${deleteTarget.code} (${deleteTarget.name})`);
    setDeleteTarget(null);
  };

  const handleExportCSV = () => {
    const headers = isSalesperson
      ? [
          'Code',
          'Name',
          'Brand',
          'Category',
          'Size',
          'Color',
          'Unit',
          'Wholesale Price (BDT)',
          'Retail Price (BDT)',
          'Current Stock',
          'Low Stock Limit',
          'Status',
        ]
      : [
          'Code',
          'Name',
          'Brand',
          'Category',
          'Size',
          'Color',
          'Unit',
          'Purchase Price (BDT)',
          'Wholesale Price (BDT)',
          'Retail Price (BDT)',
          'Current Stock',
          'Low Stock Limit',
          'Status',
        ];

    const rows = filteredProducts.map((p) => {
      const summary = stockByProductId[p.id];
      const current = summary ? summary.currentStock : p.openingStock;
      const status = current <= 0 ? 'Out of Stock' : current <= p.lowStockLimit ? 'Low Stock' : 'In Stock';
      return isSalesperson
        ? [
            p.code,
            p.name,
            p.brand,
            p.category,
            p.size,
            p.color,
            p.unit,
            p.wholesalePrice,
            p.retailPrice,
            current,
            p.lowStockLimit,
            status,
          ]
        : [
            p.code,
            p.name,
            p.brand,
            p.category,
            p.size,
            p.color,
            p.unit,
            p.purchasePrice,
            p.wholesalePrice,
            p.retailPrice,
            current,
            p.lowStockLimit,
            status,
          ];
    });

    exportToPDF({
      filename: `products-catalog-${todayISO()}`,
      title: 'Products & SKU Catalog',
      subtitle: `${rows.length} garment SKU variant(s) • Each size & color tracked independently`,
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Total SKUs', value: String(kpis.totalSkus) },
        { label: 'Total Units', value: `${kpis.totalUnits.toLocaleString('en-IN')} pcs` },
        {
          label: isSalesperson ? 'Catalog Retail Value' : 'Inventory Value',
          value: formatBDT(isSalesperson ? kpis.totalRetailValue : kpis.totalInventoryValue),
        },
        { label: 'Low Stock SKUs', value: String(kpis.lowStockCount), tone: kpis.lowStockCount > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Products Catalog PDF (${rows.length} SKUs)`);
  };

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            Products &amp; SKU Variants
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Each size and color combination is tracked as an independent garment SKU.
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
          {canEdit && (
            <Button
              onClick={openAddDialog}
              className="h-9 rounded-full bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90 sm:px-5 sm:text-sm"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Add Product SKU
            </Button>
          )}
        </div>
      </div>

      {/* Read-Only Banner for Salesperson */}
      {!canEdit && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 sm:items-center sm:gap-3 sm:px-4 sm:py-3 sm:text-sm">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 sm:mt-0" />
          <span>
            <strong className="font-semibold">View-only catalog mode:</strong> Salesperson access displays
            wholesale/retail prices and live stock availability. Purchase costs and catalog edits are restricted.
          </span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="card-surface min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
              Total SKUs
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-foreground sm:h-9 sm:w-9">
              <Package className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:mt-3">
            <span className="truncate text-lg font-semibold tracking-tight tabular-nums text-foreground sm:text-2xl">
              {kpis.totalSkus}
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">variants</span>
          </div>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
              Categories
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground sm:h-9 sm:w-9">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:mt-3">
            <span className="truncate text-lg font-semibold tracking-tight tabular-nums text-foreground sm:text-2xl">
              3
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">lines</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-medium sm:gap-1.5 sm:text-[11px]">
            <span className="rounded-full bg-lime-soft px-2 py-0.5 text-foreground">
              T-Shirt: {kpis.categoryCounts['T-Shirt']}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-foreground">
              Shirt: {kpis.categoryCounts.Shirt}
            </span>
            <span className="rounded-full bg-peach-soft px-2 py-0.5 text-peach">
              Pant: {kpis.categoryCounts.Pant}
            </span>
          </div>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
              {isSalesperson ? 'Retail Value' : 'Inventory Value'}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success sm:h-9 sm:w-9">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2 sm:mt-3">
            <span className="truncate text-lg font-semibold tracking-tight tabular-nums text-foreground sm:text-2xl">
              {formatCompactBDT(isSalesperson ? kpis.totalRetailValue : kpis.totalInventoryValue)}
            </span>
          </div>
        </div>

        <div className="card-surface min-w-0 p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
              Low Stock SKUs
            </span>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 ${
                kpis.lowStockCount > 0 ? 'bg-peach-soft text-peach' : 'bg-lime-soft text-success'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:mt-3">
            <span
              className={`truncate text-lg font-semibold tracking-tight tabular-nums sm:text-2xl ${
                kpis.lowStockCount > 0 ? 'text-peach' : 'text-success'
              }`}
            >
              {kpis.lowStockCount}
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">below limit</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar + Table Card */}
      <div className="card-surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 p-3.5 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, name, brand, color, size..."
              className="h-9 w-full rounded-full border-border bg-secondary/50 pl-10 pr-4 text-xs sm:h-10 sm:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {(['All', ...CATEGORIES] as const).map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-3.5 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              );
            })}

            <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

            <button
              type="button"
              onClick={() => setLowStockOnly((prev) => !prev)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all sm:px-3.5 ${
                lowStockOnly
                  ? 'border-peach/40 bg-peach-soft text-peach shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Low Stock Only
              {kpis.lowStockCount > 0 && (
                <span className="ml-0.5 rounded-full bg-peach/15 px-1.5 py-0.2 text-[10px] font-semibold">
                  {kpis.lowStockCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* SKU Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
                <th className="px-3.5 py-3 sm:px-5 sm:py-3.5">Code</th>
                <th className="px-3 py-3 sm:px-4 sm:py-3.5">Product &amp; Brand</th>
                <th className="px-3 py-3 sm:px-4 sm:py-3.5">Category</th>
                <th className="px-3 py-3 sm:px-4 sm:py-3.5">Size &amp; Color</th>
                <th className="px-2.5 py-3 sm:px-3 sm:py-3.5">Unit</th>
                {!isSalesperson && <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Purchase</th>}
                <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Wholesale</th>
                <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Retail</th>
                <th className="px-3 py-3 text-right sm:px-4 sm:py-3.5">Stock / Limit</th>
                <th className="px-3 py-3 sm:px-4 sm:py-3.5">Status</th>
                {canEdit && <th className="px-3.5 py-3 text-right sm:px-5 sm:py-3.5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? (isSalesperson ? 10 : 11) : isSalesperson ? 9 : 10}
                    className="px-4 py-12 text-center text-muted-foreground sm:px-6 sm:py-14"
                  >
                    <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p className="font-medium text-foreground">No matching product SKUs found</p>
                    <p className="mt-1 text-xs">
                      Try adjusting your search query or category filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const summary = stockByProductId[product.id];
                  const currentStock = summary ? summary.currentStock : product.openingStock;
                  const isOut = currentStock <= 0;
                  const isLow = !isOut && currentStock <= product.lowStockLimit;

                  return (
                    <tr
                      key={product.id}
                      className="transition-colors hover:bg-secondary/35"
                    >
                      <td className="px-3.5 py-2.5 align-middle sm:px-5 sm:py-3.5">
                        <span className="inline-flex rounded-lg bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground sm:py-1 sm:text-xs">
                          {product.code}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                        <div className="font-medium text-foreground">{product.name}</div>
                        <div className="text-[11px] text-muted-foreground sm:text-xs">{product.brand}</div>
                      </td>
                      <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium sm:px-2.5 sm:text-xs ${getCategoryPillClass(
                            product.category,
                          )}`}
                        >
                          {product.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                          <span className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground sm:px-2 sm:text-xs">
                            {product.size}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-secondary/50 px-1.5 py-0.5 text-[11px] text-foreground sm:gap-1.5 sm:px-2 sm:text-xs">
                            <span
                              className={`h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${getColorDotClass(product.color)}`}
                            />
                            {product.color}
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle sm:px-3 sm:py-3.5">
                        <span className="text-[11px] capitalize text-muted-foreground sm:text-xs">
                          {product.unit}
                        </span>
                      </td>
                      {!isSalesperson && (
                        <td className="px-3 py-2.5 text-right align-middle font-medium tabular-nums text-muted-foreground sm:px-4 sm:py-3.5">
                          {formatBDT(product.purchasePrice)}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right align-middle font-medium tabular-nums text-foreground sm:px-4 sm:py-3.5">
                        {formatBDT(product.wholesalePrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-foreground sm:px-4 sm:py-3.5">
                        {formatBDT(product.retailPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle tabular-nums sm:px-4 sm:py-3.5">
                        <span
                          className={`font-semibold ${
                            isOut
                              ? 'text-destructive'
                              : isLow
                                ? 'text-peach'
                                : 'text-foreground'
                          }`}
                        >
                          {currentStock}
                        </span>
                        <span className="text-[11px] text-muted-foreground sm:text-xs">
                          {' '}
                          / {product.lowStockLimit}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle sm:px-4 sm:py-3.5">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive sm:px-2.5 sm:py-1 sm:text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-peach-soft px-2 py-0.5 text-[11px] font-medium text-peach sm:px-2.5 sm:py-1 sm:text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-peach" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-success sm:px-2.5 sm:py-1 sm:text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            In Stock
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-3.5 py-2.5 text-right align-middle sm:px-5 sm:py-3.5">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(product)}
                              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                              title={`Edit ${product.code}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(product)}
                              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={`Delete ${product.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-secondary/20 px-3.5 py-2.5 text-[11px] text-muted-foreground sm:px-5 sm:py-3 sm:text-xs">
          <span>
            Showing <strong className="text-foreground">{filteredProducts.length}</strong> of{' '}
            <strong className="text-foreground">{state.products.length}</strong> product SKUs
          </span>
          <span>
            All prices in BDT (৳) · Stock computed live from purchases, sales, returns &amp; damages
          </span>
        </div>
      </div>

      {/* Add / Edit Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto rounded-3xl border-border bg-card p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold sm:text-xl">
              {editingProduct ? `Edit Product SKU (${editingProduct.code})` : 'Add New Product SKU'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Define a garment variant with its own size, color, pricing tiers, and low-stock threshold.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Quick PDF Product Presets */}
            <div className="rounded-2xl border border-border/80 bg-secondary/40 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-success" />
                Quick Garment Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PDF_PRODUCT_PRESETS.map((preset) => {
                  const isSelected = form.name.toLowerCase() === preset.name.toLowerCase();
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-lime-soft'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku-code">SKU Code *</Label>
                <Input
                  id="sku-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. TS-017"
                  className="rounded-xl font-mono uppercase"
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sku-name">Product Name *</Label>
                <Input
                  id="sku-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Polo T-Shirt"
                  className="rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku-category">Category *</Label>
                <select
                  id="sku-category"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ProductCategory }))
                  }
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-brand">Brand</Label>
                <Input
                  id="sku-brand"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Salma Knit"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-unit">Unit</Label>
                <select
                  id="sku-unit"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ProductUnit }))}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u === 'piece' ? 'Piece (pcs)' : 'Dozen (12 pcs)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sku-size">Size *</Label>
                <Input
                  id="sku-size"
                  value={form.size}
                  onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="e.g. L or 32"
                  className="rounded-xl"
                  required
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {QUICK_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, size: sz }))}
                      className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        form.size.toUpperCase() === sz
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-color">Color *</Label>
                <Input
                  id="sku-color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="e.g. Navy Blue, Olive, Black"
                  className="rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku-purchase">Purchase Price (৳) *</Label>
                <Input
                  id="sku-purchase"
                  type="number"
                  min={0}
                  step="1"
                  value={form.purchasePrice}
                  onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                  placeholder="0"
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-wholesale">Wholesale Price (৳) *</Label>
                <Input
                  id="sku-wholesale"
                  type="number"
                  min={0}
                  step="1"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
                  placeholder="0"
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-retail">Retail Price (৳) *</Label>
                <Input
                  id="sku-retail"
                  type="number"
                  min={0}
                  step="1"
                  value={form.retailPrice}
                  onChange={(e) => setForm((f) => ({ ...f, retailPrice: e.target.value }))}
                  placeholder="0"
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sku-low-limit">Low Stock Alert Limit *</Label>
                <Input
                  id="sku-low-limit"
                  type="number"
                  min={0}
                  step="1"
                  value={form.lowStockLimit}
                  onChange={(e) => setForm((f) => ({ ...f, lowStockLimit: e.target.value }))}
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku-opening">Opening Stock (pieces) *</Label>
                <Input
                  id="sku-opening"
                  type="number"
                  min={0}
                  step="1"
                  value={form.openingStock}
                  onChange={(e) => setForm((f) => ({ ...f, openingStock: e.target.value }))}
                  className="rounded-xl tabular-nums"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-full px-6">
                {editingProduct ? 'Save Changes' : 'Create Product SKU'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto rounded-3xl border-border bg-card p-4 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold sm:text-lg">Delete Product SKU?</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Are you sure you want to remove{' '}
              <strong className="text-foreground">
                {deleteTarget?.code} — {deleteTarget?.name} ({deleteTarget?.size} /{' '}
                {deleteTarget?.color})
              </strong>
              ? This action removes the SKU from the catalog.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              className="rounded-full"
            >
              Delete SKU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
