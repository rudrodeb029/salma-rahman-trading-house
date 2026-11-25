import type { PageId, Role } from '@/types/erp';

export interface RoleMeta {
  role: Role;
  label: string;
  shortLabel: string;
  description: string;
  badgeColor: string;
}

const OWNER_PAGES: PageId[] = [
  'dashboard',
  'notifications',
  'products',
  'stock',
  'sales',
  'purchases',
  'returns',
  'expenses',
  'cash-bank',
  'customers',
  'suppliers',
  'staff',
  'attendance',
  'owner-loans',
  'reports',
  'settings',
];

const MANAGER_PAGES: PageId[] = [
  'dashboard',
  'notifications',
  'products',
  'stock',
  'sales',
  'purchases',
  'returns',
  'expenses',
  'customers',
  'suppliers',
  'reports',
];

const SALESPERSON_PAGES: PageId[] = [
  'dashboard',
  'notifications',
  'sales',
  'stock',
  'products',
];

const ROLE_PAGES: Record<Role, PageId[]> = {
  owner: OWNER_PAGES,
  manager: MANAGER_PAGES,
  salesperson: SALESPERSON_PAGES,
};

const MANAGER_MUTABLE_MODULES = new Set<string>([
  'sales',
  'purchases',
  'stock',
  'products',
  'returns',
  'damages',
  'expenses',
  'customers',
  'suppliers',
  'notifications',
]);

const SALESPERSON_MUTABLE_MODULES = new Set<string>(['sales', 'notifications']);

const ROLE_META_MAP: Record<Role, RoleMeta> = {
  owner: {
    role: 'owner',
    label: 'Owner (Admin)',
    shortLabel: 'Owner',
    description: 'Full access to all modules, profit & loss, cash/bank, staff salaries, loans, and company setup.',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  manager: {
    role: 'manager',
    label: 'Branch Manager',
    shortLabel: 'Manager',
    description: 'Manages sales, purchases, stock, returns, expenses, customers, suppliers, and operational reports (no profit figures).',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  salesperson: {
    role: 'salesperson',
    label: 'Salesperson',
    shortLabel: 'Sales',
    description: 'Creates sales invoices and checks live stock & product catalog (read-only stock, no profit or cost reports).',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

export function getAllowedPages(role: Role): PageId[] {
  return [...ROLE_PAGES[role]];
}

export function canAccessPage(role: Role, page: PageId): boolean {
  return ROLE_PAGES[role].includes(page);
}

export function canViewProfit(role: Role): boolean {
  return role === 'owner';
}

export function canMutate(role: Role, module: string): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return MANAGER_MUTABLE_MODULES.has(module);
  if (role === 'salesperson') return SALESPERSON_MUTABLE_MODULES.has(module);
  return false;
}

export function getRoleMeta(role: Role): RoleMeta {
  return ROLE_META_MAP[role];
}
