import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  Clock,
  Download,
  UserCheck,
  UserMinus,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { useErp } from '@/store/erp-store';
import { canMutate } from '@/lib/rbac';
import { exportToPDF, formatDate, todayISO } from '@/lib/format';
import type { AttendanceRecord } from '@/types/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AttendanceStatus = AttendanceRecord['status'];

export function AttendancePage() {
  const { state, markAttendance } = useErp();
  const canEdit = canMutate(state.currentRole, 'attendance');

  const defaultDate = useMemo(() => {
    if (state.attendance.length === 0) return todayISO();
    let latest = state.attendance[0]?.date ?? todayISO();
    for (const a of state.attendance) {
      if (a.date > latest) latest = a.date;
    }
    return latest;
  }, [state.attendance]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultDate);
  const selectedMonth = selectedDate.slice(0, 7);

  const activeStaff = useMemo(
    () => state.staff.filter((s) => s.active),
    [state.staff],
  );

  const dailyRecordByStaffId = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const a of state.attendance) {
      if (a.date === selectedDate) {
        map.set(a.staffId, a);
      }
    }
    return map;
  }, [state.attendance, selectedDate]);

  const monthlySummary = useMemo(() => {
    const stats = new Map<
      string,
      { present: number; absent: number; leave: number; overtimeHours: number }
    >();

    for (const st of activeStaff) {
      stats.set(st.id, { present: 0, absent: 0, leave: 0, overtimeHours: 0 });
    }

    for (const rec of state.attendance) {
      if (!rec.date.startsWith(selectedMonth)) continue;
      const cur = stats.get(rec.staffId) ?? {
        present: 0,
        absent: 0,
        leave: 0,
        overtimeHours: 0,
      };
      if (rec.status === 'present') cur.present += 1;
      else if (rec.status === 'absent') cur.absent += 1;
      else if (rec.status === 'leave') cur.leave += 1;
      cur.overtimeHours += rec.overtimeHours;
      stats.set(rec.staffId, cur);
    }

    return stats;
  }, [state.attendance, activeStaff, selectedMonth]);

  const kpis = useMemo(() => {
    let dayPresent = 0;
    let dayAbsent = 0;
    let dayLeave = 0;
    let dayOvertime = 0;

    for (const st of activeStaff) {
      const rec = dailyRecordByStaffId.get(st.id);
      if (!rec) continue;
      if (rec.status === 'present') dayPresent += 1;
      else if (rec.status === 'absent') dayAbsent += 1;
      else if (rec.status === 'leave') dayLeave += 1;
      dayOvertime += rec.overtimeHours;
    }

    let monthPresent = 0;
    let monthAbsent = 0;
    let monthLeave = 0;
    let monthOvertime = 0;
    for (const st of monthlySummary.values()) {
      monthPresent += st.present;
      monthAbsent += st.absent;
      monthLeave += st.leave;
      monthOvertime += st.overtimeHours;
    }

    return {
      dayPresent,
      dayAbsent,
      dayLeave,
      dayOvertime,
      monthPresent,
      monthAbsent,
      monthLeave,
      monthOvertime,
    };
  }, [activeStaff, dailyRecordByStaffId, monthlySummary]);

  const handleStatusToggle = (staffId: string, staffName: string, status: AttendanceStatus) => {
    if (!canEdit) return;
    const existing = dailyRecordByStaffId.get(staffId);
    const overtimeHours = status === 'present' ? (existing?.overtimeHours ?? 0) : 0;
    markAttendance({
      staffId,
      date: selectedDate,
      status,
      overtimeHours,
    });
    toast.success(`${staffName} marked ${status} for ${formatDate(selectedDate)}`);
  };

  const handleOvertimeChange = (staffId: string, staffName: string, rawValue: string) => {
    if (!canEdit) return;
    const hours = Math.max(0, Math.min(16, Number(rawValue) || 0));
    const existing = dailyRecordByStaffId.get(staffId);
    markAttendance({
      staffId,
      date: selectedDate,
      status: existing?.status ?? 'present',
      overtimeHours: hours,
    });
    toast.success(`Updated overtime for ${staffName} to ${hours}h`);
  };

  const handleMarkAllPresent = () => {
    if (!canEdit) return;
    for (const st of activeStaff) {
      const existing = dailyRecordByStaffId.get(st.id);
      markAttendance({
        staffId: st.id,
        date: selectedDate,
        status: 'present',
        overtimeHours: existing?.overtimeHours ?? 0,
      });
    }
    toast.success(`Marked all ${activeStaff.length} active staff Present for ${formatDate(selectedDate)}`);
  };

  const handleExportMonthlyCSV = () => {
    const headers = [
      'Staff ID',
      'Name',
      'Position',
      'Month',
      'Present Days',
      'Absent Days',
      'Leave Days',
      'Total Overtime (Hours)',
    ];
    const rows = activeStaff.map((st) => {
      const s = monthlySummary.get(st.id) ?? {
        present: 0,
        absent: 0,
        leave: 0,
        overtimeHours: 0,
      };
      return [
        st.code,
        st.name,
        st.position,
        selectedMonth,
        s.present,
        s.absent,
        s.leave,
        s.overtimeHours,
      ];
    });
    exportToPDF({
      filename: `attendance-summary-${selectedMonth}`,
      title: `Monthly Staff Attendance Summary — ${formatDate(selectedMonth)}`,
      subtitle: `Active staff attendance & overtime register`,
      headers,
      rows,
      company: state.company,
      summary: [
        { label: 'Month Present Days', value: String(kpis.monthPresent), tone: 'success' },
        { label: 'Month Absent Days', value: String(kpis.monthAbsent), tone: kpis.monthAbsent > 0 ? 'danger' : 'success' },
        { label: 'Month Leave Days', value: String(kpis.monthLeave) },
        { label: 'Total Overtime', value: `${kpis.monthOvertime}h` },
      ],
      orientation: 'portrait',
    });
    toast.success(`Opened Attendance PDF for ${formatDate(selectedMonth)}`);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            Staff Attendance
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Daily attendance register, overtime tracking, and monthly summaries for active staff.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-xs">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="bg-transparent text-xs sm:text-sm font-medium text-foreground focus:outline-none"
            />
          </div>
          {canEdit && (
            <Button
              onClick={handleMarkAllPresent}
              className="rounded-xl text-xs sm:text-sm"
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark All Present
            </Button>
          )}
          <Button variant="outline" onClick={handleExportMonthlyCSV} className="rounded-xl text-xs sm:text-sm">
            <Download className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Present ({formatDate(selectedDate)})
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-success">
            {kpis.dayPresent}
            <span className="ml-1 text-xs sm:text-sm font-normal text-muted-foreground">
              / {activeStaff.length}
            </span>
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Absent ({formatDate(selectedDate)})
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-peach-soft text-peach">
              <UserX className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate text-peach">
            {kpis.dayAbsent}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              On Leave ({formatDate(selectedDate)})
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <UserMinus className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {kpis.dayLeave}
          </div>
        </div>

        <div className="card-surface p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Overtime Hours
            </span>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-success">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate">
            {kpis.dayOvertime}h
          </div>
        </div>
      </div>

      {/* Interactive Daily Attendance Table */}
      <div className="card-surface p-3.5 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 shrink-0 text-success" />
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              Daily Register — {formatDate(selectedDate)}
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Staff Member</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Attendance Status</TableHead>
                <TableHead className="w-[160px] text-right">Overtime (Hours)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No active staff members found.
                  </TableCell>
                </TableRow>
              ) : (
                activeStaff.map((member) => {
                  const rec = dailyRecordByStaffId.get(member.id);
                  const currentStatus = rec?.status ?? null;
                  const overtime = rec?.overtimeHours ?? 0;

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {member.code}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {member.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {member.position}
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex rounded-xl bg-secondary p-1 gap-1">
                          {(
                            [
                              {
                                value: 'present',
                                label: 'Present',
                                activeClass: 'bg-lime-soft text-success shadow-xs font-semibold',
                              },
                              {
                                value: 'absent',
                                label: 'Absent',
                                activeClass: 'bg-peach-soft text-peach shadow-xs font-semibold',
                              },
                              {
                                value: 'leave',
                                label: 'Leave',
                                activeClass: 'bg-card text-foreground shadow-xs font-semibold',
                              },
                            ] as const
                          ).map((opt) => {
                            const isActive = currentStatus === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  handleStatusToggle(member.id, member.name, opt.value)
                                }
                                className={`cursor-pointer rounded-lg px-2.5 sm:px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isActive
                                    ? opt.activeClass
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={16}
                          step={0.5}
                          disabled={!canEdit || currentStatus === 'absent' || currentStatus === 'leave'}
                          value={overtime}
                          onChange={(e) =>
                            handleOvertimeChange(member.id, member.name, e.target.value)
                          }
                          className="ml-auto h-8 w-24 rounded-lg text-right tabular-nums"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Monthly Attendance Summary Table */}
      <div className="card-surface p-3.5 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              Monthly Attendance Summary — {formatDate(selectedMonth)}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportMonthlyCSV} className="w-fit rounded-xl text-xs sm:text-sm">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export Monthly PDF
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Staff Member</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Present Days</TableHead>
                <TableHead className="text-right">Absent Days</TableHead>
                <TableHead className="text-right">Leave Days</TableHead>
                <TableHead className="text-right">Total Overtime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeStaff.map((member) => {
                const s = monthlySummary.get(member.id) ?? {
                  present: 0,
                  absent: 0,
                  leave: 0,
                  overtimeHours: 0,
                };
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {member.code}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {member.name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {member.position}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge
                        variant="outline"
                        className="border-lime/50 bg-lime-soft text-success"
                      >
                        {s.present}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.absent > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-peach/40 bg-peach-soft text-peach"
                        >
                          {s.absent}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.leave}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {s.overtimeHours}h
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
