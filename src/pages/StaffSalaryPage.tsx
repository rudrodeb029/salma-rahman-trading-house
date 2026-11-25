import { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  Plus,
  Printer,
  Search,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { canMutate } from '@/lib/rbac';
import { calcNetSalary } from '@/lib/calculations';
import { exportToPDF, formatBDT, formatDate, todayISO } from '@/lib/format';
import type { PaymentAccount, SalaryRecord, StaffMember } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

interface StaffFormState {
  code: string;
  name: string;
  mobile: string;
  nid: string;
  address: string;
  position: string;
  joiningDate: string;
  basicSalary: string;
  active: boolean;
}

interface SalaryFormState {
  id?: string | undefined;
  staffId: string;
  month: string;
  basic: string;
  overtime: string;
  bonus: string;
  advanceTaken: string;
  deductions: string;
  account: PaymentAccount;
  status: 'paid' | 'pending';
  paymentDate: string;
}

function nextStaffCode(staff: StaffMember[]): string {
  const nums = staff.map((s) => {
    const m = s.code.match(/(\d+)$/);
    return m ? Number(m[1]) : 0;
  });
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `STF-${String(next).padStart(3, '0')}`;
}

export function StaffSalaryPage() {
  const { state, addStaff, updateStaff, upsertSalary, markSalaryPaid } = useErp();
  const canEdit = canMutate(state.currentRole, 'staff');

  const availableMonths = useMemo(() => {
    const set = new Set<string>(['2026-11', '2026-10', todayISO().slice(0, 7)]);
    for (const s of state.salaries) set.add(s.month);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [state.salaries]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => availableMonths[0] ?? '2026-11',
  );
  const [staffSearch, setStaffSearch] = useState('');

  // Staff modal
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormState>({
    code: '',
    name: '',
    mobile: '',
    nid: '',
    address: '',
    position: '',
    joiningDate: todayISO(),
    basicSalary: '',
    active: true,
  });

  // Salary modal
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [salaryForm, setSalaryForm] = useState<SalaryFormState>({
    staffId: '',
    month: selectedMonth,
    basic: '0',
    overtime: '0',
    bonus: '0',
    advanceTaken: '0',
    deductions: '0',
    account: 'cash',
    status: 'pending',
    paymentDate: '',
  });

  // Mark Paid modal
  const [payTarget, setPayTarget] = useState<SalaryRecord | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payAccount, setPayAccount] = useState<PaymentAccount>('cash');

  // Payslip modal
  const [payslipRecord, setPayslipRecord] = useState<SalaryRecord | null>(null);

  const staffById = useMemo(() => {
    const map = new Map<string, StaffMember>();
    for (const st of state.staff) map.set(st.id, st);
    return map;
  }, [state.staff]);

  const monthSalaries = useMemo(
    () => state.salaries.filter((s) => s.month === selectedMonth),
    [state.salaries, selectedMonth],
  );

  // Merge active staff with existing salary records for the selected month
  const payrollRows = useMemo(() => {
    const byStaff = new Map<string, SalaryRecord>();
    for (const sal of monthSalaries) {
      byStaff.set(sal.staffId, sal);
    }

    const rows: Array<{ staff: StaffMember; salary: SalaryRecord | null }> = [];
    const includedIds = new Set<string>();

    for (const st of state.staff) {
      const sal = byStaff.get(st.id) ?? null;
      if (st.active || sal) {
        rows.push({ staff: st, salary: sal });
        includedIds.add(st.id);
      }
    }

    // Include any orphan salary records just in case
    for (const sal of monthSalaries) {
      if (!includedIds.has(sal.staffId)) {
        const st = staffById.get(sal.staffId);
        if (st) rows.push({ staff: st, salary: sal });
      }
    }

    return rows;
  }, [state.staff, monthSalaries, staffById]);

  const payrollKpis = useMemo(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    let paidCount = 0;
    let pendingCount = 0;

    for (const sal of monthSalaries) {
      total += sal.netSalary;
      if (sal.status === 'paid') {
        paid += sal.netSalary;
        paidCount += 1;
      } else {
        pending += sal.netSalary;
        pendingCount += 1;
      }
    }

    return {
      total,
      paid,
      pending,
      paidCount,
      pendingCount,
      staffCount: state.staff.filter((s) => s.active).length,
      recordedCount: monthSalaries.length,
    };
  }, [monthSalaries, state.staff]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return state.staff;
    return state.staff.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.mobile.toLowerCase().includes(q) ||
        s.position.toLowerCase().includes(q) ||
        s.nid.toLowerCase().includes(q),
    );
  }, [state.staff, staffSearch]);

  const liveNetSalary = useMemo(
    () =>
      calcNetSalary({
        basic: Number(salaryForm.basic) || 0,
        overtime: Number(salaryForm.overtime) || 0,
        bonus: Number(salaryForm.bonus) || 0,
        advanceTaken: Number(salaryForm.advanceTaken) || 0,
        deductions: Number(salaryForm.deductions) || 0,
      }),
    [salaryForm],
  );

  // Handlers: Staff Directory
  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({
      code: nextStaffCode(state.staff),
      name: '',
      mobile: '',
      nid: '',
      address: '',
      position: 'Sales Executive',
      joiningDate: todayISO(),
      basicSalary: '15000',
      active: true,
    });
    setStaffModalOpen(true);
  };

  const openEditStaff = (member: StaffMember) => {
    setEditingStaff(member);
    setStaffForm({
      code: member.code,
      name: member.name,
      mobile: member.mobile,
      nid: member.nid,
      address: member.address,
      position: member.position,
      joiningDate: member.joiningDate,
      basicSalary: String(member.basicSalary),
      active: member.active,
    });
    setStaffModalOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const code = staffForm.code.trim();
    const name = staffForm.name.trim();
    const basicSalary = Math.max(0, Number(staffForm.basicSalary) || 0);

    if (!code || !name) {
      toast.error('Staff ID and Name are required.');
      return;
    }

    const payload = {
      code,
      name,
      mobile: staffForm.mobile.trim(),
      nid: staffForm.nid.trim(),
      address: staffForm.address.trim(),
      position: staffForm.position.trim() || 'Staff',
      joiningDate: staffForm.joiningDate || todayISO(),
      basicSalary,
      active: staffForm.active,
    };

    if (editingStaff) {
      updateStaff(editingStaff.id, payload);
      toast.success(`Updated staff profile for ${name}`);
    } else {
      addStaff(payload);
      toast.success(`Added staff member ${name}`);
    }
    setStaffModalOpen(false);
  };

  // Handlers: Monthly Payroll
  const openSalaryModal = (staff?: StaffMember, existing?: SalaryRecord | null) => {
    const targetStaff = staff ?? state.staff.find((s) => s.active) ?? state.staff[0];
    if (!targetStaff) {
      toast.error('Add a staff member first.');
      return;
    }

    if (existing) {
      setSalaryForm({
        id: existing.id,
        staffId: existing.staffId,
        month: existing.month,
        basic: String(existing.basic),
        overtime: String(existing.overtime),
        bonus: String(existing.bonus),
        advanceTaken: String(existing.advanceTaken),
        deductions: String(existing.deductions),
        account: existing.account,
        status: existing.status,
        paymentDate: existing.paymentDate ?? '',
      });
    } else {
      setSalaryForm({
        staffId: targetStaff.id,
        month: selectedMonth,
        basic: String(targetStaff.basicSalary),
        overtime: '0',
        bonus: '0',
        advanceTaken: '0',
        deductions: '0',
        account: 'cash',
        status: 'pending',
        paymentDate: '',
      });
    }
    setSalaryModalOpen(true);
  };

  const handleStaffChangeInSalaryModal = (newStaffId: string) => {
    const existing = state.salaries.find(
      (s) => s.staffId === newStaffId && s.month === salaryForm.month,
    );
    const member = staffById.get(newStaffId);
    if (existing) {
      setSalaryForm({
        id: existing.id,
        staffId: existing.staffId,
        month: existing.month,
        basic: String(existing.basic),
        overtime: String(existing.overtime),
        bonus: String(existing.bonus),
        advanceTaken: String(existing.advanceTaken),
        deductions: String(existing.deductions),
        account: existing.account,
        status: existing.status,
        paymentDate: existing.paymentDate ?? '',
      });
    } else {
      setSalaryForm((prev) => ({
        ...prev,
        id: undefined,
        staffId: newStaffId,
        basic: String(member?.basicSalary ?? 0),
        overtime: '0',
        bonus: '0',
        advanceTaken: '0',
        deductions: '0',
        status: 'pending',
        paymentDate: '',
      }));
    }
  };

  const handleSaveSalary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!salaryForm.staffId || !salaryForm.month) {
      toast.error('Select a staff member and payroll month.');
      return;
    }

    const member = staffById.get(salaryForm.staffId);
    upsertSalary({
      id: salaryForm.id,
      staffId: salaryForm.staffId,
      month: salaryForm.month,
      basic: Number(salaryForm.basic) || 0,
      overtime: Number(salaryForm.overtime) || 0,
      bonus: Number(salaryForm.bonus) || 0,
      advanceTaken: Number(salaryForm.advanceTaken) || 0,
      deductions: Number(salaryForm.deductions) || 0,
      account: salaryForm.account,
      status: salaryForm.status,
      paymentDate:
        salaryForm.status === 'paid' ? salaryForm.paymentDate || todayISO() : undefined,
    });

    toast.success(
      `Saved ${formatDate(salaryForm.month)} salary for ${member?.name ?? 'staff member'} (${formatBDT(liveNetSalary)})`,
    );
    setSalaryModalOpen(false);
  };

  const openMarkPaidModal = (record: SalaryRecord) => {
    setPayTarget(record);
    setPayDate(todayISO());
    setPayAccount(record.account || 'cash');
  };

  const handleConfirmMarkPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !payTarget) return;
    markSalaryPaid(payTarget.id, payDate || todayISO(), payAccount);
    const member = staffById.get(payTarget.staffId);
    toast.success(
      `Marked ${member?.name ?? 'staff'}'s salary (${formatBDT(payTarget.netSalary)}) as Paid`,
    );
    setPayTarget(null);
  };

  const handleExportPayrollCSV = () => {
    const headers = [
      'Staff ID',
      'Name',
      'Position',
      'Month',
      'Basic',
      'Overtime',
      'Bonus',
      'Advance Taken',
      'Deductions',
      'Net Salary',
      'Payment Date',
      'Status',
      'Account',
    ];
    const rows = payrollRows
      .filter((r) => r.salary !== null)
      .map(({ staff, salary }) => [
        staff.code,
        staff.name,
        staff.position,
        salary!.month,
        salary!.basic,
        salary!.overtime,
        salary!.bonus,
        salary!.advanceTaken,
        salary!.deductions,
        salary!.netSalary,
        salary!.paymentDate ?? '',
        salary!.status,
        salary!.account,
      ]);
    exportToPDF({
      filename: `payroll-${selectedMonth}`,
      title: `Monthly Payroll Register — ${formatDate(selectedMonth)}`,
      subtitle: 'Net Salary = Basic + Overtime + Bonus − Advance − Deductions',
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Total Payroll', value: formatBDT(payrollKpis.total) },
        { label: 'Paid', value: formatBDT(payrollKpis.paid), tone: 'success' },
        { label: 'Pending', value: formatBDT(payrollKpis.pending), tone: payrollKpis.pending > 0 ? 'danger' : 'success' },
        { label: 'Active Staff', value: String(payrollKpis.staffCount) },
      ],
      orientation: 'landscape',
    });
    toast.success(`Opened Payroll PDF for ${formatDate(selectedMonth)}`);
  };

  const handleExportStaffCSV = () => {
    const headers = [
      'ID',
      'Name',
      'Mobile',
      'NID',
      'Address',
      'Position',
      'Joining Date',
      'Basic Salary',
      'Status',
    ];
    const rows = filteredStaff.map((s) => [
      s.code,
      s.name,
      s.mobile,
      s.nid,
      s.address,
      s.position,
      formatDate(s.joiningDate),
      formatBDT(s.basicSalary),
      s.active ? 'Active' : 'Inactive',
    ]);
    exportToPDF({
      filename: `staff-directory-${todayISO()}`,
      title: 'Staff Directory & Salary Structure',
      subtitle: `${rows.length} staff member(s) • All salaries in BDT`,
      headers,
      rows,
      company: state.company,
      orientation: 'landscape',
    });
    toast.success(`Opened Staff Directory PDF (${rows.length} members)`);
  };

  const payslipStaff = payslipRecord ? staffById.get(payslipRecord.staffId) : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Staff & Monthly Payroll
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage employee profiles, calculate monthly net salaries, disburse payroll, and print payslips.
          </p>
        </div>
      </div>

      <Tabs defaultValue="payroll" className="space-y-5 sm:space-y-6">
        <TabsList className="w-full sm:w-auto max-w-full overflow-x-auto flex-nowrap justify-start rounded-xl bg-secondary p-1">
          <TabsTrigger value="payroll" className="shrink-0 rounded-lg px-3.5 sm:px-4 text-xs sm:text-sm">
            Monthly Payroll
          </TabsTrigger>
          <TabsTrigger value="directory" className="shrink-0 rounded-lg px-3.5 sm:px-4 text-xs sm:text-sm">
            Staff Directory ({state.staff.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MONTHLY PAYROLL */}
        <TabsContent value="payroll" className="space-y-4 sm:space-y-5">
          {/* Formula Banner */}
          <div className="card-surface flex flex-col gap-3 border border-lime/40 bg-lime-soft/60 px-4 py-3.5 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start sm:items-center gap-2.5 text-xs sm:text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card text-success shadow-xs">
                <Calculator className="h-4 w-4" />
              </span>
              <div>
                <span className="font-semibold text-foreground">Payroll Formula: </span>
                <span className="font-mono text-xs sm:text-sm text-foreground/90">
                  Net salary = Basic + Overtime + Bonus − Advance − Deductions
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-9 w-[140px] sm:w-[150px] rounded-xl bg-card text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatDate(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportPayrollCSV} className="h-9 rounded-xl bg-card text-xs sm:text-sm">
                <Download className="mr-1.5 h-4 w-4" />
                Export PDF
              </Button>
              {canEdit && (
                <Button onClick={() => openSalaryModal()} className="h-9 rounded-xl text-xs sm:text-sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add / Edit Salary
                </Button>
              )}
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <div className="card-surface p-3.5 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Payroll ({formatDate(selectedMonth)})
                </span>
                <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
                {formatBDT(payrollKpis.total)}
              </div>
            </div>

            <div className="card-surface p-3.5 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Paid
                </span>
                <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-success">
                {formatBDT(payrollKpis.paid)}
              </div>
            </div>

            <div className="card-surface p-3.5 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pending
                </span>
                <span
                  className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ${
                    payrollKpis.pending > 0
                      ? 'bg-peach-soft text-peach'
                      : 'bg-lime-soft text-success'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div
                className={`mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate ${
                  payrollKpis.pending > 0 ? 'text-peach' : 'text-success'
                }`}
              >
                {formatBDT(payrollKpis.pending)}
              </div>
            </div>

            <div className="card-surface p-3.5 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Active Staff Count
                </span>
                <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
                {payrollKpis.staffCount}
              </div>
            </div>
          </div>

          {/* Payroll Table */}
          <div className="card-surface p-3.5 sm:p-5">
            <div className="overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Advance</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                        No staff members found. Add staff in the Staff Directory tab first.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payrollRows.map(({ staff, salary }) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium whitespace-nowrap">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.code} • {staff.position}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(salary?.month ?? selectedMonth)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {salary ? formatBDT(salary.basic) : formatBDT(staff.basicSalary)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {salary ? formatBDT(salary.overtime) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {salary ? formatBDT(salary.bonus) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-peach">
                          {salary && salary.advanceTaken > 0
                            ? `-${formatBDT(salary.advanceTaken)}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-peach">
                          {salary && salary.deductions > 0
                            ? `-${formatBDT(salary.deductions)}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {salary ? formatBDT(salary.netSalary) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {salary?.paymentDate ? formatDate(salary.paymentDate) : '—'}
                        </TableCell>
                        <TableCell>
                          {salary ? (
                            salary.status === 'paid' ? (
                              <Badge
                                variant="outline"
                                className="border-lime/50 bg-lime-soft text-success"
                              >
                                Paid
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-peach/40 bg-peach-soft text-peach"
                              >
                                Pending
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Unrecorded
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSalaryModal(staff, salary)}
                                className="h-8 rounded-lg px-2.5 text-xs"
                              >
                                <Edit3 className="mr-1 h-3.5 w-3.5" />
                                {salary ? 'Edit' : 'Prepare'}
                              </Button>
                            )}
                            {canEdit && salary && salary.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMarkPaidModal(salary)}
                                className="h-8 rounded-lg border-lime/60 bg-lime-soft/70 px-2.5 text-xs font-medium text-foreground hover:bg-lime-soft"
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" />
                                Mark Paid
                              </Button>
                            )}
                            {salary && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPayslipRecord(salary)}
                                className="h-8 rounded-lg px-2.5 text-xs"
                                title="View printable payslip"
                              >
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                Payslip
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: STAFF DIRECTORY */}
        <TabsContent value="directory" className="space-y-4 sm:space-y-5">
          <div className="card-surface p-3.5 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search ID, name, mobile, NID, position..."
                  className="rounded-xl pl-9 text-xs sm:text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={handleExportStaffCSV} className="rounded-xl text-xs sm:text-sm">
                  <Download className="mr-1.5 h-4 w-4" />
                  Export PDF
                </Button>
                {canEdit && (
                  <Button onClick={openAddStaff} className="rounded-xl text-xs sm:text-sm">
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Add Staff
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>NID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Joining Date</TableHead>
                    <TableHead className="text-right">Basic Salary</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canEdit ? 10 : 9}
                        className="py-10 text-center text-muted-foreground"
                      >
                        No staff members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStaff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {member.code}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {member.name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {member.mobile}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {member.nid}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                          {member.address}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{member.position}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(member.joiningDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatBDT(member.basicSalary)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              member.active
                                ? 'border-lime/50 bg-lime-soft text-success'
                                : 'bg-secondary text-muted-foreground'
                            }
                          >
                            {member.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditStaff(member)}
                              className="h-8 rounded-lg px-2.5 text-xs"
                            >
                              <Edit3 className="mr-1 h-3.5 w-3.5" />
                              Edit
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
      </Tabs>

      {/* Add / Edit Staff Dialog */}
      <Dialog open={staffModalOpen} onOpenChange={setStaffModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
            <DialogDescription>
              Record employee details, NID, position, joining date, and monthly basic salary.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stf-code">Staff ID</Label>
                <Input
                  id="stf-code"
                  value={staffForm.code}
                  onChange={(e) => setStaffForm((f) => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stf-name">Full Name</Label>
                <Input
                  id="stf-name"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stf-mobile">Mobile</Label>
                <Input
                  id="stf-mobile"
                  value={staffForm.mobile}
                  onChange={(e) => setStaffForm((f) => ({ ...f, mobile: e.target.value }))}
                  placeholder="017XX-XXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stf-nid">NID Number</Label>
                <Input
                  id="stf-nid"
                  value={staffForm.nid}
                  onChange={(e) => setStaffForm((f) => ({ ...f, nid: e.target.value }))}
                  placeholder="10 or 17 digit NID"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stf-pos">Position</Label>
                <Input
                  id="stf-pos"
                  value={staffForm.position}
                  onChange={(e) => setStaffForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="e.g. Store Manager"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stf-join">Joining Date</Label>
                <Input
                  id="stf-join"
                  type="date"
                  value={staffForm.joiningDate}
                  onChange={(e) => setStaffForm((f) => ({ ...f, joiningDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stf-basic">Basic Salary (BDT)</Label>
                <Input
                  id="stf-basic"
                  type="number"
                  min={0}
                  value={staffForm.basicSalary}
                  onChange={(e) => setStaffForm((f) => ({ ...f, basicSalary: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stf-addr">Address</Label>
                <Input
                  id="stf-addr"
                  value={staffForm.address}
                  onChange={(e) => setStaffForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Area, City"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Active Employee</div>
                <div className="text-xs text-muted-foreground">
                  Active employees appear in daily attendance and monthly payroll.
                </div>
              </div>
              <Switch
                checked={staffForm.active}
                onCheckedChange={(checked) => setStaffForm((f) => ({ ...f, active: checked }))}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStaffModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingStaff ? 'Save Changes' : 'Add Staff'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Salary Dialog */}
      <Dialog open={salaryModalOpen} onOpenChange={setSalaryModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add / Edit Monthly Salary</DialogTitle>
            <DialogDescription>
              Net salary updates live as you enter earnings and deductions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSalary} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Staff Member</Label>
                <Select
                  value={salaryForm.staffId}
                  onValueChange={handleStaffChangeInSalaryModal}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sal-month">Month (YYYY-MM)</Label>
                <Input
                  id="sal-month"
                  type="month"
                  value={salaryForm.month}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, month: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sal-basic">Basic (+)</Label>
                <Input
                  id="sal-basic"
                  type="number"
                  min={0}
                  value={salaryForm.basic}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, basic: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sal-ot">Overtime (+)</Label>
                <Input
                  id="sal-ot"
                  type="number"
                  min={0}
                  value={salaryForm.overtime}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, overtime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sal-bonus">Bonus (+)</Label>
                <Input
                  id="sal-bonus"
                  type="number"
                  min={0}
                  value={salaryForm.bonus}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, bonus: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sal-adv">Advance (−)</Label>
                <Input
                  id="sal-adv"
                  type="number"
                  min={0}
                  value={salaryForm.advanceTaken}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, advanceTaken: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sal-ded">Deductions (−)</Label>
                <Input
                  id="sal-ded"
                  type="number"
                  min={0}
                  value={salaryForm.deductions}
                  onChange={(e) => setSalaryForm((f) => ({ ...f, deductions: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account</Label>
                <Select
                  value={salaryForm.account}
                  onValueChange={(v) =>
                    setSalaryForm((f) => ({ ...f, account: v as PaymentAccount }))
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

            {/* Live Net Salary Preview */}
            <div className="flex items-center justify-between rounded-xl border border-lime/50 bg-lime-soft/70 px-4 py-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Calculated Net Salary
                </div>
                <div className="text-xs text-muted-foreground">
                  Basic + Overtime + Bonus − Advance − Deductions
                </div>
              </div>
              <div className="text-xl font-bold tabular-nums text-foreground">
                {formatBDT(liveNetSalary)}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSalaryModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Save Salary
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog
        open={Boolean(payTarget)}
        onOpenChange={(open) => {
          if (!open) setPayTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mark Salary as Paid</DialogTitle>
            <DialogDescription>
              {payTarget
                ? `${staffById.get(payTarget.staffId)?.name ?? payTarget.staffId} — ${formatDate(payTarget.month)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {payTarget && (
            <form onSubmit={handleConfirmMarkPaid} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-lime-soft/70 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Net Salary Payable</span>
                <span className="text-lg font-bold text-success">
                  {formatBDT(payTarget.netSalary)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mark-paid-date">Payment Date</Label>
                  <Input
                    id="mark-paid-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Disbursement Account</Label>
                  <Select
                    value={payAccount}
                    onValueChange={(v) => setPayAccount(v as PaymentAccount)}
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

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayTarget(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button type="submit" className="rounded-xl">
                  Confirm Payment
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Printable Payslip Modal */}
      <Dialog
        open={Boolean(payslipRecord)}
        onOpenChange={(open) => {
          if (!open) setPayslipRecord(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Employee Payslip</DialogTitle>
            <DialogDescription>
              Official salary statement for {payslipRecord ? formatDate(payslipRecord.month) : ''}
            </DialogDescription>
          </DialogHeader>

          {payslipRecord && payslipStaff && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between border-b pb-3">
                  <div>
                    <div className="text-base font-bold text-foreground">
                      {state.company.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{state.company.address}</div>
                    <div className="text-xs text-muted-foreground">{state.company.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Payslip
                    </div>
                    <div className="font-semibold">{formatDate(payslipRecord.month)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Employee: </span>
                    <span className="font-medium text-foreground">{payslipStaff.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ID: </span>
                    <span className="font-mono font-medium">{payslipStaff.code}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Position: </span>
                    <span className="font-medium">{payslipStaff.position}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mobile: </span>
                    <span className="font-mono">{payslipStaff.mobile}</span>
                  </div>
                </div>

                <div className="space-y-1.5 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Basic Salary</span>
                    <span className="tabular-nums">{formatBDT(payslipRecord.basic)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overtime Pay</span>
                    <span className="tabular-nums">{formatBDT(payslipRecord.overtime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bonus</span>
                    <span className="tabular-nums">{formatBDT(payslipRecord.bonus)}</span>
                  </div>
                  <div className="flex justify-between text-peach">
                    <span>Advance Taken</span>
                    <span className="tabular-nums">−{formatBDT(payslipRecord.advanceTaken)}</span>
                  </div>
                  <div className="flex justify-between text-peach">
                    <span>Deductions</span>
                    <span className="tabular-nums">−{formatBDT(payslipRecord.deductions)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-lime-soft/70 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Net Payable Salary
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Status:{' '}
                      <span className="font-semibold capitalize text-foreground">
                        {payslipRecord.status}
                      </span>
                      {payslipRecord.paymentDate
                        ? ` • Paid on ${formatDate(payslipRecord.paymentDate)} (${payslipRecord.account})`
                        : ''}
                    </div>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {formatBDT(payslipRecord.netSalary)}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayslipRecord(null)}
                  className="rounded-xl"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.print();
                  }}
                  className="rounded-xl"
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  Print Payslip
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
