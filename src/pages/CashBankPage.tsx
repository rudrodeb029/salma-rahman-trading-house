import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Building2,
  Download,
  Plus,
  Search,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import type { PaymentAccount } from '@/types/erp';
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

const ACCOUNT_CONFIG: {
  key: PaymentAccount;
  label: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  barClass: string;
}[] = [
  {
    key: 'cash',
    label: 'Cash',
    badge: 'bg-lime-soft text-foreground border-lime/40',
    icon: Banknote,
    barClass: 'bar-lime',
  },
  {
    key: 'bank',
    label: 'Bank',
    badge: 'bg-secondary text-foreground border-border',
    icon: Building2,
    barClass: 'bar-dark',
  },
  {
    key: 'bKash',
    label: 'bKash',
    badge: 'bg-pink-50 text-pink-700 border-pink-200',
    icon: Smartphone,
    barClass: 'bar-lime',
  },
  {
    key: 'Nagad',
    label: 'Nagad',
    badge: 'bg-peach-soft text-peach border-peach/30',
    icon: Wallet,
    barClass: 'bar-stone',
  },
];

const ACCOUNT_BADGE_MAP: Record<PaymentAccount, string> = {
  cash: 'bg-lime-soft text-foreground border-lime/40',
  bank: 'bg-secondary text-foreground border-border',
  bKash: 'bg-pink-50 text-pink-700 border-pink-200',
  Nagad: 'bg-peach-soft text-peach border-peach/30',
};

export function CashBankPage() {
  const { state, cashLedger, addManualCashEntry } = useErp();
  const canEdit = canMutate(state.currentRole, 'cash-bank');

  const [accountFilter, setAccountFilter] = useState<'all' | PaymentAccount>('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [entryMode, setEntryMode] = useState<'in' | 'out' | 'transfer'>('transfer');
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState<PaymentAccount>('cash');
  const [toAccount, setToAccount] = useState<PaymentAccount>('bank');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Cash Deposit / Transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (dialogOpen) {
      setEntryMode('transfer');
      setDate(todayISO());
      setAccount('cash');
      setToAccount('bank');
      setAmount('');
      setCategory('Account Transfer');
      setReference(`TRF-${Date.now().toString().slice(-4)}`);
      setNote('');
    }
  }, [dialogOpen]);

  const today = todayISO();

  const dailyClosing = useMemo(() => {
    let todayIn = 0;
    let todayOut = 0;
    for (const entry of cashLedger.entries) {
      if (entry.date === today) {
        todayIn += entry.moneyIn;
        todayOut += entry.moneyOut;
      }
    }
    return {
      todayIn,
      todayOut,
      netToday: todayIn - todayOut,
      closingTotal: cashLedger.totalBalance,
    };
  }, [cashLedger.entries, cashLedger.totalBalance, today]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Show chronological order (oldest -> newest) or keep ledger order; PDF specifies full chronological table
    return cashLedger.entries.filter((entry) => {
      if (accountFilter !== 'all' && entry.account !== accountFilter) return false;
      if (!q) return true;
      return (
        entry.category.toLowerCase().includes(q) ||
        entry.reference.toLowerCase().includes(q) ||
        entry.account.toLowerCase().includes(q) ||
        (entry.note?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [cashLedger.entries, accountFilter, search]);

  const handleModeChange = (mode: 'in' | 'out' | 'transfer') => {
    setEntryMode(mode);
    if (mode === 'transfer') {
      setCategory('Account Transfer');
      setReference(`TRF-${Date.now().toString().slice(-4)}`);
    } else if (mode === 'in') {
      setCategory('Manual Adjustment (In)');
      setReference(`ADJ-IN-${Date.now().toString().slice(-4)}`);
    } else {
      setCategory('Manual Adjustment (Out)');
      setReference(`ADJ-OUT-${Date.now().toString().slice(-4)}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(amount) || 0);
    if (amt <= 0) {
      toast.error('Amount must be greater than 0.');
      return;
    }

    const ref = reference.trim() || `MAN-${Date.now().toString().slice(-4)}`;

    if (entryMode === 'transfer') {
      if (account === toAccount) {
        toast.error('Source and destination accounts must be different.');
        return;
      }
      addManualCashEntry({
        date,
        account,
        moneyIn: 0,
        moneyOut: amt,
        reference: ref,
        category: `Transfer to ${toAccount}`,
        note: note.trim() || undefined,
      });
      addManualCashEntry({
        date,
        account: toAccount,
        moneyIn: amt,
        moneyOut: 0,
        reference: ref,
        category: `Transfer from ${account}`,
        note: note.trim() || undefined,
      });
      toast.success(`Transferred ${formatBDT(amt)} from ${account} to ${toAccount}`);
    } else if (entryMode === 'in') {
      addManualCashEntry({
        date,
        account,
        moneyIn: amt,
        moneyOut: 0,
        reference: ref,
        category: category.trim() || 'Manual Cash In',
        note: note.trim() || undefined,
      });
      toast.success(`Recorded ${formatBDT(amt)} inflow into ${account}`);
    } else {
      addManualCashEntry({
        date,
        account,
        moneyIn: 0,
        moneyOut: amt,
        reference: ref,
        category: category.trim() || 'Manual Cash Out',
        note: note.trim() || undefined,
      });
      toast.success(`Recorded ${formatBDT(amt)} outflow from ${account}`);
    }

    setDialogOpen(false);
  };

  const handleExportCSV = () => {
    exportToPDF({
      filename: `cash-bank-ledger-${todayISO()}`,
      title: 'Cash & Bank Ledger Statement',
      subtitle: `Closing balances across Cash, Bank, bKash & Nagad • All amounts in BDT`,
      headers: ['Date', 'Account', 'Category', 'Reference', 'Money In', 'Money Out', 'Running Balance'],
      rows: filteredEntries.map((e) => [
        formatDate(e.date),
        e.account,
        e.category,
        e.reference,
        e.moneyIn > 0 ? formatBDT(e.moneyIn) : '—',
        e.moneyOut > 0 ? formatBDT(e.moneyOut) : '—',
        formatBDT(e.runningBalance),
      ]),
      company: state.company,
      summary: [
        { label: 'Cash', value: formatBDT(cashLedger.balancesByAccount.cash) },
        { label: 'Bank', value: formatBDT(cashLedger.balancesByAccount.bank) },
        { label: 'bKash', value: formatBDT(cashLedger.balancesByAccount.bKash) },
        { label: 'Nagad', value: formatBDT(cashLedger.balancesByAccount.Nagad) },
        { label: 'Total Balance', value: formatBDT(cashLedger.totalBalance), tone: 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Cash & Bank Ledger PDF (${filteredEntries.length} entries)`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Cash &amp; Bank Ledger
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Live balances across Cash, Bank, bKash &amp; Nagad with complete chronological audit
            trail.
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
              Manual Entry / Transfer
            </Button>
          )}
        </div>
      </div>

      {/* 4 Account Balance Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {ACCOUNT_CONFIG.map((acc) => {
          const Icon = acc.icon;
          const balance = cashLedger.balancesByAccount[acc.key];
          const share =
            cashLedger.totalBalance > 0
              ? Math.max(0, Math.round((balance / cashLedger.totalBalance) * 100))
              : 0;
          const isSelected = accountFilter === acc.key;

          return (
            <button
              key={acc.key}
              type="button"
              onClick={() => setAccountFilter(isSelected ? 'all' : acc.key)}
              className={`card-surface p-3.5 sm:p-5 text-left transition-all border min-w-0 ${
                isSelected
                  ? 'border-primary ring-2 ring-lime/60'
                  : 'border-transparent hover:border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold truncate">{acc.label}</p>
                <span
                  className={`inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border ${acc.badge}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              <p className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tabular-nums truncate">
                {formatBDT(balance)}
              </p>

              <div className="mt-2.5 sm:mt-3 space-y-1">
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground gap-1">
                  <span className="truncate">Share of total</span>
                  <span className="font-semibold text-foreground tabular-nums shrink-0">
                    {share}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${acc.barClass}`}
                    style={{ width: `${Math.min(100, Math.max(balance > 0 ? 4 : 0, share))}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Daily Cash Closing Summary Strip */}
      <div className="card-surface p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold">Daily Cash Closing Summary</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-lime-soft text-foreground self-start">
            <span className="h-2 w-2 rounded-full bg-success" />
            Live Synced Ledger
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="rounded-2xl bg-secondary/60 p-3 sm:p-3.5 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground flex items-center gap-1 truncate">
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-success" />
              <span className="truncate">Today&apos;s Money In</span>
            </p>
            <p className="mt-1 text-base sm:text-lg font-bold tabular-nums truncate text-success">
              +{formatBDT(dailyClosing.todayIn)}
            </p>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-3 sm:p-3.5 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground flex items-center gap-1 truncate">
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-peach" />
              <span className="truncate">Today&apos;s Money Out</span>
            </p>
            <p className="mt-1 text-base sm:text-lg font-bold tabular-nums truncate text-peach">
              -{formatBDT(dailyClosing.todayOut)}
            </p>
          </div>

          <div className="rounded-2xl bg-secondary/60 p-3 sm:p-3.5 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">
              Net Today
            </p>
            <p
              className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate ${
                dailyClosing.netToday >= 0 ? 'text-success' : 'text-peach'
              }`}
            >
              {dailyClosing.netToday >= 0 ? '+' : ''}
              {formatBDT(dailyClosing.netToday)}
            </p>
          </div>

          <div className="rounded-2xl bar-dark text-white p-3 sm:p-3.5 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-white/70 truncate">
              Closing Total
            </p>
            <p className="mt-1 text-base sm:text-lg font-bold tabular-nums truncate">
              {formatBDT(dailyClosing.closingTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Chronological Ledger Table */}
      <div className="card-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAccountFilter('all')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all ${
                accountFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              All Accounts ({cashLedger.entries.length})
            </button>
            {ACCOUNT_CONFIG.map((acc) => (
              <button
                key={acc.key}
                type="button"
                onClick={() => setAccountFilter(acc.key)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all ${
                  accountFilter === acc.key
                    ? 'bg-lime text-foreground shadow-xs'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, category, or note..."
              className="pl-9 rounded-xl text-xs sm:text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Money In</TableHead>
                <TableHead className="text-right">Money Out</TableHead>
                <TableHead className="text-right">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No ledger transactions match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE_MAP[entry.account]}`}
                      >
                        {entry.account}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <div>{entry.category}</div>
                      {entry.note && (
                        <div className="text-xs text-muted-foreground">{entry.note}</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-mono text-muted-foreground">
                      {entry.reference}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-success">
                      {entry.moneyIn > 0 ? `+${formatBDT(entry.moneyIn)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-peach">
                      {entry.moneyOut > 0 ? `-${formatBDT(entry.moneyOut)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {formatBDT(entry.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Manual Entry / Transfer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-lime text-foreground">
                <ArrowLeftRight className="h-4 w-4" />
              </span>
              Manual Cash Entry / Account Transfer
            </DialogTitle>
            <DialogDescription>
              Move funds between Cash, Bank, bKash, or Nagad, or record a manual cash adjustment.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-secondary p-1">
              {(
                [
                  { id: 'transfer', label: 'Transfer' },
                  { id: 'in', label: 'Money In' },
                  { id: 'out', label: 'Money Out' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    entryMode === m.id
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-date">Date</Label>
                <Input
                  id="cb-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-amount">Amount (BDT)</Label>
                <Input
                  id="cb-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g., 25000"
                  required
                />
              </div>
            </div>

            {entryMode === 'transfer' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-from">From Account</Label>
                  <Select
                    value={account}
                    onValueChange={(v) => setAccount(v as PaymentAccount)}
                  >
                    <SelectTrigger id="cb-from">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_CONFIG.map((acc) => (
                        <SelectItem key={acc.key} value={acc.key}>
                          {acc.label} ({formatBDT(cashLedger.balancesByAccount[acc.key])})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-to">To Account</Label>
                  <Select
                    value={toAccount}
                    onValueChange={(v) => setToAccount(v as PaymentAccount)}
                  >
                    <SelectTrigger id="cb-to">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_CONFIG.map((acc) => (
                        <SelectItem key={acc.key} value={acc.key}>
                          {acc.label} ({formatBDT(cashLedger.balancesByAccount[acc.key])})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-account">Account</Label>
                  <Select
                    value={account}
                    onValueChange={(v) => setAccount(v as PaymentAccount)}
                  >
                    <SelectTrigger id="cb-account">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_CONFIG.map((acc) => (
                        <SelectItem key={acc.key} value={acc.key}>
                          {acc.label} ({formatBDT(cashLedger.balancesByAccount[acc.key])})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-category">Category</Label>
                  <Input
                    id="cb-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Cash Deposit"
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-ref">Reference</Label>
                <Input
                  id="cb-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="TRF-001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-note">Note (Optional)</Label>
                <Input
                  id="cb-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Deposit slip or remark..."
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {entryMode === 'transfer' ? 'Record Transfer' : 'Save Entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
