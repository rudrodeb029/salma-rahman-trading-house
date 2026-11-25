import { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Edit3,
  HandCoins,
  Plus,
  Search,
  Users,
  Wallet,
  TrendingUp,
  AlertCircle,
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

interface CustomerFormState {
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

function nextCustomerCode(parties: Party[]): string {
  const nums = parties
    .filter((p) => p.type === 'customer')
    .map((p) => {
      const m = p.code.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `CUST-${String(next).padStart(3, '0')}`;
}

export function CustomersPage() {
  const { state, partyAccountsById, addParty, updateParty, recordPartyPayment } = useErp();
  const canEdit = canMutate(state.currentRole, 'customers');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DueFilter>('all');

  // Add / Edit Dialog state
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<CustomerFormState>({
    code: '',
    name: '',
    shopName: '',
    mobile: '',
    address: '',
    openingDue: '0',
  });

  // Collect Due Dialog state
  const [paymentCustomer, setPaymentCustomer] = useState<Party | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    date: todayISO(),
    amount: '',
    account: 'cash',
    reference: '',
    note: '',
  });

  // Ledger Dialog state
  const [ledgerCustomer, setLedgerCustomer] = useState<Party | null>(null);

  const customers = useMemo(
    () => state.parties.filter((p) => p.type === 'customer'),
    [state.parties],
  );

  const kpis = useMemo(() => {
    let totalSales = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let dueCount = 0;

    for (const c of customers) {
      const acc = partyAccountsById[c.id];
      if (!acc) continue;
      totalSales += acc.totalVolume;
      totalCollected += acc.totalPaid;
      if (acc.currentDue > 0) {
        totalDue += acc.currentDue;
        dueCount += 1;
      }
    }

    return {
      count: customers.length,
      dueCount,
      totalSales,
      totalCollected,
      totalDue,
    };
  }, [customers, partyAccountsById]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const acc = partyAccountsById[c.id];
      const due = acc?.currentDue ?? c.openingDue;
      if (filter === 'has_due' && due <= 0) return false;
      if (filter === 'settled' && due > 0) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.shopName.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [customers, partyAccountsById, search, filter]);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of state.products) {
      map.set(p.id, `${p.name} (${p.size})`);
    }
    return map;
  }, [state.products]);

  const ledgerData = useMemo(() => {
    if (!ledgerCustomer) return null;
    const account = partyAccountsById[ledgerCustomer.id];
    const sales = state.sales
      .filter((s) => s.customerId === ledgerCustomer.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const payments = state.partyPayments
      .filter((p) => p.partyId === ledgerCustomer.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    type LedgerRow = {
      id: string;
      date: string;
      kind: 'sale' | 'payment';
      reference: string;
      description: string;
      billed: number;
      paid: number;
      account: PaymentAccount;
    };

    const rows: LedgerRow[] = [
      ...sales.map((s) => ({
        id: `s-${s.id}`,
        date: s.date,
        kind: 'sale' as const,
        reference: s.invoiceNo,
        description: `${productNameById.get(s.productId) ?? s.productId} × ${s.quantity} (${s.priceType})`,
        billed: s.total,
        paid: s.paid,
        account: s.account,
      })),
      ...payments.map((p) => ({
        id: `p-${p.id}`,
        date: p.date,
        kind: 'payment' as const,
        reference: p.reference,
        description: p.note || 'Due collection receipt',
        billed: 0,
        paid: p.amount,
        account: p.account,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return { account, rows };
  }, [ledgerCustomer, partyAccountsById, state.sales, state.partyPayments, productNameById]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setPartyForm({
      code: nextCustomerCode(state.parties),
      name: '',
      shopName: '',
      mobile: '',
      address: '',
      openingDue: '0',
    });
    setPartyModalOpen(true);
  };

  const openEditModal = (customer: Party) => {
    setEditingCustomer(customer);
    setPartyForm({
      code: customer.code,
      name: customer.name,
      shopName: customer.shopName,
      mobile: customer.mobile,
      address: customer.address,
      openingDue: String(customer.openingDue),
    });
    setPartyModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const code = partyForm.code.trim();
    const name = partyForm.name.trim();
    const shopName = partyForm.shopName.trim();
    const mobile = partyForm.mobile.trim();
    const address = partyForm.address.trim();
    const openingDue = Math.max(0, Number(partyForm.openingDue) || 0);

    if (!code || !name || !shopName) {
      toast.error('Please fill in Customer ID, Name, and Shop Name.');
      return;
    }

    if (editingCustomer) {
      updateParty(editingCustomer.id, {
        code,
        name,
        shopName,
        mobile,
        address,
        openingDue,
      });
      toast.success(`Updated customer ${shopName}`);
    } else {
      addParty({
        type: 'customer',
        code,
        name,
        shopName,
        mobile,
        address,
        openingDue,
      });
      toast.success(`Added customer ${shopName}`);
    }
    setPartyModalOpen(false);
  };

  const openCollectModal = (customer: Party) => {
    const acc = partyAccountsById[customer.id];
    const due = Math.max(0, acc?.currentDue ?? customer.openingDue);
    const today = todayISO();
    setPaymentCustomer(customer);
    setPaymentForm({
      date: today,
      amount: due > 0 ? String(Math.round(due)) : '',
      account: 'cash',
      reference: `REC-${today.replace(/-/g, '')}-${String(state.partyPayments.length + 1).padStart(3, '0')}`,
      note: '',
    });
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !paymentCustomer) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid collection amount greater than 0.');
      return;
    }

    recordPartyPayment({
      partyId: paymentCustomer.id,
      partyType: 'customer',
      date: paymentForm.date || todayISO(),
      amount,
      account: paymentForm.account,
      reference: paymentForm.reference.trim() || `REC-${Date.now().toString(36).toUpperCase()}`,
      note: paymentForm.note.trim() || undefined,
    });

    toast.success(`Collected ${formatBDT(amount)} from ${paymentCustomer.shopName}`);
    setPaymentCustomer(null);
  };

  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Name',
      'Shop Name',
      'Mobile',
      'Address',
      'Opening Due',
      'Total Sales',
      'Paid',
      'Current Due',
      'Last Payment Date',
    ];
    const rows = filteredCustomers.map((c) => {
      const acc = partyAccountsById[c.id];
      return [
        c.code,
        c.name,
        c.shopName,
        c.mobile,
        c.address,
        acc?.openingDue ?? c.openingDue,
        acc?.totalVolume ?? 0,
        acc?.totalPaid ?? 0,
        acc?.currentDue ?? c.openingDue,
        acc?.lastPaymentDate ?? '',
      ];
    });
    exportToPDF({
      filename: `customers-receivables-${todayISO()}`,
      title: 'Customers & Receivables Directory',
      subtitle: `${rows.length} customer account(s) • All amounts in BDT`,
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Total Customers', value: String(kpis.count) },
        { label: 'Total Sales Volume', value: formatBDT(kpis.totalSales) },
        { label: 'Total Collected', value: formatBDT(kpis.totalCollected), tone: 'success' },
        { label: 'Total Customer Due', value: formatBDT(kpis.totalDue), tone: kpis.totalDue > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Customers PDF (${rows.length} accounts)`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Customers & Receivables
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage wholesale buyers, retail shops, due collections, and customer account ledgers.
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
              Add Customer
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Customers
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {kpis.count}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Sales Volume
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {formatBDT(kpis.totalSales)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Collected
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-success">
            {formatBDT(kpis.totalCollected)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Customer Due
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
              placeholder="Search ID, name, shop, mobile, address..."
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
                <TableHead>Shop Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Opening Due</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Current Due</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No customers match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => {
                  const acc = partyAccountsById[customer.id];
                  const openingDue = acc?.openingDue ?? customer.openingDue;
                  const totalSales = acc?.totalVolume ?? 0;
                  const paid = acc?.totalPaid ?? 0;
                  const currentDue = acc?.currentDue ?? customer.openingDue;
                  const lastPaymentDate = acc?.lastPaymentDate ?? null;

                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-muted-foreground">
                        {customer.code}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {customer.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{customer.shopName}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {customer.mobile}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {customer.address}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatBDT(openingDue)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatBDT(totalSales)}
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
                              onClick={() => openCollectModal(customer)}
                              className="h-8 rounded-lg border-lime/60 bg-lime-soft/60 px-2.5 text-xs font-medium text-foreground hover:bg-lime-soft"
                            >
                              <HandCoins className="mr-1 h-3.5 w-3.5 text-success" />
                              Collect Due
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLedgerCustomer(customer)}
                            className="h-8 rounded-lg px-2.5 text-xs"
                          >
                            <BookOpen className="mr-1 h-3.5 w-3.5" />
                            Ledger
                          </Button>
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditModal(customer)}
                              className="h-8 w-8 rounded-lg"
                              title="Edit customer"
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

      {/* Add / Edit Customer Dialog */}
      <Dialog open={partyModalOpen} onOpenChange={setPartyModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Update customer profile and opening balance details.'
                : 'Create a new wholesale or retail customer account.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-code">Customer ID</Label>
                <Input
                  id="cust-code"
                  value={partyForm.code}
                  onChange={(e) => setPartyForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="CUST-007"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-opening">Opening Due (BDT)</Label>
                <Input
                  id="cust-opening"
                  type="number"
                  min={0}
                  value={partyForm.openingDue}
                  onChange={(e) => setPartyForm((f) => ({ ...f, openingDue: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Contact Name</Label>
                <Input
                  id="cust-name"
                  value={partyForm.name}
                  onChange={(e) => setPartyForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Md. Rafiqul Islam"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-shop">Shop Name</Label>
                <Input
                  id="cust-shop"
                  value={partyForm.shopName}
                  onChange={(e) => setPartyForm((f) => ({ ...f, shopName: e.target.value }))}
                  placeholder="e.g. Dhaka Fashion Point"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-mobile">Mobile</Label>
                <Input
                  id="cust-mobile"
                  value={partyForm.mobile}
                  onChange={(e) => setPartyForm((f) => ({ ...f, mobile: e.target.value }))}
                  placeholder="017XX-XXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-address">Address</Label>
                <Input
                  id="cust-address"
                  value={partyForm.address}
                  onChange={(e) => setPartyForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Market / Road, City"
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
                {editingCustomer ? 'Save Changes' : 'Add Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Collect Due Dialog */}
      <Dialog
        open={Boolean(paymentCustomer)}
        onOpenChange={(open) => {
          if (!open) setPaymentCustomer(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Collect Customer Due</DialogTitle>
            <DialogDescription>
              {paymentCustomer
                ? `${paymentCustomer.shopName} (${paymentCustomer.name})`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {paymentCustomer && (
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-peach-soft/70 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Current Outstanding Due</span>
                <span className="font-bold text-peach">
                  {formatBDT(partyAccountsById[paymentCustomer.id]?.currentDue ?? 0)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-date">Payment Date</Label>
                  <Input
                    id="rec-date"
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-amount">Amount (BDT)</Label>
                  <Input
                    id="rec-amount"
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
                  <Label>Receiving Account</Label>
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
                  <Label htmlFor="rec-ref">Reference / Receipt No.</Label>
                  <Input
                    id="rec-ref"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rec-note">Note (optional)</Label>
                <Input
                  id="rec-note"
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Cheque / bKash TrxID / remarks"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentCustomer(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl">
                  Record Collection
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Ledger Dialog */}
      <Dialog
        open={Boolean(ledgerCustomer)}
        onOpenChange={(open) => {
          if (!open) setLedgerCustomer(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Customer Ledger — {ledgerCustomer?.shopName}
            </DialogTitle>
            <DialogDescription>
              {ledgerCustomer?.code} • {ledgerCustomer?.name} • {ledgerCustomer?.mobile}
            </DialogDescription>
          </DialogHeader>

          {ledgerCustomer && ledgerData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-secondary/70 p-3">
                  <div className="text-xs text-muted-foreground">Opening Due</div>
                  <div className="mt-1 font-semibold">
                    {formatBDT(ledgerData.account?.openingDue ?? ledgerCustomer.openingDue)}
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/70 p-3">
                  <div className="text-xs text-muted-foreground">Total Sales</div>
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
                          No sales or payment transactions recorded yet.
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
                              {row.kind === 'payment' ? 'Collection' : 'Sale'}
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
