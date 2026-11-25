import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  Download,
  Edit3,
  Package,
  Plus,
  Search,
  Send,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { canMutate } from '@/lib/rbac';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import type { Party, PaymentAccount } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

type DueFilter = 'all' | 'has_due' | 'settled';

const ACCOUNTS: PaymentAccount[] = ['cash', 'bank', 'bKash', 'Nagad'];

interface SupplierFormState {
  code: string;
  name: string;
  shopName: string;
  mobile: string;
  address: string;
  openingDue: string;
}

interface PaymentFormState {
  date: string;
  amount: string;
  account: PaymentAccount;
  reference: string;
  note: string;
}

function nextSupplierCode(parties: Party[]): string {
  const nums = parties
    .filter((p) => p.type === 'supplier')
    .map((p) => {
      const m = p.code.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `SUP-${String(next).padStart(3, '0')}`;
}

export function SuppliersPage() {
  const { state, partyAccountsById, addParty, updateParty, recordPartyPayment } = useErp();
  const canEdit = canMutate(state.currentRole, 'suppliers');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DueFilter>('all');

  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<SupplierFormState>({
    code: '',
    name: '',
    shopName: '',
    mobile: '',
    address: '',
    openingDue: '0',
  });

  const [paymentSupplier, setPaymentSupplier] = useState<Party | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    date: todayISO(),
    amount: '',
    account: 'bank',
    reference: '',
    note: '',
  });

  const [ledgerSupplier, setLedgerSupplier] = useState<Party | null>(null);

  const suppliers = useMemo(
    () => state.parties.filter((p) => p.type === 'supplier'),
    [state.parties],
  );

  const kpis = useMemo(() => {
    let totalPurchases = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let dueCount = 0;

    for (const s of suppliers) {
      const acc = partyAccountsById[s.id];
      if (!acc) continue;
      totalPurchases += acc.totalVolume;
      totalPaid += acc.totalPaid;
      if (acc.currentDue > 0) {
        totalDue += acc.currentDue;
        dueCount += 1;
      }
    }

    return {
      count: suppliers.length,
      dueCount,
      totalPurchases,
      totalPaid,
      totalDue,
    };
  }, [suppliers, partyAccountsById]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const acc = partyAccountsById[s.id];
      const due = acc?.currentDue ?? s.openingDue;
      if (filter === 'has_due' && due <= 0) return false;
      if (filter === 'settled' && due > 0) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.shopName.toLowerCase().includes(q) ||
        s.mobile.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q)
      );
    });
  }, [suppliers, partyAccountsById, search, filter]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of state.products) {
      map.set(p.id, `${p.name} (${p.size})`);
    }
    return map;
  }, [state.products]);

  const ledgerData = useMemo(() => {
    if (!ledgerSupplier) return null;
    const account = partyAccountsById[ledgerSupplier.id];
    const purchases = state.purchases
      .filter((p) => p.supplierId === ledgerSupplier.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const payments = state.partyPayments
      .filter((p) => p.partyId === ledgerSupplier.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    type LedgerRow = {
      id: string;
      date: string;
      kind: 'purchase' | 'payment';
      reference: string;
      description: string;
      billed: number;
      paid: number;
      account: PaymentAccount;
    };

    const rows: LedgerRow[] = [
      ...purchases.map((p) => ({
        id: `pur-${p.id}`,
        date: p.date,
        kind: 'purchase' as const,
        reference: p.billNo,
        description: `${productNameById.get(p.productId) ?? p.productId} × ${p.quantity}`,
        billed: p.total,
        paid: p.paid,
        account: p.account,
      })),
      ...payments.map((p) => ({
        id: `pay-${p.id}`,
        date: p.date,
        kind: 'payment' as const,
        reference: p.reference,
        description: p.note || 'Supplier due settlement',
        billed: 0,
        paid: p.amount,
        account: p.account,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return { account, rows };
  }, [ledgerSupplier, partyAccountsById, state.purchases, state.partyPayments, productNameById]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setPartyForm({
      code: nextSupplierCode(state.parties),
      name: '',
      shopName: '',
      mobile: '',
      address: '',
      openingDue: '0',
    });
    setPartyModalOpen(true);
  };

  const openEditModal = (supplier: Party) => {
    setEditingSupplier(supplier);
    setPartyForm({
      code: supplier.code,
      name: supplier.name,
      shopName: supplier.shopName,
      mobile: supplier.mobile,
      address: supplier.address,
      openingDue: String(supplier.openingDue),
    });
    setPartyModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const code = partyForm.code.trim();
    const name = partyForm.name.trim();
    const shopName = partyForm.shopName.trim();
    const mobile = partyForm.mobile.trim();
    const address = partyForm.address.trim();
    const openingDue = Math.max(0, Number(partyForm.openingDue) || 0);

    if (!code || !name || !shopName) {
      toast.error('Please fill in Supplier ID, Name, and Shop/Factory Name.');
      return;
    }

    if (editingSupplier) {
      updateParty(editingSupplier.id, {
        code,
        name,
        shopName,
        mobile,
        address,
        openingDue,
      });
      toast.success(`Updated supplier ${shopName}`);
    } else {
      addParty({
        type: 'supplier',
        code,
        name,
        shopName,
        mobile,
        address,
        openingDue,
      });
      toast.success(`Added supplier ${shopName}`);
    }
    setPartyModalOpen(false);
  };

  const openPayModal = (supplier: Party) => {
    const acc = partyAccountsById[supplier.id];
    const due = Math.max(0, acc?.currentDue ?? supplier.openingDue);
    const today = todayISO();
    setPaymentSupplier(supplier);
    setPaymentForm({
      date: today,
      amount: due > 0 ? String(Math.round(due)) : '',
      account: 'bank',
      reference: `PAY-${today.replace(/-/g, '')}-${String(state.partyPayments.length + 1).padStart(3, '0')}`,
      note: '',
    });
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !paymentSupplier) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount greater than 0.');
      return;
    }

    recordPartyPayment({
      partyId: paymentSupplier.id,
      partyType: 'supplier',
      date: paymentForm.date || todayISO(),
      amount,
      account: paymentForm.account,
      reference: paymentForm.reference.trim() || `PAY-${Date.now().toString(36).toUpperCase()}`,
      note: paymentForm.note.trim() || undefined,
    });

    toast.success(`Paid ${formatBDT(amount)} to ${paymentSupplier.shopName}`);
    setPaymentSupplier(null);
  };

  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Name',
      'Shop/Factory Name',
      'Mobile',
      'Address',
      'Opening Due',
      'Total Purchases',
      'Paid',
      'Current Due',
      'Last Payment Date',
    ];
    const rows = filteredSuppliers.map((s) => {
      const acc = partyAccountsById[s.id];
      return [
        s.code,
        s.name,
        s.shopName,
        s.mobile,
        s.address,
        acc?.openingDue ?? s.openingDue,
        acc?.totalVolume ?? 0,
        acc?.totalPaid ?? 0,
        acc?.currentDue ?? s.openingDue,
        acc?.lastPaymentDate ?? '',
      ];
    });
    exportToPDF({
      filename: `suppliers-payables-${todayISO()}`,
      title: 'Suppliers & Payables Directory',
      subtitle: `${rows.length} supplier account(s) • All amounts in BDT`,
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Total Suppliers', value: String(kpis.count) },
        { label: 'Total Purchases', value: formatBDT(kpis.totalPurchases) },
        { label: 'Total Paid', value: formatBDT(kpis.totalPaid), tone: 'success' },
        { label: 'Total Supplier Due', value: formatBDT(kpis.totalDue), tone: kpis.totalDue > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Suppliers PDF (${rows.length} accounts)`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Suppliers & Payables
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track garment factories, wholesalers, purchase payables, and supplier settlements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportCSV} className="rounded-xl text-xs sm:text-sm">
            <Download className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
          {canEdit && (
            <Button onClick={openAddModal} className="rounded-xl text-xs sm:text-sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Supplier
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Suppliers
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <Building2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {kpis.count}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Purchases Volume
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <Package className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {formatBDT(kpis.totalPurchases)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Paid
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-success">
            {formatBDT(kpis.totalPaid)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Supplier Due
            </span>
            <span
              className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ${
                kpis.totalDue > 0 ? 'bg-peach-soft text-peach' : 'bg-lime-soft text-success'
              }`}
            >
              <AlertCircle className="h-4 w-4" />
            </span>
          </div>
          <div
            className={`mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate ${
              kpis.totalDue > 0 ? 'text-peach' : 'text-success'
            }`}
          >
            {formatBDT(kpis.totalDue)}
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="card-surface p-3.5 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, name, factory, mobile, address..."
              className="rounded-xl pl-9 text-xs sm:text-sm"
            />
          </div>

          <div className="flex w-full sm:w-auto flex-wrap items-center gap-1 rounded-xl bg-secondary p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'has_due', label: 'Has Due' },
                { id: 'settled', label: 'Settled' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`flex-1 sm:flex-none cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === opt.id
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Shop/Factory Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Opening Due</TableHead>
                <TableHead className="text-right">Total Purchases</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Current Due</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No suppliers match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const acc = partyAccountsById[supplier.id];
                  const openingDue = acc?.openingDue ?? supplier.openingDue;
                  const totalPurchases = acc?.totalVolume ?? 0;
                  const paid = acc?.totalPaid ?? 0;
                  const currentDue = acc?.currentDue ?? supplier.openingDue;
                  const lastPaymentDate = acc?.lastPaymentDate ?? null;

                  return (
                    <TableRow key={supplier.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-muted-foreground">
                        {supplier.code}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {supplier.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{supplier.shopName}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {supplier.mobile}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {supplier.address}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatBDT(openingDue)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatBDT(totalPurchases)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-success">
                        {formatBDT(paid)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {currentDue > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-peach-soft px-2.5 py-0.5 text-xs font-semibold text-peach">
                            {formatBDT(currentDue)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-lime-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                            {formatBDT(currentDue)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {lastPaymentDate ? formatDate(lastPaymentDate) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPayModal(supplier)}
                              className="h-8 rounded-lg border-peach/40 bg-peach-soft/60 px-2.5 text-xs font-medium text-foreground hover:bg-peach-soft"
                            >
                              <Send className="mr-1 h-3.5 w-3.5 text-peach" />
                              Pay Due
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLedgerSupplier(supplier)}
                            className="h-8 rounded-lg px-2.5 text-xs"
                          >
                            <BookOpen className="mr-1 h-3.5 w-3.5" />
                            Ledger
                          </Button>
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditModal(supplier)}
                              className="h-8 w-8 rounded-lg"
                              title="Edit supplier"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
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

      {/* Add / Edit Supplier Dialog */}
      <Dialog open={partyModalOpen} onOpenChange={setPartyModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Update supplier factory or wholesaler information.'
                : 'Register a new garment factory or wholesale supplier.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSupplier} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-code">Supplier ID</Label>
                <Input
                  id="sup-code"
                  value={partyForm.code}
                  onChange={(e) => setPartyForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="SUP-005"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-opening">Opening Due (BDT)</Label>
                <Input
                  id="sup-opening"
                  type="number"
                  min={0}
                  value={partyForm.openingDue}
                  onChange={(e) => setPartyForm((f) => ({ ...f, openingDue: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name">Contact Name</Label>
                <Input
                  id="sup-name"
                  value={partyForm.name}
                  onChange={(e) => setPartyForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Haji Shamsul Haque"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-shop">Shop / Factory Name</Label>
                <Input
                  id="sup-shop"
                  value={partyForm.shopName}
                  onChange={(e) => setPartyForm((f) => ({ ...f, shopName: e.target.value }))}
                  placeholder="e.g. Narayanganj Knitwear Ltd"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-mobile">Mobile</Label>
                <Input
                  id="sup-mobile"
                  value={partyForm.mobile}
                  onChange={(e) => setPartyForm((f) => ({ ...f, mobile: e.target.value }))}
                  placeholder="018XX-XXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-address">Address</Label>
                <Input
                  id="sup-address"
                  value={partyForm.address}
                  onChange={(e) => setPartyForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Industrial Area / Market, City"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPartyModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingSupplier ? 'Save Changes' : 'Add Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay Due Dialog */}
      <Dialog
        open={Boolean(paymentSupplier)}
        onOpenChange={(open) => {
          if (!open) setPaymentSupplier(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pay Supplier Due</DialogTitle>
            <DialogDescription>
              {paymentSupplier
                ? `${paymentSupplier.shopName} (${paymentSupplier.name})`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {paymentSupplier && (
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-peach-soft/70 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Current Payable Due</span>
                <span className="font-bold text-peach">
                  {formatBDT(partyAccountsById[paymentSupplier.id]?.currentDue ?? 0)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay-date">Payment Date</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amount">Amount (BDT)</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min={1}
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Payment Account</Label>
                  <Select
                    value={paymentForm.account}
                    onValueChange={(v) =>
                      setPaymentForm((f) => ({ ...f, account: v as PaymentAccount }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNTS.map((acc) => (
                        <SelectItem key={acc} value={acc}>
                          {acc === 'cash' ? 'Cash' : acc === 'bank' ? 'Bank' : acc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-ref">Reference / Voucher No.</Label>
                  <Input
                    id="pay-ref"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-note">Note (optional)</Label>
                <Input
                  id="pay-note"
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Bank transfer / cheque / remarks"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentSupplier(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl">
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Supplier Ledger Dialog */}
      <Dialog
        open={Boolean(ledgerSupplier)}
        onOpenChange={(open) => {
          if (!open) setLedgerSupplier(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Supplier Ledger — {ledgerSupplier?.shopName}
            </DialogTitle>
            <DialogDescription>
              {ledgerSupplier?.code} • {ledgerSupplier?.name} • {ledgerSupplier?.mobile}
            </DialogDescription>
          </DialogHeader>

          {ledgerSupplier && ledgerData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-secondary/70 p-3">
                  <div className="text-xs text-muted-foreground">Opening Due</div>
                  <div className="mt-1 font-semibold">
                    {formatBDT(ledgerData.account?.openingDue ?? ledgerSupplier.openingDue)}
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/70 p-3">
                  <div className="text-xs text-muted-foreground">Total Purchases</div>
                  <div className="mt-1 font-semibold">
                    {formatBDT(ledgerData.account?.totalVolume ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl bg-lime-soft/70 p-3">
                  <div className="text-xs text-muted-foreground">Total Paid</div>
                  <div className="mt-1 font-semibold text-success">
                    {formatBDT(ledgerData.account?.totalPaid ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl bg-peach-soft/70 p-3">
                  <div className="text-xs text-muted-foreground">Current Due</div>
                  <div className="mt-1 font-semibold text-peach">
                    {formatBDT(ledgerData.account?.currentDue ?? 0)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No purchase bills or payments recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledgerData.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDate(row.date)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                row.kind === 'payment'
                                  ? 'border-lime/50 bg-lime-soft text-success'
                                  : 'bg-secondary text-foreground'
                              }
                            >
                              {row.kind === 'payment' ? 'Payment' : 'Purchase'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.description}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{row.account}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.billed > 0 ? formatBDT(row.billed) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-success">
                            {row.paid > 0 ? formatBDT(row.paid) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
