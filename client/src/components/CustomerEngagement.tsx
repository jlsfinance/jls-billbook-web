import { WorkspaceHeading, workspace } from './WorkspaceUI';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { StorageService } from '../services/storageService';
import { saveEngagement, watchEngagement } from '../services/engagementService';
import type { EngagementRecord } from '../services/engagementService';

type Tab = 'Loyalty' | 'Referrals' | 'Campaigns';
const tabs: Tab[] = ['Loyalty', 'Referrals', 'Campaigns'];
const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-sm';
const primary = 'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const panel = 'space-y-4 rounded-2xl border bg-card p-5';
const greetingTemplates = [
  { title: 'Birthday greeting', message: 'Happy birthday, {name}! Wishing you a wonderful year ahead. — {business}' },
  { title: 'Festival greeting', message: 'Hello {name}, wishing you and your family a joyful festive season. — {business}' },
  { title: 'Thank you', message: 'Thank you, {name}, for shopping with {business}. We appreciate your support.' },
];

function whatsappPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && !raw.trim().startsWith('+')) return `91${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : '';
}

function EngagementWorkspace({ scope, onBack }: {
  scope: Parameters<typeof watchEngagement>[0];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('Loyalty');
  const [records, setRecords] = useState<EngagementRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [partyId, setPartyId] = useState('');
  const [referredPartyId, setReferredPartyId] = useState('');
  const [points, setPoints] = useState('');
  const [redeem, setRedeem] = useState(false);
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [consent, setConsent] = useState(false);
  const { userId, companyId, demo } = scope;

  useEffect(() => watchEngagement({ userId, companyId, demo }, next => {
    setRecords(next);
    setReady(true);
    setLoadError(false);
  }, () => setLoadError(true)), [userId, companyId, demo]);

  const parties = StorageService.getCustomers().filter(party => party.type !== 'VENDOR');
  const partyNames = new Map(parties.map(party => [party.id, party.name]));
  const history = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pointsHistory = history.filter((record): record is Extract<EngagementRecord, { kind: 'loyalty' }> =>
    record.kind === 'loyalty' && record.partyId === partyId,
  );
  const balance = pointsHistory.reduce((total, record) => total + record.points, 0);
  const referrals = history.filter(record => record.kind === 'referral');
  const campaigns = history.filter(record => record.kind === 'campaign');
  const campaign = campaigns.find(record => record.id === campaignId);
  const recipient = parties.find(party => party.id === recipientId);
  const phone = whatsappPhone(recipient?.phone || '');
  const companyName = StorageService.getCompanyProfile().name;
  const partyOptions = parties.map(party => <option key={party.id} value={party.id}>{party.name}</option>);

  async function save(...args: Parameters<typeof saveEngagement>) {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const next = await saveEngagement(...args);
      if (next) setRecords(next);
      setStatus('Saved.');
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The change could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    if (tab === 'Loyalty') {
      const amount = Number(points);
      if (!partyNames.has(partyId) || !Number.isSafeInteger(amount) || amount <= 0 || !note.trim()) {
        setError('Choose a customer and enter whole points and a note.');
        return;
      }
      if (await save(scope, { kind: 'loyalty', partyId, points: redeem ? -amount : amount, note: note.trim() })) {
        setPoints('');
        setNote('');
      }
    } else if (tab === 'Referrals') {
      if (!partyNames.has(partyId) || !partyNames.has(referredPartyId) || partyId === referredPartyId) {
        setError('Choose two different customers.');
        return;
      }
      if (referrals.some(record => record.referredPartyId === referredPartyId)) {
        setError('A referral for this customer is already recorded.');
        return;
      }
      if (await save(scope, { kind: 'referral', partyId, referredPartyId, status: 'Pending' })) setReferredPartyId('');
    } else {
      if (!title.trim() || !message.trim()) {
        setError('Enter a campaign name and message.');
        return;
      }
      if (await save(scope, { kind: 'campaign', title: title.trim(), message: message.trim() })) {
        setTitle('');
        setMessage('');
      }
    }
  }

  return (
    <div className={workspace.page}>
      <WorkspaceHeading title="Customer engagement" onBack={onBack} />
      <nav aria-label="Customer engagement" className="flex flex-wrap gap-2">
        {tabs.map(item => (
          <button key={item} type="button" aria-pressed={tab === item} onClick={() => { setTab(item); setError(''); setStatus(''); setConsent(false); }}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${tab === item ? 'border-blue-600 bg-blue-600 text-white' : 'bg-card'}`}>{item}</button>
        ))}
      </nav>
      {!ready && <p role={loadError ? 'alert' : 'status'} className="text-sm">{loadError ? 'Customer engagement records could not be loaded.' : 'Loading records…'}</p>}
      {ready && <div className="grid items-start gap-4 lg:grid-cols-2">
        <form onSubmit={submit} className={panel}>
          {tab === 'Loyalty' && <>
            <h2 className="text-lg font-semibold">Record points</h2>
            <label className="grid gap-1 text-sm">Customer<select className={field} required value={partyId} onChange={event => setPartyId(event.target.value)}><option value="">Choose customer</option>{partyOptions}</select></label>
            {partyId && <p className="text-sm font-medium">{balance.toLocaleString('en-IN')} points available</p>}
            <label className="grid gap-1 text-sm">Action<select className={field} value={redeem ? 'redeem' : 'add'} onChange={event => setRedeem(event.target.value === 'redeem')}><option value="add">Add points</option><option value="redeem">Redeem points</option></select></label>
            <label className="grid gap-1 text-sm">Points<input className={field} required type="number" min="1" step="1" value={points} onChange={event => setPoints(event.target.value)} /></label>
            <label className="grid gap-1 text-sm">Reason<input className={field} required maxLength={240} value={note} onChange={event => setNote(event.target.value)} /></label>
          </>}
          {tab === 'Referrals' && <>
            <h2 className="text-lg font-semibold">Record a referral</h2>
            <label className="grid gap-1 text-sm">Referred by<select className={field} required value={partyId} onChange={event => setPartyId(event.target.value)}><option value="">Choose customer</option>{partyOptions}</select></label>
            <label className="grid gap-1 text-sm">Referred customer<select className={field} required value={referredPartyId} onChange={event => setReferredPartyId(event.target.value)}><option value="">Choose customer</option>{partyOptions}</select></label>
          </>}
          {tab === 'Campaigns' && <>
            <h2 className="text-lg font-semibold">New WhatsApp draft</h2>
            <label className="grid gap-1 text-sm">Greeting templates
              <select className={field} value="" onChange={event => {
                const template = greetingTemplates.find(item => item.title === event.target.value);
                if (template) { setTitle(template.title); setMessage(template.message); }
              }}>
                <option value="">Choose a template</option>
                {greetingTemplates.map(template => <option key={template.title} value={template.title}>{template.title}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Campaign name<input className={field} required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label className="grid gap-1 text-sm">Message<textarea className={field} required rows={5} maxLength={1200} value={message} onChange={event => setMessage(event.target.value)} /></label>
            <p className="text-xs text-muted-foreground">Use {'{name}'} or {'{business}'} to personalize a draft.</p>
          </>}
          <button className={primary} type="submit" disabled={saving}>{saving ? 'Saving…' : tab === 'Campaigns' ? 'Save draft' : 'Save'}</button>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {status && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{status}</p>}
        </form>
        <section className={panel}>
          {tab === 'Loyalty' && <>
            <h2 className="text-lg font-semibold">Points history</h2>
            {pointsHistory.length === 0 && <p className="text-sm text-muted-foreground">{partyId ? 'No points recorded for this customer.' : 'Choose a customer to see their points.'}</p>}
            <ul className="divide-y">
              {pointsHistory.map(record => <li key={record.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div>{record.note}<div className="text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleDateString('en-IN')}</div></div><span className="font-semibold">{record.points > 0 ? '+' : ''}{record.points}</span></li>)}
            </ul>
          </>}
          {tab === 'Referrals' && <>
            <h2 className="text-lg font-semibold">Referral history</h2>
            {referrals.length === 0 && <p className="text-sm text-muted-foreground">No referrals recorded yet.</p>}
            <ul className="divide-y">
              {referrals.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>{partyNames.get(record.partyId) || 'Removed customer'} referred {partyNames.get(record.referredPartyId) || 'removed customer'}</span>
                {record.status === 'Pending' ? <button type="button" disabled={saving} className="rounded-lg border px-3 py-1.5 font-medium" onClick={() => void save(scope, { kind: 'referral', partyId: record.partyId, referredPartyId: record.referredPartyId, status: 'Rewarded' }, record)}>Mark rewarded</button> : <span className="font-medium text-emerald-700 dark:text-emerald-400">Rewarded</span>}
              </li>)}
            </ul>
          </>}
          {tab === 'Campaigns' && <>
            <h2 className="text-lg font-semibold">Open a draft in WhatsApp</h2>
            <label className="grid gap-1 text-sm">Draft<select className={field} value={campaignId} onChange={event => { setCampaignId(event.target.value); setConsent(false); }}><option value="">Choose a saved draft</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Recipient<select className={field} value={recipientId} onChange={event => { setRecipientId(event.target.value); setConsent(false); }}><option value="">Choose customer</option>{partyOptions}</select></label>
            {recipient && !phone && <p className="text-sm text-muted-foreground">Add a valid WhatsApp number to this customer first.</p>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={event => setConsent(event.target.checked)} /> This customer agreed to receive marketing messages.</label>
            {campaign && recipient && phone && consent &&
              <a className={`inline-flex items-center gap-2 ${primary}`} target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/${phone}?text=${encodeURIComponent(campaign.message.replace(/\{name\}|\{business\}/g, token => token === '{name}' ? recipient.name : companyName))}`}>
                Open WhatsApp <ExternalLink size={15} />
              </a>}
          </>}
        </section>
      </div>}
    </div>
  );
}

export default function CustomerEngagement({ onBack }: { onBack: () => void }) {
  const { user, isDemo } = useAuth();
  const { company } = useCompany();
  if (!user || !company) return null;

  return <EngagementWorkspace key={`${user.uid}:${company.id}`} scope={{ userId: user.uid, companyId: company.id, demo: isDemo }} onBack={onBack} />;
}
