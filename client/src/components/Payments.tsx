
import React, { useState, useMemo } from 'react';
import { Payment, Customer, PaymentAllocation } from '../types';
import { StorageService } from '../services/storageService';
import { Plus, ArrowLeft, ArrowDownLeft, Edit2, Trash2, X } from 'lucide-react';
import Autocomplete from './Autocomplete';
import { HapticService } from '@/services/hapticService';
import { formatDate } from '../utils/dateUtils';
import { getInvoicePaid, getPaymentAllocations, roundCurrency } from '../services/paymentAllocation';

interface PaymentsProps {
    onBack: () => void;
    initialPayment?: Payment | null;
    initialCustomerId?: string | null;
    createDirection?: 'RECEIVED' | 'PAID' | null;
    onCreateOpened?: () => void;
}

const Payments: React.FC<PaymentsProps> = ({ onBack, initialPayment, initialCustomerId, createDirection, onCreateOpened }) => {
    const [payments, setPayments] = useState<Payment[]>(StorageService.getPayments());
    const [customers] = useState<Customer[]>(StorageService.getCustomers());
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

    // Form State
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [mode, setMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
    const [type, setType] = useState<'RECEIVED' | 'PAID' | 'RECEIPT'>('RECEIVED');
    const [accountId, setAccountId] = useState<string>('cash_default');
    const [selectedAllocIds, setSelectedAllocIds] = useState<Record<string, boolean>>({});
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');

    const accounts = useMemo(() => StorageService.ensureDefaultAccounts(), [showAddModal]);

    const unpaidBillsForParty = useMemo(() => {
        if (!selectedCustomerId) return [];
        const source = type === 'PAID' ? StorageService.getPurchases() : StorageService.getInvoices();
        const previous = editingPayment?.customerId === selectedCustomerId && (editingPayment.type === 'PAID') === (type === 'PAID')
            ? getPaymentAllocations(editingPayment) : [];
        return source
            .filter(v => v.customerId === selectedCustomerId && v.type !== 'CREDIT_NOTE')
            .map(v => ({
                invoice: v,
                due: roundCurrency(Math.max(0, v.total - getInvoicePaid(v) + previous
                    .filter(allocation => allocation.invoiceId === v.id)
                    .reduce((sum, allocation) => sum + allocation.amount, 0))),
            }))
            .filter(x => x.due > 0);
    }, [selectedCustomerId, type, editingPayment, showAddModal]);

    // Tab State for View
    const [activeTab, setActiveTab] = useState<'ALL' | 'RECEIVED' | 'PAID'>('ALL');

    const filteredPayments = payments.filter(p => {
        if (activeTab === 'ALL') return true;
        if (activeTab === 'PAID') return p.type === 'PAID';
        return p.type !== 'PAID'; // Default or RECEIVED
    });

    React.useEffect(() => {
        if (initialPayment) {
            handleEdit(initialPayment);
        } else if (initialCustomerId) {
            handleOpenAdd();
            setSelectedCustomerId(initialCustomerId);
        } else if (createDirection) {
            handleOpenAdd(createDirection);
            onCreateOpened?.();
        }
    }, [initialPayment, initialCustomerId, createDirection, onCreateOpened]);

    const handleOpenAdd = (direction?: 'RECEIVED' | 'PAID') => {
        setEditingPayment(null);
        setSelectedCustomerId('');
        setAmount('');
        setDate(new Date().toISOString().split('T')[0]);
        setMode('CASH');
        setAccountId('cash_default');
        setSelectedAllocIds({});
        setType(direction ?? (activeTab === 'PAID' ? 'PAID' : 'RECEIVED'));
        setReference('');
        setNote('');
        setShowAddModal(true);
        HapticService.light();
    };

    const handleEdit = (payment: Payment) => {
        setEditingPayment(payment);
        setSelectedCustomerId(payment.customerId);
        setAmount(payment.amount.toString());
        setDate(payment.date);
        setMode(payment.mode);
        setAccountId(payment.accountId || (payment.mode === 'CASH' ? 'cash_default' : 'bank_default'));
        const map: Record<string, boolean> = {};
        getPaymentAllocations(payment).forEach(a => { map[a.invoiceId] = true; });
        setSelectedAllocIds(map);
        setType(payment.type || 'RECEIVED');
        setReference(payment.reference || '');
        setNote(payment.note || '');
        setShowAddModal(true);
        HapticService.light();
    };

    const handleDelete = (id: string) => {
        if (confirm('Move this payment to the Recycle Bin and reverse its entries?')) {
            StorageService.deletePayment(id);
            setPayments(StorageService.getPayments());
            HapticService.notification();
        }
    };

    const handleSavePayment = () => {
        const paymentAmount = roundCurrency(Number(amount));
        if (!customers.some(customer => customer.id === selectedCustomerId) || !date || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            return alert('Choose a party, enter a positive amount and select a date.');
        }
        let remaining = paymentAmount;
        const allocations: PaymentAllocation[] = [];
        unpaidBillsForParty.forEach(({ invoice, due }) => {
            if (!selectedAllocIds[invoice.id] || remaining <= 0) return;
            const take = Math.min(due, remaining);
            if (take > 0) {
                allocations.push({
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amount: Math.round(take * 100) / 100,
                });
                remaining = roundCurrency(remaining - take);
            }
        });

        const previous = editingPayment ? getPaymentAllocations(editingPayment) : [];
        const chosen = Object.keys(selectedAllocIds).filter(id => selectedAllocIds[id]);
        const keepAllocations = editingPayment && paymentAmount === editingPayment.amount &&
            selectedCustomerId === editingPayment.customerId && (type === 'PAID') === (editingPayment.type === 'PAID') &&
            chosen.length === new Set(previous.map(item => item.invoiceId)).size &&
            previous.every(item => selectedAllocIds[item.invoiceId]);
        const links = keepAllocations ? previous : allocations;
        const paymentData: Payment = {
            ...editingPayment,
            id: editingPayment ? editingPayment.id : crypto.randomUUID(),
            customerId: selectedCustomerId,
            date: date,
            amount: paymentAmount,
            mode: mode,
            type: type,
            accountId: accountId || (mode === 'CASH' ? 'cash_default' : 'bank_default'),
            allocations: links,
            invoiceId: links.length === 1 ? links[0].invoiceId : '',
            invoiceNumber: links.length === 1 ? links[0].invoiceNumber : '',
            reference: reference,
            note: note
        };

        if (editingPayment) {
            StorageService.updatePayment(paymentData);
        } else {
            StorageService.savePayment(paymentData);
        }

        setPayments(StorageService.getPayments());
        setShowAddModal(false);
        HapticService.success();

        // Reset form
        setEditingPayment(null);
        setSelectedCustomerId('');
        setAmount('');
        setReference('');
        setNote('');
    };

    const getCustomerName = (id: string) => {
        return customers.find(c => c.id === id)?.company || customers.find(c => c.id === id)?.name || 'Unknown';
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-900 min-h-screen flex flex-col">
            {/* Header with Tabs */}
            <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <div className="flex items-center justify-between px-4 pt-safe pb-2">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                            <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Transaction History</h1>
                    </div>
                    <button
                        onClick={() => handleOpenAdd()}
                        className={`${activeTab === 'PAID' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors`}
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">
                            {activeTab === 'PAID' ? 'Make Payment' : activeTab === 'RECEIVED' ? 'New Receipt' : 'New Transaction'}
                        </span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 pb-0 gap-6 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('ALL')} className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'ALL' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        All
                    </button>
                    <button onClick={() => setActiveTab('RECEIVED')} className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'RECEIVED' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        Receipts (In)
                    </button>
                    <button onClick={() => setActiveTab('PAID')} className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${activeTab === 'PAID' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        Payments (Out)
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                {filteredPayments.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <ArrowDownLeft className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>No payments received yet.</p>
                    </div>
                ) : (
                    filteredPayments.slice().reverse().map(payment => (
                        <div key={payment.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex justify-between items-center group">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${payment.type === 'PAID' ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'}`}>
                                    <ArrowDownLeft className={`w-6 h-6 ${payment.type === 'PAID' ? 'rotate-180' : ''}`} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 dark:text-slate-200">{getCustomerName(payment.customerId)}</h3>
                                    <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                                        <span>{formatDate(payment.date)}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span className="uppercase">{payment.mode}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <span className={`block text-lg font-bold ${payment.type === 'PAID' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                                        {payment.type === 'PAID' ? '-' : '+'}₹{payment.amount.toLocaleString('en-IN')}
                                    </span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEdit(payment)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-600">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(payment.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-600">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                {/* Mobile actions always visible or small menu */}
                                <div className="md:hidden flex gap-1">
                                    <button onClick={() => handleEdit(payment)} className="p-2 text-slate-400">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-safe">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                {editingPayment ? 'Edit Transaction' : (type === 'PAID' ? 'Make Payment' : 'Receive Payment')}
                            </h2>
                            <button onClick={() => setShowAddModal(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Type Toggle */}
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                <button onClick={() => { if (type === 'PAID') setSelectedAllocIds({}); setType('RECEIVED'); }} className={`flex-1 py-3 rounded-lg font-bold text-xs uppercase transition-all ${type !== 'PAID' ? 'bg-white dark:bg-slate-700 shadow text-green-600 dark:text-green-400' : 'text-slate-400'}`}>Money In (Received)</button>
                                <button onClick={() => { if (type !== 'PAID') setSelectedAllocIds({}); setType('PAID'); }} className={`flex-1 py-3 rounded-lg font-bold text-xs uppercase transition-all ${type === 'PAID' ? 'bg-white dark:bg-slate-700 shadow text-red-500 dark:text-red-400' : 'text-slate-400'}`}>Money Out (Paid)</button>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                                    {type === 'PAID' ? 'Vendor / Party' : 'Customer'}
                                </label>
                                <Autocomplete
                                    options={customers.map(c => ({ id: c.id, label: c.company, subLabel: c.name }))}
                                    value={selectedCustomerId}
                                    onChange={value => { setSelectedCustomerId(value); setSelectedAllocIds({}); }}
                                    placeholder={type === 'PAID' ? 'Select Vendor' : 'Select Customer'}
                                    type="customer"
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3.5 text-slate-400 font-bold">₹</span>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-8 pr-4 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Date</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Payment Mode</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => {
                                                const next = m as Payment['mode'];
                                                if ((next === 'CASH') !== (mode === 'CASH')) setAccountId(next === 'CASH' ? 'cash_default' : 'bank_default');
                                                setMode(next);
                                            }}
                                            className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-colors border ${mode === m
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                                }`}
                                        >
                                            {m.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Account (Cash / Bank)</label>
                                <select
                                    value={accountId}
                                    onChange={(e) => setAccountId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                                >
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.name} (₹{(acc.balance || 0).toLocaleString('en-IN')})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {unpaidBillsForParty.length > 0 && (
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                        Settle Against Unpaid Bills
                                    </p>
                                    <div className="max-h-32 overflow-y-auto space-y-1.5">
                                        {unpaidBillsForParty.map(({ invoice, due }) => {
                                            const checked = Boolean(selectedAllocIds[invoice.id]);
                                            return (
                                                <label key={invoice.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-slate-900 cursor-pointer">
                                                    <span className="flex items-center gap-2 font-bold">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const next = { ...selectedAllocIds, [invoice.id]: e.target.checked };
                                                                setSelectedAllocIds(next);
                                                                if (!amount) {
                                                                    setAmount(String(due));
                                                                }
                                                            }}
                                                        />
                                                        #{invoice.invoiceNumber} ({formatDate(invoice.date)})
                                                    </span>
                                                    <span className="font-black text-amber-600">Due ₹{due.toLocaleString('en-IN')}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Reference / Note</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="e.g. UPI Ref ID or Cheque No."
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSavePayment}
                                    className="flex-1 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                                >
                                    {editingPayment ? 'Update Receipt' : 'Save Receipt'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payments;
