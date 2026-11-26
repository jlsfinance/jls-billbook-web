import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CompanyProfile } from '../types';

const RECORDS = ['customers', 'products', 'invoices', 'purchases', 'payments', 'expenses', 'bank_accounts', 'stock_entries'];
export const EXISTING_BOOKS_ID = 'default';

export async function hasBookRecords(userId: string, companyId?: string) {
  const path = companyId ? [userId, 'companies', companyId] : [userId];
  const results = await Promise.allSettled(RECORDS.map(name => getDocs(query(collection(db, 'users', ...path, name), limit(1)))));
  if (results.some(result => result.status === 'fulfilled' && !result.value.empty)) return true;
  return results.every(result => result.status === 'fulfilled') ? false : undefined;
}

export async function loadExistingProfile(userId: string) {
  const snapshots = await getDocs(query(collection(db, 'users', userId, 'company'), limit(1)));
  return snapshots.docs[0]?.data() as Partial<CompanyProfile> | undefined;
}

export async function pickBookWorkspace<T extends { id: string; isLegacy?: boolean }>(
  companies: T[],
  preferred: string | null,
  previous: string | null,
  hasScopedRecords: (companyId: string) => Promise<boolean | undefined>,
): Promise<T | null> {
  const selected = companies.find(company => company.id === preferred);
  if (selected) return selected;
  const current = companies.find(company => company.id === previous) ?? companies[0];
  const existing = companies.find(company => company.isLegacy);
  if (!current || !existing || current.id === existing.id) return current ?? existing ?? null;
  return (await hasScopedRecords(current.id)) === false ? existing : current;
}
