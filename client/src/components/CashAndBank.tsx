import { WorkspaceHeading, WorkspaceMetrics, workspace, workspaceMoney } from './WorkspaceUI';
import React, { useState } from 'react';
import { Plus, ArrowLeftRight, CheckCircle2, Wallet } from 'lucide-react';
import { AccountTransaction, BankAccount } from '../types';
import { StorageService } from '../services/storageService';
import { formatDate } from '../utils/dateUtils';

interface CashAndBankProps {
  onBack?: () => void;
}

export const CashAndBank: React.FC<CashAndBankProps> = ({ onBack }) => {
  const [accounts, setAccounts] = useState<BankAccount[]>(() => StorageService.ensureDefaultAccounts());
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [txns, setTxns] = useState<AccountTransaction[]>(() => StorageService.getAccountTransactions());
  const [modalMode, setModalMode] = useState<'NONE' | 'ADD_ACCOUNT' | 'ADJUST'>('NONE');
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<'BANK' | 'UPI_WALLET'>('BANK');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccIfsc, setNewAccIfsc] = useState('');
  const [newAccUpi, setNewAccUpi] = useState('');
  const [newAccOpening, setNewAccOpening] = useState('');

  const [adjType, setAdjType] = useState<'ADD_MONEY' | 'REDUCE_MONEY' | 'CONTRA'>('ADD_MONEY');
  const [adjAccId, setAdjAccId] = useState('cash_default');
  const [adjToAccId, setAdjToAccId] = useState('bank_default');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const refresh = () => {
    setAccounts(StorageService.ensureDefaultAccounts());
    setTxns(StorageService.getAccountTransactions());
  };

  const totalCash = accounts.filter((a) => a.type === 'CASH').reduce((s, a) => s + (a.balance || 0), 0);
  const totalBank = accounts.filter((a) => a.type !== 'CASH').reduce((s, a) => s + (a.balance || 0), 0);

  const visibleTransactions = ledgerAccountId ? txns.filter(tx => tx.accountId === ledgerAccountId || tx.toAccountId === ledgerAccountId) : txns;
  const accountName = (id: string) => accounts.find(account => account.id === id)?.name || id;

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    const open = Number(newAccOpening) || 0;
    StorageService.saveBankAccount({
      id: crypto.randomUUID(),
      name: newAccName.trim(),
      type: newAccType,
      accountNumber: newAccNumber.trim() || undefined,
      ifsc: newAccIfsc.trim().toUpperCase() || undefined,
      upiId: newAccUpi.trim() || undefined,
      openingBalance: open,
      balance: open,
      createdAt: new Date().toISOString(),
    });
    setModalMode('NONE');
    setNewAccName('');
    setNewAccNumber('');
    setNewAccIfsc('');
    setNewAccUpi('');
    setNewAccOpening('');
    refresh();
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(adjAmount);
    if (!amt || amt <= 0) return;
    StorageService.recordAccountAdjustment({
      accountId: adjAccId,
      toAccountId: adjType === 'CONTRA' ? adjToAccId : undefined,
      type: adjType,
      amount: amt,
      date: new Date().toISOString().split('T')[0],
      notes: adjNote.trim() || undefined,
    });
    setModalMode('NONE');
    setAdjAmount('');
    setAdjNote('');
    refresh();
  };

  return (
    <div className="min-h-screen bg-surface-container-low pb-28">
      <div className={workspace.titleBand}>
        <WorkspaceHeading title="Cash & Bank Accounts" onBack={onBack} actions={
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModalMode('ADJUST')}
            className={workspace.secondary}
          >
            <ArrowLeftRight className="w-4 h-4 text-blue-600" /> Transfer / Adjust
          </button>
          <button
            type="button"
            onClick={() => setModalMode('ADD_ACCOUNT')}
            className={workspace.primary}
          >
            <Plus className="w-4 h-4" /> Add Bank
          </button>
        </div>
        }>
          Balances and account ledger
        </WorkspaceHeading>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 space-y-5">
        <WorkspaceMetrics values={[
          { label: 'Cash in hand', value: workspaceMoney(totalCash), tone: 'positive' },
          { label: 'Bank & UPI balances', value: workspaceMoney(totalBank) },
        ]} />


        {/* Account Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-50 dark:bg-blue-900/30 text-blue-600">
                  {acc.type}
                </span>
                <Wallet className="w-4 h-4 text-slate-400" />
              </div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{acc.name}</h3>
              {acc.accountNumber && <p className="text-xs font-mono text-slate-500">A/c: {acc.accountNumber}</p>}
              {acc.upiId && <p className="text-xs text-slate-500">UPI: {acc.upiId}</p>}
              <p className={`text-xl font-black pt-1 ${(acc.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ₹{(acc.balance || 0).toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </div>

        {/* Passbook / Reconciliation */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-semibold">Account ledger</h2>
              <p className="text-xs text-muted-foreground">{visibleTransactions.length} entries</p>
            </div>
            <select aria-label="Filter ledger by account" className={workspace.input + ' sm:w-auto'} value={ledgerAccountId} onChange={event => setLedgerAccountId(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
            {visibleTransactions.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">No transactions for the selected account.</p>
            ) : (
              visibleTransactions.map((tx) => {
                const isCredit = tx.type === 'RECEIPT' || tx.type === 'CASH_SALE' || tx.type === 'ADD_MONEY';
                const accountLabel = tx.toAccountId ? accountName(tx.accountId) + ' → ' + accountName(tx.toAccountId) : accountName(tx.accountId);
                return (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {tx.note || tx.partyName || tx.type}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(tx.date)} · {accountLabel} · {tx.type.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-black ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isCredit ? '+' : ''}₹{tx.amount.toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          StorageService.toggleTransactionReconciled(tx.id);
                          refresh();
                        }}
                        aria-label="Toggle bank reconciliation"
                        aria-pressed={Boolean(tx.reconciled)}
                        className={`grid min-h-10 min-w-10 place-items-center rounded-xl transition-colors ${
                          tx.reconciled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {modalMode === 'ADD_ACCOUNT' && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleCreateAccount} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-lg font-black">Add Bank / UPI Account</h3>
            <input required placeholder="Account Name (e.g. HDFC Current)" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <select value={newAccType} onChange={(e) => setNewAccType(e.target.value as any)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="BANK">Bank Account</option>
              <option value="UPI_WALLET">UPI / Wallet</option>
            </select>
            <input placeholder="Account No." value={newAccNumber} onChange={(e) => setNewAccNumber(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <input placeholder="IFSC Code" value={newAccIfsc} onChange={(e) => setNewAccIfsc(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <input placeholder="UPI ID (merchant@okaxis)" value={newAccUpi} onChange={(e) => setNewAccUpi(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <input type="number" placeholder="Opening Balance ₹" value={newAccOpening} onChange={(e) => setNewAccOpening(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setModalMode('NONE')} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs">Save Account</button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'ADJUST' && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleAdjust} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-lg font-black">Contra / Cash-Bank Adjustment</h3>
            <select value={adjType} onChange={(e) => setAdjType(e.target.value as any)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="ADD_MONEY">Add Money / Capital</option>
              <option value="REDUCE_MONEY">Withdraw / Reduce Money</option>
              <option value="CONTRA">Contra Transfer (Cash ↔ Bank)</option>
            </select>
            <select value={adjAccId} onChange={(e) => setAdjAccId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              {accounts.map((a) => <option key={a.id} value={a.id}>From: {a.name}</option>)}
            </select>
            {adjType === 'CONTRA' && (
              <select value={adjToAccId} onChange={(e) => setAdjToAccId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
                {accounts.map((a) => <option key={a.id} value={a.id}>To: {a.name}</option>)}
              </select>
            )}
            <input required type="number" placeholder="Amount ₹" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <input placeholder="Notes" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setModalMode('NONE')} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs">Record Entry</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CashAndBank;
