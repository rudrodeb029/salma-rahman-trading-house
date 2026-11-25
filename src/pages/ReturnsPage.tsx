import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Info,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import type { PaymentAccount, ReturnEntry } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export function ReturnsPage() {
  const { state, addReturn } = useErp();
  const canEdit = canMutate(state.currentRole, 'returns');

  const [tab, setTab] = useState<'all' | 'sales_return' | 'purchase_return'>('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<ReturnEntry['type']>('sales_return');
  const [originalRef, setOriginalRef] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('0');
  const [account, setAccount] = useState<PaymentAccount>('cash');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (dialogOpen) {
      const defaultProduct = state.products[0];
      setDate(todayISO());
      setType('sales_return');
      setOriginalRef(state.sales[0]?.invoiceNo ?? '');
      setProductId(defaultProduct?.id ?? '');
      setQuantity('1');
      setAmount(String(defaultProduct?.retailPrice ?? 0));
      setAccount('cash');
      setReason('');
    }
  }, [dialogOpen, state.products, state.sales]);

  const productById = useMemo(() => {
    const map: Record<string, (typeof state.products)[number]> = {};
    for (const p of state.products) map[p.id] = p;
    return map;
  }, [state.products]);

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.returns]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((r) => {
        if (tab !== 'all' && r.type !== tab) return false;
        if (!q) return true;
        const prod = productById[r.productId];
        return (
          r.originalRef.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          (prod?.name.toLowerCase().includes(q) ?? false) ||
          (prod?.code.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.returns, tab, search, productById]);

  const kpis = useMemo(() => {
    let salesRetQty = 0;
    let salesRetAmount = 0;
    let purchaseRetQty = 0;
    let purchaseRetAmount = 0;

    for (const r of state.returns) {
      if (r.type === 'sales_return') {
        salesRetQty += r.quantity;
        salesRetAmount += r.amount;
      } else {
        purchaseRetQty += r.quantity;
        purchaseRetAmount += r.amount;
      }
    }

    return {
      salesRetQty,
      salesRetAmount,
      purchaseRetQty,
      purchaseRetAmount,
      netStockImpact: salesRetQty - purchaseRetQty,
    };
  }, [state.returns]);

  const handleSelectReference = (refValue: string) => {
    setOriginalRef(refValue);
    if (type === 'sales_return') {
      const sale = state.sales.find((s) => s.invoiceNo === refValue);
      if (sale) {
        setProductId(sale.productId);
        const qNum = Math.max(1, Number(quantity) || 1);
        setAmount(String(sale.rate * qNum));
        setAccount(sale.account);
      }
    } else {
      const pur = state.purchases.find((p) => p.billNo === refValue);
      if (pur) {
        setProductId(pur.productId);
        const qNum = Math.max(1, Number(quantity) || 1);
        setAmount(String(pur.rate * qNum));
        setAccount(pur.account);
      }
    }
  };

  const handleTypeChange = (nextType: ReturnEntry['type']) => {
    setType(nextType);
    if (nextType === 'sales_return') {
      const firstSale = state.sales[0];
      setOriginalRef(firstSale?.invoiceNo ?? '');
      if (firstSale) {
        setProductId(firstSale.productId);
        setAmount(String(firstSale.rate));
      }
    } else {
      const firstPur = state.purchases[0];
      setOriginalRef(firstPur?.billNo ?? '');
      if (firstPur) {
        setProductId(firstPur.productId);
        setAmount(String(firstPur.rate));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Math.max(0, Number(quantity) || 0);
    const amountNum = Math.max(0, Number(amount) || 0);

    if (!originalRef.trim()) {
      toast.error('Please enter or select the original invoice/bill number.');
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
    if (!reason.trim()) {
      toast.error('Please provide a reason for the return.');
      return;
    }

    addReturn({
      date,
      type,
      originalRef: originalRef.trim(),
      productId,
      quantity: qtyNum,
      amount: amountNum,
      account,
      reason: reason.trim(),
    });

    toast.success(
      type === 'sales_return'
        ? `Sales return recorded (+${qtyNum} added back to stock)`
        : `Purchase return recorded (-${qtyNum} deducted from stock)`,
    );
    setDialogOpen(false);
  };

  const handleExportCSV = () => {
    exportToPDF({
      filename: `returns-report-${todayISO()}`,
      title: 'Sales & Purchase Returns Register',
      subtitle: `${filteredReturns.length} return record(s) • All amounts in BDT`,
      headers: [
        'Date',
        'Type',
        'Original Invoice/Bill No',
        'Product',
        'Size/Color',
        'Qty',
        'Amount',
        'Account',
        'Reason',
      ],
      rows: filteredReturns.map((r) => {
        const prod = productById[r.productId];
        return [
          formatDate(r.date),
          r.type === 'sales_return' ? 'Sales Return' : 'Purchase Return',
          r.originalRef,
          prod ? `${prod.code} - ${prod.name}` : r.productId,
          prod ? `${prod.size} / ${prod.color}` : '',
          r.quantity,
          formatBDT(r.amount),
          r.account,
          r.reason,
        ];
      }),
      company: state.company,
      summary: [
        { label: 'Sales Returns', value: formatBDT(kpis.salesRetAmount), tone: 'danger' },
        { label: 'Purchase Returns', value: formatBDT(kpis.purchaseRetAmount), tone: 'success' },
        { label: 'Net Stock Impact', value: `${kpis.netStockImpact > 0 ? '+' : ''}${kpis.netStockImpact} pcs` },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Returns PDF (${filteredReturns.length} entries)`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Sales &amp; Purchase Returns
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Process customer refunds and supplier returns with automatic inventory &amp; ledger sync.
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
              Record Return
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Sales Returns
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-peach">
            {formatBDT(kpis.salesRetAmount)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Total Purchase Returns
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-success">
            {formatBDT(kpis.purchaseRetAmount)}
          </p>
        </div>

        <div className="card-surface p-3.5 sm:p-5 col-span-2 md:col-span-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
              Net Stock Impact
            </span>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <PackageCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
            {kpis.netStockImpact > 0 ? `+${kpis.netStockImpact}` : kpis.netStockImpact} pcs
          </p>
        </div>
      </div>

      {/* Table Card */}
      <div className="card-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'all' | 'sales_return' | 'purchase_return')}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap justify-start rounded-xl">
              <TabsTrigger value="all" className="rounded-lg text-xs shrink-0">
                All Returns ({state.returns.length})
              </TabsTrigger>
              <TabsTrigger value="sales_return" className="rounded-lg text-xs shrink-0">
                Sales Returns ({state.returns.filter((r) => r.type === 'sales_return').length})
              </TabsTrigger>
              <TabsTrigger value="purchase_return" className="rounded-lg text-xs shrink-0">
                Purchase Returns (
                {state.returns.filter((r) => r.type === 'purchase_return').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, product, or reason..."
              className="pl-9 rounded-xl text-xs sm:text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Original Invoice / Bill No.</TableHead>
                <TableHead>Product (Size / Color)</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReturns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No return records found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReturns.map((ret) => {
                  const product = productById[ret.productId];
                  const isSalesReturn = ret.type === 'sales_return';
                  return (
                    <TableRow key={ret.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(ret.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isSalesReturn
                              ? 'bg-peach-soft text-peach'
                              : 'bg-lime-soft text-success'
                          }`}
                        >
                          {isSalesReturn ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {isSalesReturn ? 'Sales Return' : 'Purchase Return'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-xs">
                        {ret.originalRef}
                      </TableCell>
                      <TableCell className="min-w-[170px]">
                        <div className="font-medium text-sm">
                          {product?.name ?? ret.productId}
                        </div>
                        {product && (
                          <div className="text-xs text-muted-foreground">
                            {product.code} • {product.size} / {product.color}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        <span className={isSalesReturn ? 'text-success' : 'text-peach'}>
                          {isSalesReturn ? `+${ret.quantity}` : `-${ret.quantity}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatBDT(ret.amount)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE[ret.account]}`}
                        >
                          {ret.account}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                        {ret.reason}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Record Return Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-lime text-foreground">
                <RotateCcw className="h-4 w-4" />
              </span>
              Record Return Entry
            </DialogTitle>
            <DialogDescription>
              Log a customer sales return or a supplier purchase return.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1">
              <button
                type="button"
                onClick={() => handleTypeChange('sales_return')}
                className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                  type === 'sales_return'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sales Return (Customer)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('purchase_return')}
                className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                  type === 'purchase_return'
                    ? 'bg-lime text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Purchase Return (Supplier)
              </button>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-3.5 py-2.5 text-xs text-muted-foreground border border-border/60">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-foreground" />
              <p>
                {type === 'sales_return' ? (
                  <>
                    <strong className="text-foreground">Sales Return:</strong> Adds returned pieces
                    back into stock, reduces Net Sales, and records a refund outflow from the
                    selected account.
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">Purchase Return:</strong> Deducts returned
                    pieces from stock and records a supplier refund inflow into the selected
                    account.
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-date">Date</Label>
                <Input
                  id="ret-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ret-ref-select">
                  Pick Existing {type === 'sales_return' ? 'Invoice' : 'Bill'}
                </Label>
                <Select value={originalRef} onValueChange={handleSelectReference}>
                  <SelectTrigger id="ret-ref-select">
                    <SelectValue
                      placeholder={
                        type === 'sales_return' ? 'Select invoice...' : 'Select bill...'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {type === 'sales_return'
                      ? state.sales.map((s) => (
                          <SelectItem key={s.id} value={s.invoiceNo}>
                            {s.invoiceNo} ({formatDate(s.date)} • {formatBDT(s.total)})
                          </SelectItem>
                        ))
                      : state.purchases.map((p) => (
                          <SelectItem key={p.id} value={p.billNo}>
                            {p.billNo} ({formatDate(p.date)} • {formatBDT(p.total)})
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-ref-input">Original Invoice / Bill No.</Label>
                <Input
                  id="ret-ref-input"
                  value={originalRef}
                  onChange={(e) => setOriginalRef(e.target.value)}
                  placeholder={type === 'sales_return' ? 'INV-2026-001' : 'PUR-2026-001'}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ret-product">Product SKU</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger id="ret-product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.name} ({p.size}, {p.color})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-qty">Quantity</Label>
                <Input
                  id="ret-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-amount">Refund Amount (BDT)</Label>
                <Input
                  id="ret-amount"
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-account">Account</Label>
                <Select
                  value={account}
                  onValueChange={(v) => setAccount(v as PaymentAccount)}
                >
                  <SelectTrigger id="ret-account">
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

            <div className="space-y-1.5">
              <Label htmlFor="ret-reason">Reason</Label>
              <Input
                id="ret-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Size exchange, stitching defect, color mismatch..."
                required
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
                Save Return
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
