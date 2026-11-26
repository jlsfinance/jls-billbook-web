import { collection, doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

type Scope = { userId: string; companyId: string; demo: boolean };
type LoyaltyEntry = { kind: 'loyalty'; partyId: string; points: number; note: string };
type Referral = { kind: 'referral'; partyId: string; referredPartyId: string; status: 'Pending' | 'Rewarded' };
type Campaign = { kind: 'campaign'; title: string; message: string };
type Entry = LoyaltyEntry | Referral | Campaign;
export type EngagementRecord = Entry & { id: string; createdAt: string };

function companyPath(scope: Scope) {
  return ['users', scope.userId, 'companies', scope.companyId] as const;
}

function localKey(scope: Scope) {
  return `jls-engagement:${scope.userId}:${scope.companyId}`;
}

function readDemo(scope: Scope): EngagementRecord[] {
  return JSON.parse(localStorage.getItem(localKey(scope)) ?? '[]') as EngagementRecord[];
}

export function watchEngagement(
  scope: Scope,
  onRecords: (records: EngagementRecord[]) => void,
  onError: () => void,
) {
  if (scope.demo) {
    try {
      onRecords(readDemo(scope));
    } catch {
      onError();
    }
    return () => {};
  }
  return onSnapshot(collection(db, ...companyPath(scope), 'engagement_records'), snapshot => {
    onRecords(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as EngagementRecord)));
  }, onError);
}

export async function saveEngagement(
  scope: Scope,
  entry: Entry,
  existing?: { id: string; createdAt: string },
) {
  const id = entry.kind === 'referral' ? `referral-${entry.referredPartyId}` : crypto.randomUUID();
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const record: EngagementRecord = { ...entry, id, createdAt };

  if (scope.demo) {
    const records = readDemo(scope);
    if (entry.kind === 'loyalty') {
      const balance = records.reduce((sum, item) => item.kind === 'loyalty' && item.partyId === entry.partyId ? sum + item.points : sum, 0);
      if (balance + entry.points < 0) throw new Error('This party does not have enough points.');
      if (!Number.isSafeInteger(balance + entry.points)) throw new Error('The resulting points balance is too large.');
    }
    if (entry.kind === 'referral' && !existing && records.some(item => item.id === id)) {
      throw new Error('A referral for this customer is already recorded.');
    }
    const next = [...records.filter(item => item.id !== id), record];
    localStorage.setItem(localKey(scope), JSON.stringify(next));
    return next;
  }

  const ref = doc(db, ...companyPath(scope), 'engagement_records', id);
  if (entry.kind === 'campaign' || existing) {
    await setDoc(ref, record);
    return;
  }

  if (entry.kind === 'referral') {
    await runTransaction(db, async transaction => {
      if ((await transaction.get(ref)).exists()) throw new Error('A referral for this customer is already recorded.');
      transaction.set(ref, record);
    });
    return;
  }

  const balanceRef = doc(db, ...companyPath(scope), 'loyalty_balances', entry.partyId);
  await runTransaction(db, async transaction => {
    const balanceDoc = await transaction.get(balanceRef);
    const balance = Number(balanceDoc.data()?.points ?? 0) + entry.points;
    if (balance < 0) throw new Error('This party does not have enough points.');
    if (!Number.isSafeInteger(balance)) throw new Error('The resulting points balance is too large.');
    transaction.set(balanceRef, { points: balance });
    transaction.set(ref, record);
  });
}
