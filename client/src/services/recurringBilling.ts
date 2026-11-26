import type { AutomatedBill } from '../types';

export function currentBillingDate(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

export function parseBillingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function addBillingDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function nextBillingDate(date: Date, frequency: AutomatedBill['frequency'], anchorDay: number) {
  if (frequency === 'WEEKLY') return addBillingDays(date, 7);

  const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
  const step = months[frequency];
  if (!Number.isInteger(step)) return null;
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + step);
  const endOfMonth = new Date(result);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(anchorDay, endOfMonth.getUTCDate()));
  return result.toISOString().slice(0, 10);
}
