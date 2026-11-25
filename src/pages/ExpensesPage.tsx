import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Info,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import { canMutate } from '@/lib/rbac';
import type { Expense, ExpenseCategory, PaymentAccount } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; pill: string }[] = [
  { value: 'rent', label: 'Rent', pill: 'bg-secondary text-foreground border-border' },
  { value: 'electricity', label: 'Electricity', pill: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'internet', label: 'Internet', pill: 'bg-sky-50 text-sky-800 border-sky-200' },
  { value: 'transport', label: 'Transport', pill: 'bg-peach-soft text-peach border-peach/30' },
  { value: 'food', label: 'Food', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 'packaging', label: 'Packaging', pill: 'bg-lime-soft text-foreground border-lime/40' },
  { value: 'marketing', label: 'Marketing', pill: 'bg-purple-50 text-purple-800 border-purple-200' },
];

const CATEGORY_META: Record<ExpenseCategory, { label: string; pill: string }> = {
  rent: { label: 'Rent', pill: 'bg-secondary text-foreground border-border' },
  electricity: { label: 'Electricity', pill: 'bg-amber-50 text-amber-800 border-amber-200' },
  internet: { label: 'Internet', pill: 'bg-sky-50 text-sky-800 border-sky-200' },
  transport: { label: 'Transport', pill: 'bg-peach-soft text-peach border-peach/30' },
  food: { label: 'Food', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  packaging: { label: 'Packaging', pill: 'bg-lime-soft text-foreground border-lime/40' },
  marketing: { label: 'Marketing', pill: 'bg-purple-50 text-purple-800 border-purple-200' },
};

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

export function ExpensesPage() {
  const { state, addExpense, deleteExpense, addOtherIncome } = useErp();
  const canEdit = canMutate(state.currentRole, 'expenses');

  const [activeTab, setActiveTab] = useState<'expenses' | 'other-income'>('expenses');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [search, setSearch] = useState('');

  // Expense dialog state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expDate, setExpDate] = useState(todayISO());
  const [expType, setExpType] = useState<ExpenseCategory>('rent');
  const [expAmount, setExpAmount] = useState('');
  const [expPaidBy, setExpPaidBy] = useState('Salma Rahman');
  const [expAccount, setExpAccount] = useState<PaymentAccount>('cash');
  const [expNote, setExpNote] = useState('');

  // Other income dialog state
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [incDate, setIncDate] = useState(todayISO());
  const [incSource, setIncSource] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incAccount, setIncAccount] = useState<PaymentAccount>('cash');
  const [incNote, setIncNote] = useState('');

  useEffect(() => {
    if (expenseDialogOpen) {
      setExpDate(todayISO());
      setExpType('transport');
      setExpAmount('');
      setExpPaidBy('Salma Rahman');
      setExpAccount('cash');
      setExpNote('');
    }
  }, [expenseDialogOpen]);

  useEffect(() => {
    if (incomeDialogOpen) {
      setIncDate(todayISO());
      setIncSource('');
      setIncAmount('');
      setIncAccount('cash');
      setIncNote('');
    }
  }, [incomeDialogOpen]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((e) => {
        if (categoryFilter !== 'all' && e.type !== categoryFilter) return false;
        if (!q) return true;
        return (
          e.type.toLowerCase().includes(q) ||
          e.paidBy.toLowerCase().includes(q) ||
          (e.note?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.expenses, categoryFilter, search]);

  const filteredIncomes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.otherIncomes]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((inc) => {
        if (!q) return true;
        return (
          inc.source.toLowerCase().includes(q) ||
          (inc.note?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [state.otherIncomes, search]);

  const expenseStats = useMemo(() => {
    const totalsByCat: Record<ExpenseCategory, number> = {
      rent: 0,
      electricity: 0,
      internet: 0,
      transport: 0,
      food: 0,
      packaging: 0,
      marketing: 0,
    };
    let grandTotal = 0;
    for (const e of state.expenses) {
      totalsByCat[e.type] += e.amount;
      grandTotal += e.amount;
    }

    const breakdown = EXPENSE_CATEGORIES.map((c) => ({
      ...c,
      total: totalsByCat[c.value],
      pct: grandTotal > 0 ? Math.round((totalsByCat[c.value] / grandTotal) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const topCategory = breakdown[0];
    const filteredTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    return { grandTotal, filteredTotal, breakdown, topCategory };
  }, [state.expenses, filteredExpenses]);

  const totalOtherIncome = useMemo(
    () => state.otherIncomes.reduce((sum, i) => sum + i.amount, 0),
    [state.otherIncomes],
  );

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(expAmount) || 0);
    if (amt <= 0) {
      toast.error('Amount must be greater than 0.');
      return;
    }
    addExpense({
      date: expDate,
      type: expType,
      amount: amt,
      paidBy: expPaidBy.trim() || 'Salma Rahman',
      account: expAccount,
      note: expNote.trim() || undefined,
    });
    toast.success(`Expense recorded: ${CATEGORY_META[expType].label} (${formatBDT(amt)})`);
    setExpenseDialogOpen(false);
  };

  const handleAddIncome = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.max(0, Number(incAmount) || 0);
    if (!incSource.trim()) {
      toast.error('Please enter the income source.');
      return;
    }
    if (amt <= 0) {
      toast.error('Amount must be greater than 0.');
      return;
    }
    addOtherIncome({
      date: incDate,
      source: incSource.trim(),
      amount: amt,
      account: incAccount,
      note: incNote.trim() || undefined,
    });
    toast.success(`Other income recorded: ${incSource.trim()} (${formatBDT(amt)})`);
    setIncomeDialogOpen(false);
  };

  const handleDeleteExpense = (exp: Expense) => {
    deleteExpense(exp.id);
    toast.success(`Deleted ${CATEGORY_META[exp.type].label} expense (${formatBDT(exp.amount)})`);
  };

  const handleExportCSV = () => {
    if (activeTab === 'expenses') {
      exportToPDF({
        filename: `expenses-report-${todayISO()}`,
        title: 'Operating Expenses Ledger',
        subtitle: `${filteredExpenses.length} voucher(s) • All amounts in BDT`,
        headers: ['Date', 'Category', 'Amount', 'Paid By', 'Account', 'Note'],
        rows: filteredExpenses.map((e) => [
          formatDate(e.date),
          CATEGORY_META[e.type].label,
          formatBDT(e.amount),
          e.paidBy,
          e.account,
          e.note ?? '',
        ]),
        company: state.company,
        summary: [
          { label: 'Total Expenses', value: formatBDT(expenseStats.filteredTotal), tone: 'danger' },
          { label: 'Top Category', value: expenseStats.topCategory?.label ?? '—' },
          { label: 'Transactions', value: String(filteredExpenses.length) },
        ],
        orientation: 'portrait',
      });
      toast.success(`Opened Expenses PDF (${filteredExpenses.length} records)`);
    } else {
      exportToPDF({
        filename: `other-income-report-${todayISO()}`,
        title: 'Other Income Ledger',
        subtitle: `${filteredIncomes.length} record(s) • All amounts in BDT`,
        headers: ['Date', 'Source', 'Amount', 'Account', 'Note'],
        rows: filteredIncomes.map((i) => [
          formatDate(i.date),
          i.source,
          formatBDT(i.amount),
          i.account,
          i.note ?? '',
        ]),
        company: state.company,
        summary: [
          { label: 'Total Other Income', value: formatBDT(totalOtherIncome), tone: 'success' },
          { label: 'Entries Recorded', value: String(filteredIncomes.length) },
        ],
        orientation: 'portrait',
      });
      toast.success(`Opened Other Income PDF (${filteredIncomes.length} records)`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight">
            Expenses &amp; Other Income
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track daily operating expenses across 7 categories and non-sales other income.
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
            <>
              <Button
                variant="outline"
                onClick={() => setIncomeDialogOpen(true)}
                className="rounded-xl border-lime/60 bg-lime-soft/60 hover:bg-lime-soft text-foreground text-xs sm:text-sm"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Add Other Income
              </Button>
              <Button
                onClick={() => setExpenseDialogOpen(true)}
                className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Expense
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Accounting Note Banner */}
      <div className="flex items-start gap-3 rounded-2xl bg-peach-soft/80 border border-peach/20 px-4 py-3 text-xs text-foreground">
        <Info className="h-4 w-4 text-peach shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Accounting Rule:</span> Owner withdrawals &amp; loan
          principal repayments are tracked in <strong>Owner &amp; Loans</strong> and are{' '}
          <strong>NOT</strong> counted as expenses.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'expenses' | 'other-income')}
        className="space-y-5"
      >
        <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap justify-start rounded-xl">
          <TabsTrigger value="expenses" className="rounded-lg text-xs shrink-0">
            Operating Expenses ({state.expenses.length})
          </TabsTrigger>
          <TabsTrigger value="other-income" className="rounded-lg text-xs shrink-0">
            Other Income ({state.otherIncomes.length})
          </TabsTrigger>
        </TabsList>

        {/* OPERATING EXPENSES TAB */}
        <TabsContent value="expenses" className="space-y-5 mt-0">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="card-surface p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                  Total Expenses
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
                  <TrendingDown className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-peach">
                {formatBDT(expenseStats.filteredTotal)}
              </p>
            </div>

            <div className="card-surface p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                  Top Category
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-foreground">
                  <Receipt className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-bold truncate">
                {expenseStats.topCategory && expenseStats.topCategory.total > 0
                  ? expenseStats.topCategory.label
                  : '—'}
              </p>
            </div>

            <div className="card-surface p-3.5 sm:p-5 col-span-2 md:col-span-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                  Transaction Count
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Receipt className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
                {filteredExpenses.length}
              </p>
            </div>
          </div>

          {/* Category Breakdown Bars */}
          <div className="card-surface p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Category Breakdown</h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategoryFilter(cat.value)}
                    className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold transition-all ${
                      categoryFilter === cat.value
                        ? 'bg-lime text-foreground shadow-xs'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {expenseStats.breakdown.map((item, idx) => (
                <div key={item.value} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <strong className="text-foreground">{formatBDT(item.total)}</strong> (
                      {item.pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        idx === 0 ? 'bar-dark' : 'bar-lime'
                      }`}
                      style={{ width: `${Math.max(item.total > 0 ? 4 : 0, item.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses Table */}
          <div className="card-surface p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Expense Vouchers</h2>
              <div className="relative w-full sm:max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search paid by, category, or note..."
                  className="pl-9 rounded-xl text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                    {canEdit && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canEdit ? 7 : 6}
                        className="text-center py-10 text-muted-foreground"
                      >
                        No expenses match your filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(exp.date)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${CATEGORY_META[exp.type].pill}`}
                          >
                            {CATEGORY_META[exp.type].label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-peach">
                          {formatBDT(exp.amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{exp.paidBy}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE[exp.account]}`}
                          >
                            {exp.account}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                          {exp.note || '—'}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                              title="Delete Expense"
                              onClick={() => handleDeleteExpense(exp)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* OTHER INCOME TAB */}
        <TabsContent value="other-income" className="space-y-5 mt-0">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="card-surface p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                  Total Other Income
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate text-success">
                {formatBDT(totalOtherIncome)}
              </p>
            </div>

            <div className="card-surface p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                  Entries Recorded
                </span>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-bold tabular-nums truncate">
                {state.otherIncomes.length}
              </p>
            </div>
          </div>

          <div className="card-surface p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Other Income Ledger</h2>
              <div className="relative w-full sm:max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search source or note..."
                  className="pl-9 rounded-xl text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Income Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncomes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        No other income entries recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredIncomes.map((inc) => (
                      <TableRow key={inc.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(inc.date)}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{inc.source}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-success">
                          +{formatBDT(inc.amount)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACCOUNT_BADGE[inc.account]}`}
                          >
                            {inc.account}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inc.note || '—'}
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

      {/* Add Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-peach-soft text-peach">
                <Receipt className="h-4 w-4" />
              </span>
              Add Operating Expense
            </DialogTitle>
            <DialogDescription>
              Record a daily business expense. Deducts automatically from Cash/Bank and Net Profit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Date</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-category">Category</Label>
                <Select
                  value={expType}
                  onValueChange={(v) => setExpType(v as ExpenseCategory)}
                >
                  <SelectTrigger id="exp-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Amount (BDT)</Label>
                <Input
                  id="exp-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="e.g., 2500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-account">Payment Account</Label>
                <Select
                  value={expAccount}
                  onValueChange={(v) => setExpAccount(v as PaymentAccount)}
                >
                  <SelectTrigger id="exp-account">
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
              <Label htmlFor="exp-paidby">Paid By</Label>
              <Input
                id="exp-paidby"
                value={expPaidBy}
                onChange={(e) => setExpPaidBy(e.target.value)}
                placeholder="e.g., Salma Rahman"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-note">Note (Optional)</Label>
              <Input
                id="exp-note"
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="Voucher details or bill reference..."
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpenseDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save Expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Other Income Dialog */}
      <Dialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-lime text-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              Add Other Income
            </DialogTitle>
            <DialogDescription>
              Record non-sales income (e.g., scrap sales, supplier rebate, commission).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddIncome} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inc-date">Date</Label>
                <Input
                  id="inc-date"
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inc-account">Deposit Account</Label>
                <Select
                  value={incAccount}
                  onValueChange={(v) => setIncAccount(v as PaymentAccount)}
                >
                  <SelectTrigger id="inc-account">
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
              <Label htmlFor="inc-source">Income Source</Label>
              <Input
                id="inc-source"
                value={incSource}
                onChange={(e) => setIncSource(e.target.value)}
                placeholder="e.g., Carton & scrap sale, Cashback rebate"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inc-amount">Amount (BDT)</Label>
              <Input
                id="inc-amount"
                type="number"
                min="1"
                step="1"
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="e.g., 5000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inc-note">Note (Optional)</Label>
              <Input
                id="inc-note"
                value={incNote}
                onChange={(e) => setIncNote(e.target.value)}
                placeholder="Additional remarks..."
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIncomeDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Save Other Income
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
