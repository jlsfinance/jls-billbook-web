import { collection, doc, getDocFromServer, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type AccountantPacket = {
  id: string;
  email: string;
  company: string;
  from: string;
  to: string;
  expiresAt: Timestamp;
};

const PACKETS = 'accountant_packets';
const FILES = 'accountant_packet_files';
const MAX_CONTENT = 500_000;

export function watchAccountantPackets(companyId: string, update: (packets: AccountantPacket[]) => void, error: () => void) {
  return onSnapshot(collection(db, 'companies', companyId, PACKETS), snapshot => {
    update(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as AccountantPacket))
      .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis()));
  }, error);
}

export async function shareAccountantPacket(companyId: string, packet: Omit<AccountantPacket, 'id' | 'expiresAt'>, content: string) {
  if (!content || content.length > MAX_CONTENT) throw new Error('The workbook is too large to share by link. Select a shorter date range.');
  const metadata = doc(collection(db, 'companies', companyId, PACKETS));
  const batch = writeBatch(db);
  batch.set(metadata, { ...packet, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
  batch.set(doc(db, 'companies', companyId, FILES, metadata.id), { content });
  await batch.commit();
  return new URL(`/accountant/${encodeURIComponent(companyId)}/${metadata.id}`, location.origin).href;
}

export function revokeAccountantPacket(companyId: string, packetId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'companies', companyId, PACKETS, packetId));
  batch.delete(doc(db, 'companies', companyId, FILES, packetId));
  return batch.commit();
}

export async function getAccountantPacket(companyId: string, packetId: string) {
  const metadata = await getDocFromServer(doc(db, 'companies', companyId, PACKETS, packetId));
  if (!metadata.exists()) throw new Error('This workbook link is unavailable.');
  return { ...metadata.data(), id: metadata.id } as AccountantPacket;
}

export async function downloadAccountantPacket(companyId: string, packetId: string, filename: string) {
  const file = await getDocFromServer(doc(db, 'companies', companyId, FILES, packetId));
  const content = file.data()?.content;
  if (typeof content !== 'string' || !content || content.length > MAX_CONTENT) throw new Error('This workbook is unavailable.');
  const bytes = Uint8Array.from(atob(content), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
