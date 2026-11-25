import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Download,
  Landmark,
  Plus,
  Scale,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { canMutate } from '@/lib/rbac';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import type { Loan, PaymentAccount } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const ACCOUNTS: PaymentAccount[] = ['cash', 'bank', 'bKash', 'Nagad'];

export function OwnerLoansPage() {
  const { state, addOwnerTransaction, addLoan, addLoanInstallment } = useErp();
  const canEdit = canMutate(state.currentRole, 'owner-loans');

  // Owner tx filter
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'investment' | 'withdrawal'>('all');

  // Owner Tx Modal
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [ownerForm, setOwnerForm] = useState({
    date: todayISO(),
    type: 'investment' as 'investment' | 'withdrawal',
    amount: '',
    account: 'bank' as PaymentAccount,
    note: '',
  });

  // Add Loan Modal
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    lenderName: '',
    date: todayISO(),
    principalAmount: '',
    interestRate: '9.5',
    note: '',
  });

  // Pay Installment Modal
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [instForm, setInstForm] = useState({
    loanId: '',
    date: todayISO(),
    principalPaid: '',
    interestPaid: '',
    account: 'bank' as PaymentAccount,
    note: '',
  });

  const kpis = useMemo(() => {
    let totalInvestment = 0;
    let totalWithdrawal = 0;
    for (const tx of state.ownerTransactions) {
      if (tx.type === 'investment') totalInvestment += tx.amount;
      else totalWithdrawal += tx.amount;
    }

    const totalLoansTaken = state.loans.reduce((sum, l) => sum + l.principalAmount, 0);
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;
    for (const inst of state.loanInstallments) {
      totalPrincipalPaid += inst.principalPaid;
      totalInterestPaid += inst.interestPaid;
    }

    const remainingLoanBalance = Math.max(0, totalLoansTaken - totalPrincipalPaid);

    return {
      totalInvestment,
      totalWithdrawal,
      netEquityFlow: totalInvestment - totalWithdrawal,
      totalLoansTaken,
      totalPrincipalPaid,
      totalInterestPaid,
      totalInstallmentsPaid: totalPrincipalPaid + totalInterestPaid,
      remainingLoanBalance,
    };
  }, [state.ownerTransactions, state.loans, state.loanInstallments]);

  const filteredOwnerTx = useMemo(() => {
    return state.ownerTransactions
      .filter((t) => (ownerFilter === 'all' ? true : t.type === ownerFilter))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.ownerTransactions, ownerFilter]);

  const loanStats = useMemo(() => {
    return state.loans.map((loan) => {
      const installments = state.loanInstallments.filter((i) => i.loanId === loan.id);
      const principalPaid = installments.reduce((sum, i) => sum + i.principalPaid, 0);
      const interestPaid = installments.reduce((sum, i) => sum + i.interestPaid, 0);
      const remaining = Math.max(0, loan.principalAmount - principalPaid);
      const progressPct =
        loan.principalAmount > 0
          ? Math.min(100, Math.round((principalPaid / loan.principalAmount) * 100))
          : 0;
      return {
        loan,
        principalPaid,
        interestPaid,
        remaining,
        progressPct,
        installmentCount: installments.length,
      };
    });
  }, [state.loans, state.loanInstallments]);

  const loanById = useMemo(() => {
    const map = new Map<string, Loan>();
    for (const l of state.loans) map.set(l.id, l);
    return map;
  }, [state.loans]);

  const sortedInstallments = useMemo(
    () => [...state.loanInstallments].sort((a, b) => b.date.localeCompare(a.date)),
    [state.loanInstallments],
  );

  // Handlers
  const handleSaveOwnerTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const amount = Number(ownerForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount greater than 0.');
      return;
    }

    addOwnerTransaction({
      date: ownerForm.date || todayISO(),
      type: ownerForm.type,
      amount,
      account: ownerForm.account,
      note: ownerForm.note.trim() || undefined,
    });

    toast.success(
      `Recorded Owner ${ownerForm.type === 'investment' ? 'Investment' : 'Withdrawal'} of ${formatBDT(amount)}`,
    );
    setOwnerModalOpen(false);
    setOwnerForm({
      date: todayISO(),
      type: 'investment',
      amount: '',
      account: 'bank',
      note: '',
    });
  };

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const lenderName = loanForm.lenderName.trim();
    const principalAmount = Number(loanForm.principalAmount);
    const interestRate = Number(loanForm.interestRate) || 0;

    if (!lenderName || !Number.isFinite(principalAmount) || principalAmount <= 0) {
      toast.error('Enter a valid lender name and principal amount.');
      return;
    }

    addLoan({
      lenderName,
      date: loanForm.date || todayISO(),
      principalAmount,
      interestRate,
      note: loanForm.note.trim() || undefined,
    });

    toast.success(`Added loan from ${lenderName} (${formatBDT(principalAmount)})`);
    setLoanModalOpen(false);
    setLoanForm({
      lenderName: '',
      date: todayISO(),
      principalAmount: '',
      interestRate: '9.5',
      note: '',
    });
  };

  const openPayInstallmentModal = (loan?: Loan) => {
    const targetId = loan?.id ?? state.loans[0]?.id ?? '';
    setInstForm({
      loanId: targetId,
      date: todayISO(),
      principalPaid: '',
      interestPaid: '',
      account: 'bank',
      note: '',
    });
    setInstModalOpen(true);
  };

  const handleSaveInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const principalPaid = Math.max(0, Number(instForm.principalPaid) || 0);
    const interestPaid = Math.max(0, Number(instForm.interestPaid) || 0);

    if (!instForm.loanId) {
      toast.error('Please select a loan.');
      return;
    }
    if (principalPaid + interestPaid <= 0) {
      toast.error('Enter a principal and/or interest amount greater than 0.');
      return;
    }

    addLoanInstallment({
      loanId: instForm.loanId,
      date: instForm.date || todayISO(),
      principalPaid,
      interestPaid,
      account: instForm.account,
      note: instForm.note.trim() || undefined,
    });

    const lender = loanById.get(instForm.loanId)?.lenderName ?? 'Loan';
    toast.success(
      `Recorded installment for ${lender}: ${formatBDT(principalPaid + interestPaid)}`,
    );
    setInstModalOpen(false);
  };

  const handleExportOwnerCSV = () => {
    const headers = ['Date', 'Type', 'Amount', 'Account', 'Note'];
    const rows = filteredOwnerTx.map((t) => [
      formatDate(t.date),
      t.type === 'investment' ? 'Investment' : 'Withdrawal',
      formatBDT(t.amount),
      t.account,
      t.note ?? '',
    ]);
    exportToPDF({
      filename: `owner-capital-${todayISO()}`,
      title: 'Owner Capital Account Statement',
      subtitle: 'Owner withdrawals reduce Cash & Bank but are NOT operating expenses',
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Total Investment', value: formatBDT(kpis.totalInvestment), tone: 'success' },
        { label: 'Total Withdrawal', value: formatBDT(kpis.totalWithdrawal), tone: 'danger' },
        { label: 'Net Equity Flow', value: formatBDT(kpis.netEquityFlow) },
      ],
      orientation: 'portrait',
    });
    toast.success(`Opened Owner Capital PDF (${rows.length} entries)`);
  };

  const handleExportLoansCSV = () => {
    const headers = [
      'Date',
      'Lender',
      'Principal Paid',
      'Interest Paid',
      'Total Paid',
      'Account',
      'Note',
    ];
    const rows = sortedInstallments.map((i) => [
      formatDate(i.date),
      loanById.get(i.loanId)?.lenderName ?? i.loanId,
      formatBDT(i.principalPaid),
      formatBDT(i.interestPaid),
      formatBDT(i.principalPaid + i.interestPaid),
      i.account,
      i.note ?? '',
    ]);
    exportToPDF({
      filename: `loan-installments-${todayISO()}`,
      title: 'Business Loans & Installment Ledger',
      subtitle: 'Loan principal repayments reduce cash; only interest is deducted from Net Profit',
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Loans Taken', value: formatBDT(kpis.totalLoansTaken) },
        { label: 'Installments Paid', value: formatBDT(kpis.totalInstallmentsPaid), tone: 'success' },
        { label: 'Remaining Balance', value: formatBDT(kpis.remainingLoanBalance), tone: kpis.remainingLoanBalance > 0 ? 'danger' : 'success' },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Loan Installments PDF (${rows.length} entries)`);
  };

  const instTotalPreview =
    (Number(instForm.principalPaid) || 0) + (Number(instForm.interestPaid) || 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Owner Capital & Business Loans
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track owner equity injections, personal drawings, bank loans, and installment schedules.
          </p>
        </div>
      </div>

      {/* Prominent Accounting Callout Card */}
      <div className="card-surface flex items-start gap-3 border border-peach/40 bg-peach-soft/65 p-3.5 sm:p-5">
        <span className="mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-card text-peach shadow-xs">
          <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <div className="space-y-1">
          <div className="text-xs sm:text-sm font-semibold text-foreground">
            Accounting Rule: Equity & Principal vs. Operating Expense
          </div>
          <p className="text-xs sm:text-sm text-foreground/85 leading-relaxed">
            Accounting Rule: Owner withdrawals and loan principal repayments reduce Cash &amp; Bank
            balances, but they are <strong>NOT</strong> operating expenses. Only loan interest is
            deducted from Net Profit.
          </p>
        </div>
      </div>

      {/* KPI Strip (6 cards) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Owner Investment
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-success">
            {formatBDT(kpis.totalInvestment)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Owner Withdrawal
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-peach">
            {formatBDT(kpis.totalWithdrawal)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Net Owner Equity Flow
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <Scale className="h-4 w-4" />
            </span>
          </div>
          <div
            className={`mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate ${
              kpis.netEquityFlow >= 0 ? 'text-success' : 'text-peach'
            }`}
          >
            {formatBDT(kpis.netEquityFlow)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Loans Taken
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <Landmark className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {formatBDT(kpis.totalLoansTaken)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Installments Paid
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {formatBDT(kpis.totalInstallmentsPaid)}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Remaining Loan Balance
            </span>
            <span
              className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ${
                kpis.remainingLoanBalance > 0
                  ? 'bg-peach-soft text-peach'
                  : 'bg-lime-soft text-success'
              }`}
            >
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div
            className={`mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate ${
              kpis.remainingLoanBalance > 0 ? 'text-peach' : 'text-success'
            }`}
          >
            {formatBDT(kpis.remainingLoanBalance)}
          </div>
        </div>
      </div>

      {/* Tabs: Owner Capital Account & Loans */}
      <Tabs defaultValue="owner" className="space-y-4 sm:space-y-5">
        <TabsList className="w-full sm:w-auto max-w-full overflow-x-auto flex-nowrap justify-start rounded-xl bg-secondary p-1">
          <TabsTrigger value="owner" className="shrink-0 rounded-lg px-3.5 sm:px-4 text-xs sm:text-sm">
            Owner Capital Account
          </TabsTrigger>
          <TabsTrigger value="loans" className="shrink-0 rounded-lg px-3.5 sm:px-4 text-xs sm:text-sm">
            Loans & Installments ({state.loans.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OWNER CAPITAL ACCOUNT */}
        <TabsContent value="owner" className="space-y-4">
          <div className="card-surface p-3.5 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full sm:w-auto flex-wrap items-center gap-1 rounded-xl bg-secondary p-1">
                {(
                  [
                    { id: 'all', label: 'All Entries' },
                    { id: 'investment', label: 'Investments' },
                    { id: 'withdrawal', label: 'Withdrawals' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOwnerFilter(opt.id)}
                    className={`flex-1 sm:flex-none cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      ownerFilter === opt.id
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleExportOwnerCSV} className="rounded-xl text-xs sm:text-sm">
                  <Download className="mr-1.5 h-4 w-4" />
                  Export PDF
                </Button>
                {canEdit && (
                  <Button onClick={() => setOwnerModalOpen(true)} className="rounded-xl text-xs sm:text-sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Record Investment / Withdrawal
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOwnerTx.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No owner capital transactions recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOwnerTx.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(tx.date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              tx.type === 'investment'
                                ? 'border-lime/50 bg-lime-soft text-success'
                                : 'border-peach/40 bg-peach-soft text-peach'
                            }
                          >
                            {tx.type === 'investment' ? 'Investment' : 'Withdrawal'}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            tx.type === 'investment' ? 'text-success' : 'text-peach'
                          }`}
                        >
                          {tx.type === 'investment' ? '+' : '−'}
                          {formatBDT(tx.amount)}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{tx.account}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {tx.note || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: LOANS & INSTALLMENTS */}
        <TabsContent value="loans" className="space-y-4 sm:space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Active & Settled Loans</h2>
              <p className="text-xs text-muted-foreground">
                Principal repayment reduces liability; interest is tracked as finance cost.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleExportLoansCSV} className="rounded-xl text-xs sm:text-sm">
                <Download className="mr-1.5 h-4 w-4" />
                Export Installments PDF
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => openPayInstallmentModal()}
                    disabled={state.loans.length === 0}
                    className="rounded-xl border-lime/60 bg-lime-soft/60 text-xs sm:text-sm hover:bg-lime-soft"
                  >
                    <Banknote className="mr-1.5 h-4 w-4 text-success" />
                    Pay Installment
                  </Button>
                  <Button onClick={() => setLoanModalOpen(true)} className="rounded-xl text-xs sm:text-sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add New Loan
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Loan Cards */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {loanStats.length === 0 ? (
              <div className="card-surface col-span-full p-8 text-center text-sm text-muted-foreground">
                No business loans recorded yet.
              </div>
            ) : (
              loanStats.map(
                ({
                  loan,
                  principalPaid,
                  interestPaid,
                  remaining,
                  progressPct,
                  installmentCount,
                }) => (
                  <div key={loan.id} className="card-surface flex flex-col justify-between p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {loan.lenderName}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            {loan.interestRate}% p.a.
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Disbursed {formatDate(loan.date)}
                          {loan.note ? ` • ${loan.note}` : ''}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayInstallmentModal(loan)}
                          className="rounded-xl border-lime/60 bg-lime-soft/60 text-xs hover:bg-lime-soft"
                        >
                          <Banknote className="mr-1 h-3.5 w-3.5 text-success" />
                          Pay Installment
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-secondary/70 p-2.5">
                        <div className="text-[11px] text-muted-foreground">Principal</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {formatBDT(loan.principalAmount)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-lime-soft/60 p-2.5">
                        <div className="text-[11px] text-muted-foreground">Principal Paid</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums text-success">
                          {formatBDT(principalPaid)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-secondary/70 p-2.5">
                        <div className="text-[11px] text-muted-foreground">Interest Paid</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {formatBDT(interestPaid)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-peach-soft/70 p-2.5">
                        <div className="text-[11px] text-muted-foreground">Remaining</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums text-peach">
                          {formatBDT(remaining)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Repayment Progress ({installmentCount} installment
                          {installmentCount === 1 ? '' : 's'})
                        </span>
                        <span className="font-semibold text-foreground">{progressPct}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="bar-lime h-full rounded-full transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
          </div>

          {/* Installments History Table */}
          <div className="card-surface p-3.5 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Installment Payment History
            </h3>
            <div className="overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead className="text-right">Principal Paid</TableHead>
                    <TableHead className="text-right">Interest Paid (P&amp;L)</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstallments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No loan installments paid yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedInstallments.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(inst.date)}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {loanById.get(inst.loanId)?.lenderName ?? inst.loanId}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {formatBDT(inst.principalPaid)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-peach">
                          {formatBDT(inst.interestPaid)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatBDT(inst.principalPaid + inst.interestPaid)}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{inst.account}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inst.note || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Owner Investment / Withdrawal Modal */}
      <Dialog open={ownerModalOpen} onOpenChange={setOwnerModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Record Owner Capital Transaction</DialogTitle>
            <DialogDescription>
              Owner withdrawals reduce Cash/Bank but are never counted as business expenses.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveOwnerTx} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary p-1">
              {(
                [
                  { id: 'investment', label: 'Owner Investment' },
                  { id: 'withdrawal', label: 'Owner Withdrawal' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOwnerForm((f) => ({ ...f, type: opt.id }))}
                  className={`cursor-pointer rounded-lg py-2 text-xs font-semibold transition-colors ${
                    ownerForm.type === opt.id
                      ? opt.id === 'investment'
                        ? 'bg-lime-soft text-success shadow-xs'
                        : 'bg-peach-soft text-peach shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ot-date">Date</Label>
                <Input
                  id="ot-date"
                  type="date"
                  value={ownerForm.date}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ot-amount">Amount (BDT)</Label>
                <Input
                  id="ot-amount"
                  type="number"
                  min={1}
                  value={ownerForm.amount}
                  onChange={(e) => setOwnerForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Account</Label>
              <Select
                value={ownerForm.account}
                onValueChange={(v) =>
                  setOwnerForm((f) => ({ ...f, account: v as PaymentAccount }))
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
              <Label htmlFor="ot-note">Note (optional)</Label>
              <Input
                id="ot-note"
                value={ownerForm.note}
                onChange={(e) => setOwnerForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Working capital / personal drawing reason"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOwnerModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Save Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add New Loan Modal */}
      <Dialog open={loanModalOpen} onOpenChange={setLoanModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add New Business Loan</DialogTitle>
            <DialogDescription>
              Loan principal is credited to Bank and tracked separately from operating revenue.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveLoan} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loan-lender">Lender / Bank Name</Label>
              <Input
                id="loan-lender"
                value={loanForm.lenderName}
                onChange={(e) => setLoanForm((f) => ({ ...f, lenderName: e.target.value }))}
                placeholder="e.g. BRAC Bank SME Loan"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="loan-date">Disbursement Date</Label>
                <Input
                  id="loan-date"
                  type="date"
                  value={loanForm.date}
                  onChange={(e) => setLoanForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan-rate">Interest Rate (% p.a.)</Label>
                <Input
                  id="loan-rate"
                  type="number"
                  step="0.1"
                  min={0}
                  value={loanForm.interestRate}
                  onChange={(e) => setLoanForm((f) => ({ ...f, interestRate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loan-principal">Principal Amount (BDT)</Label>
              <Input
                id="loan-principal"
                type="number"
                min={1}
                value={loanForm.principalAmount}
                onChange={(e) =>
                  setLoanForm((f) => ({ ...f, principalAmount: e.target.value }))
                }
                placeholder="500000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loan-note">Note (optional)</Label>
              <Input
                id="loan-note"
                value={loanForm.note}
                onChange={(e) => setLoanForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Tenure / collateral / purpose"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLoanModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Add Loan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay Installment Modal */}
      <Dialog open={instModalOpen} onOpenChange={setInstModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pay Loan Installment</DialogTitle>
            <DialogDescription>
              Split principal repayment and interest so Net Profit deducts only the interest portion.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveInstallment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Loan</Label>
              <Select
                value={instForm.loanId}
                onValueChange={(v) => setInstForm((f) => ({ ...f, loanId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select loan" />
                </SelectTrigger>
                <SelectContent>
                  {state.loans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.lenderName} ({formatBDT(l.principalAmount)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inst-date">Payment Date</Label>
                <Input
                  id="inst-date"
                  type="date"
                  value={instForm.date}
                  onChange={(e) => setInstForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Account</Label>
                <Select
                  value={instForm.account}
                  onValueChange={(v) =>
                    setInstForm((f) => ({ ...f, account: v as PaymentAccount }))
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
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inst-principal">Principal Paid (BDT)</Label>
                <Input
                  id="inst-principal"
                  type="number"
                  min={0}
                  value={instForm.principalPaid}
                  onChange={(e) =>
                    setInstForm((f) => ({ ...f, principalPaid: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inst-interest">Interest Paid (BDT)</Label>
                <Input
                  id="inst-interest"
                  type="number"
                  min={0}
                  value={instForm.interestPaid}
                  onChange={(e) =>
                    setInstForm((f) => ({ ...f, interestPaid: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Total Cash Outflow</span>
              <span className="font-bold tabular-nums">{formatBDT(instTotalPreview)}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inst-note">Note (optional)</Label>
              <Input
                id="inst-note"
                value={instForm.note}
                onChange={(e) => setInstForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Installment # / bank reference"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInstModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Record Installment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
