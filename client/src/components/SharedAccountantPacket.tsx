import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileSpreadsheet } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { downloadAccountantPacket, getAccountantPacket } from '../services/accountantSharing';
import type { AccountantPacket } from '../services/accountantSharing';
import Auth from './Auth';

function Packet({ companyId, packetId }: { companyId: string; packetId: string }) {
  const [packet, setPacket] = useState<AccountantPacket | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getAccountantPacket(companyId, packetId).then(
      value => { if (active) setPacket(value); },
      () => { if (active) setPacket(null); },
    );
    return () => { active = false; };
  }, [companyId, packetId]);

  async function download() {
    if (!packet || busy) return;
    setBusy(true);
    setError('');
    try {
      await downloadAccountantPacket(companyId, packetId, `JLS-Accountant-${packet.from}-to-${packet.to}.xlsx`);
    } catch {
      setError('Download failed. The link may have expired or been revoked.');
    } finally {
      setBusy(false);
    }
  }

  if (packet === undefined) return <p role="status">Loading workbook…</p>;
  if (packet === null) return <p role="status">This link is unavailable for your account. Check the sign-in email, or ask the owner for a new link.</p>;
  return <section className="space-y-4 rounded-2xl border bg-card p-5">
    <FileSpreadsheet className="text-primary" aria-hidden="true" />
    <h1 className="text-2xl font-semibold">{packet.company}</h1>
    <p className="text-sm text-muted-foreground">Accountant workbook · {packet.from} to {packet.to}</p>
    <button type="button" disabled={busy} onClick={() => void download()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      <Download size={16} /> {busy ? 'Downloading…' : 'Download workbook'}
    </button>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </section>;
}

export default function SharedAccountantPacket() {
  const { companyId, packetId } = useParams();
  const { user, loading, isDemo, signOut } = useAuth();
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verifiedUid, setVerifiedUid] = useState('');

  async function verify(refresh: boolean) {
    if (!user || isDemo) return;
    try {
      if (refresh) {
        await user.reload();
        await user.getIdToken(true);
        if (user.emailVerified) setVerifiedUid(user.uid);
        else setVerificationMessage('Email verification is still pending.');
      } else {
        await sendEmailVerification(user);
        setVerificationMessage('Verification email sent. Open it, then return here and refresh verification.');
      }
    } catch {
      setVerificationMessage('Could not check or send email verification. Try again later.');
    }
  }
  if (loading) return <p role="status" className="p-5">Loading sign-in…</p>;
  if (!user) return <Auth />;
  if (!companyId || !packetId) return null;
  return <main className="mx-auto max-w-xl space-y-5 p-5 pt-10">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm font-semibold">JLS BillBook</span>
      <button type="button" onClick={() => void signOut()} className="rounded-lg border px-3 py-2 text-sm">Switch account</button>
    </header>
    {isDemo ? <p>Use the account that received the link to open the workbook.</p>
      : user.emailVerified || verifiedUid === user.uid
        ? <Packet key={`${companyId}/${packetId}/${user.uid}`} companyId={companyId} packetId={packetId} />
        : <section className="space-y-3 rounded-2xl border bg-card p-5">
          <h1 className="text-lg font-semibold">Verify your email to open the workbook</h1>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void verify(false)} className="rounded-lg border px-3 py-2 text-sm">Send verification email</button>
            <button type="button" onClick={() => void verify(true)} className="rounded-lg border px-3 py-2 text-sm">Refresh verification</button>
          </div>
          {verificationMessage && <p role="status" className="text-sm">{verificationMessage}</p>}
        </section>}
  </main>;
}
