import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import type { PaymentAccount, Sale } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ACCOUNTS: { value: PaymentAccount; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'bKash', label: 'bKash' },
  { value: 'Nagad', label: 'Nagad' },
];

const ACCOUNT_BADGE: Record<PaymentAccount, string> = {
  cash: 'bg-lime-soft text-foreground border-lime/40',
  bank: 'bg-secondary text-foreground border-border',
  bKash: 'bg-pink-50 text-pink-700 border-pink-200',
  Nagad: 'bg-peach-soft text-peach border-peach/30',
};

function generateNextInvoiceNo(sales: Sale[]): string {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  for (const s of sales) {
    const match = s.invoiceNo.match(/(\d+)$/);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  return `INV-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

export function NewSaleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, stockByProductId, addSale } = useErp();

  const customers = useMemo(
    () => state.parties.filter((p) => p.type === 'customer'),
    [state.parties],
  );
  const activeStaff = useMemo(
    () => state.staff.filter((s) => s.active),
    [state.staff],
  );

  const [date, setDate] = useState(todayISO());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [priceType, setPriceType] = useState<'retail' | 'wholesale'>('retail');
  const [quantity, setQuantity] = useState('1');
  const [rate, setRate] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('0');
  const [account, setAccount] = useState<PaymentAccount>('cash');
  const [salesperson, setSalesperson] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      const defaultCustomer = customers[0]?.id ?? '';
      const defaultProduct = state.products[0];
      const defaultStaff = activeStaff[0]?.name ?? 'Salma Rahman';
      setDate(todayISO());
      setInvoiceNo(generateNextInvoiceNo(state.sales));
      setCustomerId(defaultCustomer);
      setProductId(defaultProduct?.id ?? '');
      setPriceType('retail');
      setQuantity('1');
      const initialRate = defaultProduct?.retailPrice ?? 0;
      setRate(String(initialRate));
      setDiscount('0');
      setPaid(String(initialRate));
      setAccount('cash');
      setSalesperson(defaultStaff);
      setNote('');
    }
  }, [open, customers, state.products, state.sales, activeStaff]);

  const selectedProduct = useMemo(
    () => state.products.find((p) => p.id === productId),
    [state.products, productId],
  );

  const availableStock = selectedProduct
    ? (stockByProductId[selectedProduct.id]?.currentStock ?? 0)
    : 0;

  const qtyNum = Math.max(0, Number(quantity) || 0);
  const rateNum = Math.max(0, Number(rate) || 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const grossTotal = qtyNum * rateNum;
  const total = Math.max(0, grossTotal - discountNum);
  const paidNum = Math.max(0, Math.min(total, Number(paid) || 0));
  const due = Math.max(0, total - paidNum);
  const exceedsStock = selectedProduct !== undefined && qtyNum > availableStock;

  const handleProductChange = (nextId: string) => {
    setProductId(nextId);
    const prod = state.products.find((p) => p.id === nextId);
    if (prod) {
      const nextRate = priceType === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
      setRate(String(nextRate));
      const nextTotal = Math.max(0, qtyNum * nextRate - discountNum);
      setPaid(String(nextTotal));
    }
  };

  const handlePriceTypeChange = (nextType: 'retail' | 'wholesale') => {
    setPriceType(nextType);
    if (selectedProduct) {
      const nextRate =
        nextType === 'wholesale'
          ? selectedProduct.wholesalePrice
          : selectedProduct.retailPrice;
      setRate(String(nextRate));
      const nextTotal = Math.max(0, qtyNum * nextRate - discountNum);
      setPaid(String(nextTotal));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error('Please select a customer.');
      return;
    }
    if (!productId) {
      toast.error('Please select a product.');
      return;
    }
    if (qtyNum <= 0) {
      toast.error('Quantity must be greater than 0.');
      return;
    }
    if (rateNum <= 0) {
      toast.error('Rate must be greater than 0.');
      return;
    }

    const trimmedInvoice = invoiceNo.trim() || generateNextInvoiceNo(state.sales);
    const created = addSale({
      date,
      invoiceNo: trimmedInvoice,
      customerId,
      productId,
      quantity: qtyNum,
      rate: rateNum,
      discount: discountNum,
      total,
      paid: paidNum,
      due,
      salesperson: salesperson.trim() || 'Salma Rahman',
      priceType,
      account,
      note: note.trim() || undefined,
    });

    toast.success(`Sale ${created.invoiceNo} recorded (${formatBDT(created.total)})`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-lime text-foreground">
              <ShoppingBag className="h-4 w-4" />
            </span>
            New Sales Invoice
          </DialogTitle>
          <DialogDescription>
            Record a retail or wholesale sale. Stock and cash/bank balances update automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-date">Date</Label>
              <Input
                id="sale-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-invoice">Invoice No.</Label>
              <Input
                id="sale-invoice"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="INV-2026-001"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-salesperson">Salesperson</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger id="sale-salesperson">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Salma Rahman">Salma Rahman (Owner)</SelectItem>
                  {activeStaff.map((st) => (
                    <SelectItem key={st.id} value={st.name}>
                      {st.name} — {st.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-customer">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="sale-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.shopName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Price Tier</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => handlePriceTypeChange('retail')}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    priceType === 'retail'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Retail {selectedProduct ? `(${formatBDT(selectedProduct.retailPrice)})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => handlePriceTypeChange('wholesale')}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    priceType === 'wholesale'
                      ? 'bg-lime text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Wholesale {selectedProduct ? `(${formatBDT(selectedProduct.wholesalePrice)})` : ''}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sale-product">Product SKU</Label>
              {selectedProduct && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    availableStock <= selectedProduct.lowStockLimit
                      ? 'bg-peach-soft text-peach'
                      : 'bg-lime-soft text-foreground'
                  }`}
                >
                  Available Stock: {availableStock} {selectedProduct.unit}
                </span>
              )}
            </div>
            <Select value={productId} onValueChange={handleProductChange}>
              <SelectTrigger id="sale-product">
                <SelectValue placeholder="Select product SKU" />
              </SelectTrigger>
              <SelectContent>
                {state.products.map((p) => {
                  const st = stockByProductId[p.id]?.currentStock ?? 0;
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name} ({p.size}, {p.color}) • Stock: {st}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {exceedsStock && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-peach-soft px-3.5 py-2.5 text-xs text-peach">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Quantity exceeds current stock!</p>
                <p className="opacity-90">
                  Requested {qtyNum} {selectedProduct.unit}, but only {availableStock} available in
                  inventory. You can still proceed if stock is being reconciled.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-qty">Quantity</Label>
              <Input
                id="sale-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-rate">Rate (BDT)</Label>
              <Input
                id="sale-rate"
                type="number"
                min="0"
                step="1"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-discount">Discount (BDT)</Label>
              <Input
                id="sale-discount"
                type="number"
                min="0"
                step="1"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-secondary/70 p-3.5 sm:p-4 space-y-3 border border-border/60">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                  Net Total
                </p>
                <p className="text-sm sm:text-lg font-bold tabular-nums truncate">{formatBDT(total)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">Paid</p>
                <p className="text-sm sm:text-lg font-bold tabular-nums truncate text-success">
                  {formatBDT(paidNum)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">Due</p>
                <p
                  className={`text-sm sm:text-lg font-bold tabular-nums truncate ${
                    due > 0 ? 'text-peach' : 'text-muted-foreground'
                  }`}
                >
                  {formatBDT(due)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sale-paid">Paid Amount (BDT)</Label>
                  <button
                    type="button"
                    onClick={() => setPaid(String(total))}
                    className="text-[11px] font-semibold text-foreground bg-lime-soft hover:bg-lime px-2 py-0.5 rounded-full transition-colors"
                  >
                    Full Paid
                  </button>
                </div>
                <Input
                  id="sale-paid"
                  type="number"
                  min="0"
                  max={total}
                  step="1"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sale-account">Payment Account</Label>
                <Select
                  value={account}
                  onValueChange={(v) => setAccount(v as PaymentAccount)}
                >
                  <SelectTrigger id="sale-account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((acc) => (
                      <SelectItem key={acc.value} value={acc.value}>
                        {acc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-note">Note (Optional)</Label>
            <Input
              id="sale-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Delivery instructions or payment remark..."
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Record Sale ({formatBDT(total)})
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SalesPage() {
  const { state, deleteSale } = useErp();
  const canEdit = canMutate(state.currentRole, 'sales');

  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due'>('all');

  const partyById = useMemo(() => {
    const map: Record<string, (typeof state.parties)[number]> = {};
    for (const p of state.parties) map[p.id] = p;
    return map;
  }, [state.parties]);

  const productById = useMemo(() => {
    const map: Record<string, (typeof state.products)[number]> = {};
    for (const p of state.products) map[p.id] = p;
    return map;
  }, [state.products]);

  const salespersons = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.sales) {
      if (s.salesperson) set.add(s.salesperson);
    }
    return Array.from(set).sort();
  }, [state.sales]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.sales]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((s) => {
        if (statusFilter === 'paid' && s.due > 0) return false;
        if (statusFilter === 'due' && s.due <= 0) return false;
        if (salespersonFilter !== 'all' && s.salesperson !== salespersonFilter) return false;
        if (!q) return true;
        const customer = partyById[s.customerId];
        const product = productById[s.productId];
        return (
          s.invoiceNo.toLowerCase().includes(q) ||
          s.salesperson.toLowerCase().includes(q) ||
          (customer?.name.toLowerCase().includes(q) ?? false) ||
          (customer?.shopName.toLowerCase().includes(q) ?? false) ||
          (product?.name.toLowerCase().includes(q) ?? false) ||
          (product?.code.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.sales, search, statusFilter, salespersonFilter, partyById, productById]);

  const kpis = useMemo(() => {
    let grossSales = 0;
    let totalDiscounts = 0;
    let netCollected = 0;
    let totalDue = 0;
    for (const s of filteredSales) {
      grossSales += s.quantity * s.rate;
      totalDiscounts += s.discount;
      netCollected += s.paid;
      totalDue += s.due;
    }
    return { grossSales, totalDiscounts, netCollected, totalDue };
  }, [filteredSales]);

  const handleExportCSV = () => {
    exportToPDF({
      filename: `sales-report-${todayISO()}`,
      title: 'Sales & Invoices Register',
      subtitle: `${filteredSales.length} invoice(s) • All amounts in BDT`,
      headers: [
        'Date',
        'Invoice No',
        'Customer',
        'Product',
        'Size/Color',
        'Tier',
        'Qty',
        'Rate',
        'Discount',
        'Total',
        'Paid',
        'Due',
        'Salesperson',
        'Account',
      ],
      rows: filteredSales.map((s) => {
        const cust = partyById[s.customerId];
        const prod = productById[s.productId];
        return [
          formatDate(s.date),
          s.invoiceNo,
          cust ? `${cust.name} (${cust.shopName})` : s.customerId,
          prod ? `${prod.code} - ${prod.name}` : s.productId,
          prod ? `${prod.size} / ${prod.color}` : '',
          s.priceType,
          s.quantity,
          formatBDT(s.rate),
          formatBDT(s.discount),
          formatBDT(s.total),
          formatBDT(s.paid),
          formatBDT(s.due),
          s.salesperson,
          s.account,
        ];
      }),
      company: state.company,
      summary: [
        { label: 'Gross Sales', value: formatBDT(kpis.grossSales) },
        { label: 'Total Discounts', value: formatBDT(kpis.totalDiscounts) },
        { label: 'Net Collected', value: formatBDT(kpis.netCollected), tone: 'success' },
        { label: 'Total Due', value: formatBDT(kpis.totalDue), tone: kpis.totalDue > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Sales PDF (${filteredSales.length} invoices)`);
  };

  const handleDelete = (sale: Sale) => {
    deleteSale(sale.id);
    toast.success(`Deleted invoice ${sale.invoiceNo}`);
  };

  const invoiceCustomer = invoiceSale ? partyById[invoiceSale.customerId] : undefined;
  const invoiceProduct = invoiceSale ? productById[invoiceSale.productId] : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Sales &amp; Invoices
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage retail &amp; wholesale invoices, track collections, and print customer bills.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="rounded-xl text-xs sm:text-sm"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export PDF
          </Button>
          {canEdit && (
            <Button
              onClick={() => setNewSaleOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Sale
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Gross Sales
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-foreground">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
            {formatBDT(kpis.grossSales)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Discounts
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <ShoppingBag className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
            {formatBDT(kpis.totalDiscounts)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Net Collected
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-success">
            {formatBDT(kpis.netCollected)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Due
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-peach">
            {formatBDT(kpis.totalDue)}
          </p>
        </div>
      </div>

      {/* Filters & Table Card */}
      <div className="card-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative w-full lg:flex-1 lg:max-w-md">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, customer, product, or salesperson..."
              className="pl-9 rounded-xl text-xs sm:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
              <SelectTrigger className="w-full sm:w-[180px] rounded-xl text-xs sm:text-sm">
                <SelectValue placeholder="All Salespersons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salespersons</SelectItem>
                {salespersons.map((sp) => (
                  <SelectItem key={sp} value={sp}>
                    {sp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="inline-flex rounded-xl bg-secondary p-1">
              {(['all', 'paid', 'due'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                    statusFilter === status
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product (Size / Color)</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Salesperson</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-10 text-muted-foreground">
                    No sales invoices match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => {
                  const customer = partyById[sale.customerId];
                  const product = productById[sale.productId];
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(sale.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-xs">
                        <div>{sale.invoiceNo}</div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {sale.priceType}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="font-medium text-sm">
                          {customer?.name ?? 'Walk-in Customer'}
                        </div>
                        {customer?.shopName && (
                          <div className="text-xs text-muted-foreground">{customer.shopName}</div>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[170px]">
                        <div className="font-medium text-sm">
                          {product?.name ?? sale.productId}
                        </div>
                        {product && (
                          <div className="text-xs text-muted-foreground">
                            {product.code} • {product.size} / {product.color}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {sale.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBDT(sale.rate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {sale.discount > 0 ? formatBDT(sale.discount) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatBDT(sale.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success font-medium">
                        {formatBDT(sale.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sale.due > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-peach-soft text-peach">
                            {formatBDT(sale.due)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-lime-soft text-success">
                            Paid
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {sale.salesperson}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE[sale.account]}`}
                        >
                          {sale.account}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg"
                            title="View Printable Invoice"
                            onClick={() => setInvoiceSale(sale)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                              title="Delete Sale"
                              onClick={() => handleDelete(sale)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Sale Dialog */}
      <NewSaleDialog open={newSaleOpen} onOpenChange={setNewSaleOpen} />

      {/* Printable Invoice Modal */}
      <Dialog open={invoiceSale !== null} onOpenChange={(o) => !o && setInvoiceSale(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Sales Invoice</span>
              {invoiceSale && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-lime-soft text-foreground">
                  {invoiceSale.invoiceNo}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Printable invoice copy for {state.company.name}
            </DialogDescription>
          </DialogHeader>

          {invoiceSale && (
            <div className="space-y-4 sm:space-y-5 rounded-2xl border border-border bg-card p-3.5 sm:p-5 text-sm">
              {/* Company & Invoice Meta */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bar-dark text-xs font-bold text-white">
                      {state.company.logoText}
                    </span>
                    <div>
                      <h3 className="font-bold text-base leading-tight">{state.company.name}</h3>
                      <p className="text-xs text-muted-foreground">{state.company.tagline}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{state.company.address}</p>
                  <p className="text-xs text-muted-foreground">Phone: {state.company.phone}</p>
                </div>
                <div className="sm:text-right text-xs space-y-1">
                  <p className="font-semibold text-sm">{invoiceSale.invoiceNo}</p>
                  <p className="text-muted-foreground">Date: {formatDate(invoiceSale.date)}</p>
                  <p className="text-muted-foreground">
                    Tier:{' '}
                    <span className="capitalize font-medium text-foreground">
                      {invoiceSale.priceType}
                    </span>
                  </p>
                  <p className="text-muted-foreground">Salesperson: {invoiceSale.salesperson}</p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="rounded-xl bg-secondary/60 p-3 text-xs space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bill To
                </p>
                <p className="font-semibold text-sm text-foreground">
                  {invoiceCustomer?.name ?? 'Walk-in Customer'}
                </p>
                {invoiceCustomer?.shopName && (
                  <p className="text-muted-foreground">{invoiceCustomer.shopName}</p>
                )}
                {invoiceCustomer?.mobile && (
                  <p className="text-muted-foreground">
                    {invoiceCustomer.mobile} • {invoiceCustomer.address}
                  </p>
                )}
              </div>

              {/* Line Item */}
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/70 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2.5 font-medium">Item</th>
                      <th className="text-right p-2.5 font-medium">Qty</th>
                      <th className="text-right p-2.5 font-medium">Rate</th>
                      <th className="text-right p-2.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground">
                          {invoiceProduct?.name ?? invoiceSale.productId}
                        </div>
                        {invoiceProduct && (
                          <div className="text-muted-foreground">
                            {invoiceProduct.code} • Size {invoiceProduct.size}, {invoiceProduct.color}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">{invoiceSale.quantity}</td>
                      <td className="p-2.5 text-right tabular-nums">
                        {formatBDT(invoiceSale.rate)}
                      </td>
                      <td className="p-2.5 text-right tabular-nums font-medium">
                        {formatBDT(invoiceSale.quantity * invoiceSale.rate)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 text-xs ml-auto max-w-[240px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {formatBDT(invoiceSale.quantity * invoiceSale.rate)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatBDT(invoiceSale.discount)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-border pt-1.5">
                  <span>Net Total</span>
                  <span className="tabular-nums">{formatBDT(invoiceSale.total)}</span>
                </div>
                <div className="flex justify-between text-success font-medium">
                  <span>Paid ({invoiceSale.account})</span>
                  <span className="tabular-nums">{formatBDT(invoiceSale.paid)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance Due</span>
                  <span
                    className={`tabular-nums ${
                      invoiceSale.due > 0 ? 'text-peach' : 'text-muted-foreground'
                    }`}
                  >
                    {formatBDT(invoiceSale.due)}
                  </span>
                </div>
              </div>

              {invoiceSale.note && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Note: {invoiceSale.note}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInvoiceSale(null)}>
              Close
            </Button>
            <Button
              onClick={() => window.print()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
