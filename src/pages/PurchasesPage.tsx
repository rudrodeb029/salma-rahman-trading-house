import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import type { PaymentAccount, Purchase } from '@/types/erp';
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

function generateNextBillNo(purchases: Purchase[]): string {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  for (const p of purchases) {
    const match = p.billNo.match(/(\d+)$/);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (n > maxSeq) maxSeq = n;
    }
  }
  return `PUR-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

export function PurchasesPage() {
  const { state, stockByProductId, addPurchase, deletePurchase } = useErp();
  const canEdit = canMutate(state.currentRole, 'purchases');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due'>('all');

  // Form state
  const suppliers = useMemo(
    () => state.parties.filter((p) => p.type === 'supplier'),
    [state.parties],
  );
  const [date, setDate] = useState(todayISO());
  const [billNo, setBillNo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [rate, setRate] = useState('0');
  const [transportCost, setTransportCost] = useState('0');
  const [paid, setPaid] = useState('0');
  const [account, setAccount] = useState<PaymentAccount>('bank');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (dialogOpen) {
      const defaultSup = suppliers[0]?.id ?? '';
      const defaultProd = state.products[0];
      const initialRate = defaultProd?.purchasePrice ?? 0;
      const initialTotal = 10 * initialRate;
      setDate(todayISO());
      setBillNo(generateNextBillNo(state.purchases));
      setSupplierId(defaultSup);
      setProductId(defaultProd?.id ?? '');
      setQuantity('10');
      setRate(String(initialRate));
      setTransportCost('0');
      setPaid(String(initialTotal));
      setAccount('bank');
      setNote('');
    }
  }, [dialogOpen, suppliers, state.products, state.purchases]);

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

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.purchases]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((p) => {
        if (statusFilter === 'paid' && p.due > 0) return false;
        if (statusFilter === 'due' && p.due <= 0) return false;
        if (!q) return true;
        const sup = partyById[p.supplierId];
        const prod = productById[p.productId];
        return (
          p.billNo.toLowerCase().includes(q) ||
          (sup?.name.toLowerCase().includes(q) ?? false) ||
          (sup?.shopName.toLowerCase().includes(q) ?? false) ||
          (prod?.name.toLowerCase().includes(q) ?? false) ||
          (prod?.code.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.purchases, search, statusFilter, partyById, productById]);

  const kpis = useMemo(() => {
    let totalPurchases = 0;
    let transportCosts = 0;
    let totalPaid = 0;
    let supplierDue = 0;
    for (const p of filteredPurchases) {
      totalPurchases += p.total;
      transportCosts += p.transportCost;
      totalPaid += p.paid;
      supplierDue += p.due;
    }
    return { totalPurchases, transportCosts, totalPaid, supplierDue };
  }, [filteredPurchases]);

  const qtyNum = Math.max(0, Number(quantity) || 0);
  const rateNum = Math.max(0, Number(rate) || 0);
  const transportNum = Math.max(0, Number(transportCost) || 0);
  const computedTotal = qtyNum * rateNum + transportNum;
  const paidNum = Math.max(0, Math.min(computedTotal, Number(paid) || 0));
  const computedDue = Math.max(0, computedTotal - paidNum);

  const handleProductChange = (nextId: string) => {
    setProductId(nextId);
    const prod = state.products.find((p) => p.id === nextId);
    if (prod) {
      setRate(String(prod.purchasePrice));
      const nextTotal = qtyNum * prod.purchasePrice + transportNum;
      setPaid(String(nextTotal));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Please select a supplier.');
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
      toast.error('Unit rate must be greater than 0.');
      return;
    }

    const created = addPurchase({
      date,
      billNo: billNo.trim() || generateNextBillNo(state.purchases),
      supplierId,
      productId,
      quantity: qtyNum,
      rate: rateNum,
      transportCost: transportNum,
      total: computedTotal,
      paid: paidNum,
      due: computedDue,
      account,
      note: note.trim() || undefined,
    });

    toast.success(`Purchase ${created.billNo} recorded (${formatBDT(created.total)})`);
    setDialogOpen(false);
  };

  const handleExportCSV = () => {
    exportToPDF({
      filename: `purchases-report-${todayISO()}`,
      title: 'Purchases & Supplier Bills Register',
      subtitle: `${filteredPurchases.length} purchase bill(s) • All amounts in BDT`,
      headers: [
        'Date',
        'Bill No',
        'Supplier',
        'Product',
        'Size/Color',
        'Qty',
        'Rate',
        'Transport',
        'Total',
        'Paid',
        'Due',
        'Account',
        'Note',
      ],
      rows: filteredPurchases.map((p) => {
        const sup = partyById[p.supplierId];
        const prod = productById[p.productId];
        return [
          formatDate(p.date),
          p.billNo,
          sup ? `${sup.name} (${sup.shopName})` : p.supplierId,
          prod ? `${prod.code} - ${prod.name}` : p.productId,
          prod ? `${prod.size} / ${prod.color}` : '',
          p.quantity,
          formatBDT(p.rate),
          formatBDT(p.transportCost),
          formatBDT(p.total),
          formatBDT(p.paid),
          formatBDT(p.due),
          p.account,
          p.note ?? '',
        ];
      }),
      company: state.company,
      summary: [
        { label: 'Total Purchases', value: formatBDT(kpis.totalPurchases) },
        { label: 'Transport Costs', value: formatBDT(kpis.transportCosts) },
        { label: 'Total Paid', value: formatBDT(kpis.totalPaid), tone: 'success' },
        { label: 'Supplier Due', value: formatBDT(kpis.supplierDue), tone: kpis.supplierDue > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Purchases PDF (${filteredPurchases.length} bills)`);
  };

  const handleDelete = (purchase: Purchase) => {
    deletePurchase(purchase.id);
    toast.success(`Deleted purchase bill ${purchase.billNo}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Purchases &amp; Supplier Bills
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track garment procurement, transport costs, and supplier payables.
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
              onClick={() => setDialogOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Purchase
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Purchases
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-foreground">
              <PackagePlus className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
            {formatBDT(kpis.totalPurchases)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Transport Costs
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <Truck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
            {formatBDT(kpis.transportCosts)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Paid
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-success">
            {formatBDT(kpis.totalPaid)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Supplier Due
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-peach">
            {formatBDT(kpis.supplierDue)}
          </p>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="card-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:flex-1 sm:max-w-md">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bill no., supplier, or product..."
              className="pl-9 rounded-xl text-xs sm:text-sm"
            />
          </div>

          <div className="inline-flex rounded-xl bg-secondary p-1 self-start">
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

        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Bill No.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Product (Size / Color)</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Transport</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Account</TableHead>
                {canEdit && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 12 : 11}
                    className="text-center py-10 text-muted-foreground"
                  >
                    No purchase bills match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPurchases.map((pur) => {
                  const supplier = partyById[pur.supplierId];
                  const product = productById[pur.productId];
                  return (
                    <TableRow key={pur.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(pur.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-xs">
                        {pur.billNo}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <div className="font-medium text-sm">
                          {supplier?.name ?? pur.supplierId}
                        </div>
                        {supplier?.shopName && (
                          <div className="text-xs text-muted-foreground">{supplier.shopName}</div>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[170px]">
                        <div className="font-medium text-sm">
                          {product?.name ?? pur.productId}
                        </div>
                        {product && (
                          <div className="text-xs text-muted-foreground">
                            {product.code} • {product.size} / {product.color}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {pur.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBDT(pur.rate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {pur.transportCost > 0 ? formatBDT(pur.transportCost) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatBDT(pur.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success font-medium">
                        {formatBDT(pur.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pur.due > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-peach-soft text-peach">
                            {formatBDT(pur.due)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-lime-soft text-success">
                            Paid
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE[pur.account]}`}
                        >
                          {pur.account}
                        </span>
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                            title="Delete Purchase"
                            onClick={() => handleDelete(pur)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-lime text-foreground">
                <PackagePlus className="h-4 w-4" />
              </span>
              Record New Purchase
            </DialogTitle>
            <DialogDescription>
              Stock increases immediately and weighted average unit cost recalculates automatically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pur-date">Date</Label>
                <Input
                  id="pur-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pur-bill">Bill No.</Label>
                <Input
                  id="pur-bill"
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  placeholder="PUR-2026-001"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pur-supplier">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="pur-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.name} ({sup.shopName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pur-product">Product SKU</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger id="pur-product">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pur-qty">Quantity</Label>
                <Input
                  id="pur-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pur-rate">Purchase Rate (BDT)</Label>
                <Input
                  id="pur-rate"
                  type="number"
                  min="0"
                  step="1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pur-transport">Transport Cost (BDT)</Label>
                <Input
                  id="pur-transport"
                  type="number"
                  min="0"
                  step="1"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-secondary/70 p-3.5 sm:p-4 space-y-3 border border-border/60">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                    Total
                  </p>
                  <p className="text-sm sm:text-lg font-bold tabular-nums truncate">
                    {formatBDT(computedTotal)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground">
                    Paid
                  </p>
                  <p className="text-sm sm:text-lg font-bold tabular-nums truncate text-success">
                    {formatBDT(paidNum)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                    Supplier Due
                  </p>
                  <p
                    className={`text-sm sm:text-lg font-bold tabular-nums truncate ${
                      computedDue > 0 ? 'text-peach' : 'text-muted-foreground'
                    }`}
                  >
                    {formatBDT(computedDue)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pur-paid">Paid Amount (BDT)</Label>
                    <button
                      type="button"
                      onClick={() => setPaid(String(computedTotal))}
                      className="text-[11px] font-semibold text-foreground bg-lime-soft hover:bg-lime px-2 py-0.5 rounded-full transition-colors"
                    >
                      Full Paid
                    </button>
                  </div>
                  <Input
                    id="pur-paid"
                    type="number"
                    min="0"
                    max={computedTotal}
                    step="1"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pur-account">Payment Account</Label>
                  <Select
                    value={account}
                    onValueChange={(v) => setAccount(v as PaymentAccount)}
                  >
                    <SelectTrigger id="pur-account">
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
              <Label htmlFor="pur-note">Note (Optional)</Label>
              <Input
                id="pur-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Lot details, challan reference, or transport note..."
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save Purchase ({formatBDT(computedTotal)})
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
