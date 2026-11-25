import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSeedState } from '@/data/seed';
import {
  calcAlerts,
  calcCashLedger,
  calcFinancialSummary,
  calcNetSalary,
  calcPartyAccount,
  calcProductStock,
} from '@/lib/calculations';
import type {
  AlertItem,
  AttendanceRecord,
  CashEntry,
  CashLedgerSummary,
  CompanySetup,
  DamageEntry,
  ErpState,
  Expense,
  FinancialSummary,
  Loan,
  LoanInstallment,
  OtherIncome,
  OwnerTransaction,
  Party,
  PartyAccountSummary,
  PartyPayment,
  PaymentAccount,
  Product,
  ProductStockSummary,
  Purchase,
  ReturnEntry,
  Role,
  Sale,
  SalaryRecord,
  StaffMember,
} from '@/types/erp';

const STORAGE_KEY = 'srth_erp_v1';

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface ErpContextValue {
  state: ErpState;
  hydrated: boolean;
  // Derived selectors
  financialSummary: FinancialSummary;
  cashLedger: CashLedgerSummary;
  alerts: AlertItem[];
  unreadAlertCount: number;
  stockByProductId: Record<string, ProductStockSummary>;
  partyAccountsById: Record<string, PartyAccountSummary>;
  // Actions
  updateCompany: (patch: Partial<CompanySetup>) => void;
  setRole: (role: Role) => void;
  addProduct: (input: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => void;
  deleteProduct: (id: string) => void;
  addPurchase: (input: Omit<Purchase, 'id'>) => Purchase;
  deletePurchase: (id: string) => void;
  addSale: (input: Omit<Sale, 'id'>) => Sale;
  deleteSale: (id: string) => void;
  addReturn: (input: Omit<ReturnEntry, 'id'>) => ReturnEntry;
  addDamage: (input: Omit<DamageEntry, 'id'>) => DamageEntry;
  addExpense: (input: Omit<Expense, 'id'>) => Expense;
  deleteExpense: (id: string) => void;
  addOtherIncome: (input: Omit<OtherIncome, 'id'>) => OtherIncome;
  addManualCashEntry: (input: Omit<CashEntry, 'id'>) => CashEntry;
  addParty: (input: Omit<Party, 'id'>) => Party;
  updateParty: (id: string, patch: Partial<Omit<Party, 'id'>>) => void;
  recordPartyPayment: (input: Omit<PartyPayment, 'id'>) => PartyPayment;
  addStaff: (input: Omit<StaffMember, 'id'>) => StaffMember;
  updateStaff: (id: string, patch: Partial<Omit<StaffMember, 'id'>>) => void;
  markAttendance: (input: Omit<AttendanceRecord, 'id'>) => AttendanceRecord;
  upsertSalary: (input: Omit<SalaryRecord, 'id' | 'netSalary'> & { id?: string | undefined }) => SalaryRecord;
  markSalaryPaid: (salaryId: string, paymentDate: string, account?: PaymentAccount) => void;
  addOwnerTransaction: (input: Omit<OwnerTransaction, 'id'>) => OwnerTransaction;
  addLoan: (input: Omit<Loan, 'id'>) => Loan;
  addLoanInstallment: (input: Omit<LoanInstallment, 'id'>) => LoanInstallment;
  markNotificationRead: (alertId: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export function ErpProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ErpState>(() => createSeedState());
  const [hydrated, setHydrated] = useState(false);
  const skipNextSaveRef = useRef(true);

  // Hydrate safely on client only
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ErpState>;
        if (parsed && typeof parsed === 'object' && parsed.company && Array.isArray(parsed.products)) {
          const seed = createSeedState();
          const mergedCompany = { ...seed.company, ...parsed.company };
          if (mergedCompany.name === 'Salma Rahman Trading House') {
            mergedCompany.name = seed.company.name;
          }
          if (mergedCompany.tagline === 'Wholesale & Retail Garments Trading House') {
            mergedCompany.tagline = seed.company.tagline;
          }
          if (!mergedCompany.logoDataUrl) {
            mergedCompany.logoDataUrl = seed.company.logoDataUrl;
          }
          setState({
            ...seed,
            ...parsed,
            company: mergedCompany,
          });
        }
      }
    } catch {
      // Ignore corrupt localStorage and fall back to seed state
    } finally {
      skipNextSaveRef.current = false;
      setHydrated(true);
    }
  }, []);

  // Persist changes to localStorage on client
  useEffect(() => {
    if (!hydrated || skipNextSaveRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state, hydrated]);

  const updateCompany = useCallback((patch: Partial<CompanySetup>) => {
    setState((prev) => ({
      ...prev,
      company: { ...prev.company, ...patch },
    }));
  }, []);

  const setRole = useCallback((role: Role) => {
    setState((prev) => ({ ...prev, currentRole: role }));
  }, []);

  const addProduct = useCallback((input: Omit<Product, 'id'>): Product => {
    const created: Product = { ...input, id: createId('prod') };
    setState((prev) => ({ ...prev, products: [created, ...prev.products] }));
    return created;
  }, []);

  const updateProduct = useCallback((id: string, patch: Partial<Omit<Product, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
    }));
  }, []);

  const addPurchase = useCallback((input: Omit<Purchase, 'id'>): Purchase => {
    const created: Purchase = { ...input, id: createId('pur') };
    setState((prev) => ({ ...prev, purchases: [created, ...prev.purchases] }));
    return created;
  }, []);

  const deletePurchase = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      purchases: prev.purchases.filter((p) => p.id !== id),
    }));
  }, []);

  const addSale = useCallback((input: Omit<Sale, 'id'>): Sale => {
    const created: Sale = { ...input, id: createId('sal') };
    setState((prev) => ({ ...prev, sales: [created, ...prev.sales] }));
    return created;
  }, []);

  const deleteSale = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      sales: prev.sales.filter((s) => s.id !== id),
    }));
  }, []);

  const addReturn = useCallback((input: Omit<ReturnEntry, 'id'>): ReturnEntry => {
    const created: ReturnEntry = { ...input, id: createId('ret') };
    setState((prev) => ({ ...prev, returns: [created, ...prev.returns] }));
    return created;
  }, []);

  const addDamage = useCallback((input: Omit<DamageEntry, 'id'>): DamageEntry => {
    const created: DamageEntry = { ...input, id: createId('dmg') };
    setState((prev) => ({ ...prev, damages: [created, ...prev.damages] }));
    return created;
  }, []);

  const addExpense = useCallback((input: Omit<Expense, 'id'>): Expense => {
    const created: Expense = { ...input, id: createId('exp') };
    setState((prev) => ({ ...prev, expenses: [created, ...prev.expenses] }));
    return created;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }));
  }, []);

  const addOtherIncome = useCallback((input: Omit<OtherIncome, 'id'>): OtherIncome => {
    const created: OtherIncome = { ...input, id: createId('inc') };
    setState((prev) => ({ ...prev, otherIncomes: [created, ...prev.otherIncomes] }));
    return created;
  }, []);

  const addManualCashEntry = useCallback((input: Omit<CashEntry, 'id'>): CashEntry => {
    const created: CashEntry = { ...input, id: createId('ce') };
    setState((prev) => ({ ...prev, cashEntries: [created, ...prev.cashEntries] }));
    return created;
  }, []);

  const addParty = useCallback((input: Omit<Party, 'id'>): Party => {
    const created: Party = {
      ...input,
      id: createId(input.type === 'customer' ? 'cust' : 'sup'),
    };
    setState((prev) => ({ ...prev, parties: [created, ...prev.parties] }));
    return created;
  }, []);

  const updateParty = useCallback((id: string, patch: Partial<Omit<Party, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      parties: prev.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const recordPartyPayment = useCallback((input: Omit<PartyPayment, 'id'>): PartyPayment => {
    const created: PartyPayment = { ...input, id: createId('pp') };
    setState((prev) => ({ ...prev, partyPayments: [created, ...prev.partyPayments] }));
    return created;
  }, []);

  const addStaff = useCallback((input: Omit<StaffMember, 'id'>): StaffMember => {
    const created: StaffMember = { ...input, id: createId('stf') };
    setState((prev) => ({ ...prev, staff: [...prev.staff, created] }));
    return created;
  }, []);

  const updateStaff = useCallback((id: string, patch: Partial<Omit<StaffMember, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      staff: prev.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const markAttendance = useCallback((input: Omit<AttendanceRecord, 'id'>): AttendanceRecord => {
    const record: AttendanceRecord = { ...input, id: createId('att') };
    setState((prev) => {
      const existingIdx = prev.attendance.findIndex(
        (a) => a.staffId === input.staffId && a.date === input.date,
      );
      if (existingIdx >= 0) {
        const existing = prev.attendance[existingIdx];
        const updated = [...prev.attendance];
        updated[existingIdx] = { ...record, id: existing?.id ?? record.id };
        return { ...prev, attendance: updated };
      }
      return { ...prev, attendance: [record, ...prev.attendance] };
    });
    return record;
  }, []);

  const upsertSalary = useCallback(
    (input: Omit<SalaryRecord, 'id' | 'netSalary'> & { id?: string | undefined }): SalaryRecord => {
      const netSalary = calcNetSalary({
        basic: input.basic,
        overtime: input.overtime,
        bonus: input.bonus,
        advanceTaken: input.advanceTaken,
        deductions: input.deductions,
      });
      const record: SalaryRecord = {
        ...input,
        id: input.id ?? createId('salr'),
        netSalary,
      };
      setState((prev) => {
        const idx = prev.salaries.findIndex(
          (s) =>
            (input.id && s.id === input.id) ||
            (s.staffId === input.staffId && s.month === input.month),
        );
        if (idx >= 0) {
          const existing = prev.salaries[idx];
          const updated = [...prev.salaries];
          updated[idx] = { ...record, id: existing?.id ?? record.id };
          return { ...prev, salaries: updated };
        }
        return { ...prev, salaries: [record, ...prev.salaries] };
      });
      return record;
    },
    [],
  );

  const markSalaryPaid = useCallback(
    (salaryId: string, paymentDate: string, account?: PaymentAccount) => {
      setState((prev) => ({
        ...prev,
        salaries: prev.salaries.map((s) =>
          s.id === salaryId
            ? {
                ...s,
                status: 'paid',
                paymentDate,
                account: account ?? s.account,
              }
            : s,
        ),
      }));
    },
    [],
  );

  const addOwnerTransaction = useCallback(
    (input: Omit<OwnerTransaction, 'id'>): OwnerTransaction => {
      const created: OwnerTransaction = { ...input, id: createId('ot') };
      setState((prev) => ({
        ...prev,
        ownerTransactions: [created, ...prev.ownerTransactions],
      }));
      return created;
    },
    [],
  );

  const addLoan = useCallback((input: Omit<Loan, 'id'>): Loan => {
    const created: Loan = { ...input, id: createId('loan') };
    setState((prev) => ({ ...prev, loans: [created, ...prev.loans] }));
    return created;
  }, []);

  const addLoanInstallment = useCallback(
    (input: Omit<LoanInstallment, 'id'>): LoanInstallment => {
      const created: LoanInstallment = { ...input, id: createId('li') };
      setState((prev) => ({
        ...prev,
        loanInstallments: [created, ...prev.loanInstallments],
      }));
      return created;
    },
    [],
  );

  const markNotificationRead = useCallback((alertId: string) => {
    setState((prev) => {
      if (prev.readNotificationIds.includes(alertId)) return prev;
      return {
        ...prev,
        readNotificationIds: [...prev.readNotificationIds, alertId],
      };
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => {
      const allIds = calcAlerts(prev).map((a) => a.id);
      const merged = Array.from(new Set([...prev.readNotificationIds, ...allIds]));
      return { ...prev, readNotificationIds: merged };
    });
  }, []);

  const resetDemoData = useCallback(() => {
    const fresh = createSeedState();
    setState(fresh);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const financialSummary = useMemo(() => calcFinancialSummary(state), [state]);
  const cashLedger = useMemo(() => calcCashLedger(state), [state]);
  const alerts = useMemo(() => calcAlerts(state), [state]);
  const unreadAlertCount = useMemo(
    () => alerts.filter((a) => !a.read).length,
    [alerts],
  );

  const stockByProductId = useMemo(() => {
    const map: Record<string, ProductStockSummary> = {};
    for (const product of state.products) {
      map[product.id] = calcProductStock(
        product,
        state.purchases,
        state.sales,
        state.returns,
        state.damages,
      );
    }
    return map;
  }, [state.products, state.purchases, state.sales, state.returns, state.damages]);

  const partyAccountsById = useMemo(() => {
    const map: Record<string, PartyAccountSummary> = {};
    for (const party of state.parties) {
      map[party.id] = calcPartyAccount(party, state);
    }
    return map;
  }, [state]);

  const value = useMemo<ErpContextValue>(
    () => ({
      state,
      hydrated,
      financialSummary,
      cashLedger,
      alerts,
      unreadAlertCount,
      stockByProductId,
      partyAccountsById,
      updateCompany,
      setRole,
      addProduct,
      updateProduct,
      deleteProduct,
      addPurchase,
      deletePurchase,
      addSale,
      deleteSale,
      addReturn,
      addDamage,
      addExpense,
      deleteExpense,
      addOtherIncome,
      addManualCashEntry,
      addParty,
      updateParty,
      recordPartyPayment,
      addStaff,
      updateStaff,
      markAttendance,
      upsertSalary,
      markSalaryPaid,
      addOwnerTransaction,
      addLoan,
      addLoanInstallment,
      markNotificationRead,
      markAllNotificationsRead,
      resetDemoData,
    }),
    [
      state,
      hydrated,
      financialSummary,
      cashLedger,
      alerts,
      unreadAlertCount,
      stockByProductId,
      partyAccountsById,
      updateCompany,
      setRole,
      addProduct,
      updateProduct,
      deleteProduct,
      addPurchase,
      deletePurchase,
      addSale,
      deleteSale,
      addReturn,
      addDamage,
      addExpense,
      deleteExpense,
      addOtherIncome,
      addManualCashEntry,
      addParty,
      updateParty,
      recordPartyPayment,
      addStaff,
      updateStaff,
      markAttendance,
      upsertSalary,
      markSalaryPaid,
      addOwnerTransaction,
      addLoan,
      addLoanInstallment,
      markNotificationRead,
      markAllNotificationsRead,
      resetDemoData,
    ],
  );

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
}

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) {
    throw new Error('useErp must be used within an ErpProvider');
  }
  return ctx;
}
