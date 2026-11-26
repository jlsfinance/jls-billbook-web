import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { revokeAccountantPacket, shareAccountantPacket, watchAccountantPackets } from '../services/accountantSharing';
import type { AccountantPacket } from '../services/accountantSharing';
import { StorageService } from '../services/storageService';

type Props = { from: string; to: string; workbook: () => string };

function PacketManager({ company, companyId, from, to, workbook }: Props & { company: string; companyId: string }) {
  const [email, setEmail] = useState('');
  const [packets, setPackets] = useState<AccountantPacket[]>([]);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState('');

  useEffect(() => watchAccountantPackets(companyId, setPackets, () => setError('Could not load accountant links.')), [companyId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (StorageService.getCompanyId() !== companyId) {
      setError('Wait for this company’s records to load and try again.');
      return;
    }
    if (!from || !to || from > to) { setError('Choose a valid export period.'); return; }
    setError('');
    setBusy(true);
    setLink('');
    try {
      setLink(await shareAccountantPacket(companyId, { company, email: email.trim(), from, to }, workbook()));
      setEmail('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError('');
    try {
      await revokeAccountantPacket(companyId, revokeId);
      if (link.endsWith(`/${revokeId}`)) setLink('');
      setRevokeId('');
    } catch {
      setError('Could not revoke the link.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-2xl border bg-card p-5">
    <div>
      <h2 className="text-lg font-semibold">Share with accountant</h2>
      <p className="text-sm text-muted-foreground">Share the selected period with one verified sign-in email for seven days.</p>
    </div>
    <form onSubmit={create} className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Accountant’s sign-in email
        <input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className="rounded-lg border bg-background p-2.5" />
      </label>
      <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Create link</button>
    </form>
    {link && <label className="grid gap-1 text-sm font-medium">Accountant link
      <input readOnly value={link} onFocus={event => event.target.select()} className="rounded-lg border bg-background p-2.5" />
    </label>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {packets.length > 0 && <ul className="divide-y">
      {packets.map(packet => (
        <li key={packet.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div className="min-w-0"><p className="break-all font-medium">{packet.email}</p><p className="text-xs text-muted-foreground">{packet.from} to {packet.to} · expires {packet.expiresAt.toDate().toLocaleDateString('en-IN')}</p></div>
          {revokeId === packet.id ? <div className="flex gap-2">
            <button type="button" onClick={() => setRevokeId('')} className="rounded-lg border px-2.5 py-1.5">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void revoke()} className="rounded-lg border px-2.5 py-1.5 text-red-600">Confirm revoke</button>
          </div> : <button type="button" onClick={() => setRevokeId(packet.id)} className="rounded-lg border px-2.5 py-1.5">Revoke</button>}
        </li>
      ))}
    </ul>}
  </section>;
}

export default function AccountantPacketManager(props: Props) {
  const { user, isDemo } = useAuth();
  const { company } = useCompany();
  if (!company || !user || isDemo || company.isLegacy || company.owner_uid !== user.uid) return null;
  return <PacketManager key={company.id} company={company.name} companyId={company.id} {...props} />;
}
