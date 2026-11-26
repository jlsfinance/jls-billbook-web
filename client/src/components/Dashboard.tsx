
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, Plus, FileText, Calculator,
    ChevronRight, Building2, Check,
    BarChart3, PieChart, Menu, ScanBarcode, Landmark, ShoppingBag, Receipt, Wallet, ArrowDownLeft, ArrowUpRight, AlertTriangle
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Invoice, ViewState, VoucherType } from '../types';
import { HapticService } from '../services/hapticService';
import { formatDate } from '../utils/dateUtils';
import { useCompany } from '../contexts/CompanyContext';
import { BackupSettings } from './BackupSettings';

interface DashboardProps {
    onCreateInvoice: () => void;
    onCreateCreditNote: () => void;
    onViewInvoice: (invoice: Invoice) => void;
    onOpenReports: () => void;
    onOpenSmartCalc: () => void;
    onOpenAI: () => void;
    onReceivePayment: () => void;
    onToggleSidebar: () => void;
    onNavigate?: (view: ViewState, voucherType?: VoucherType) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
    onCreateInvoice, onViewInvoice, onOpenReports, onOpenSmartCalc, onOpenAI, onReceivePayment, onToggleSidebar, onNavigate
}) => {
    // Get company data from CompanyContext (Firestore)
    const { company, companies: allCompanies, switchCompany } = useCompany();

    const [timeFilter, setTimeFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('MONTH');
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [pendingInvoices, setPendingInvoices] = useState(0);

    // Daybook Metrics
    const [todaySales, setTodaySales] = useState(0);
    const [monthlySales, setMonthlySales] = useState(0);
    const [totalSales, setTotalSales] = useState(0);
    const [todayReceived, setTodayReceived] = useState(0);

    // Business Health Metrics
    const [toCollect, setToCollect] = useState(0);
    const [toPay, setToPay] = useState(0);
    const [cashBankTotal, setCashBankTotal] = useState(0);
    const [lowStockCount, setLowStockCount] = useState(0);

    // Sales Period Slider: 0=Today, 1=Month, 2=Total
    const [salesPeriod, setSalesPeriod] = useState(0);

    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyGst, setNewCompanyGst] = useState('');

    const [metricIndex, setMetricIndex] = useState(0);
    const [adminAds, setAdminAds] = useState<any[]>([]);
    const [adIndex, setAdIndex] = useState(0);
    const [showBackupSettings, setShowBackupSettings] = useState(false);

    useEffect(() => {
        if (!company?.isLegacy) StorageService.runDueAutomatedBills();
    }, [company?.isLegacy]);

    useEffect(() => {
        loadData();
        const interval = setInterval(() => loadData(), 2000);

        // Auto slide for Card 2
        const slideInterval = setInterval(() => {
            setMetricIndex(prev => (prev + 1) % 4);
        }, 3000);

        // Auto slide for Ads
        const adTimer = setInterval(() => {
            setAdIndex(prev => prev + 1);
        }, 5000);

        return () => {
            clearInterval(interval);
            clearInterval(slideInterval);
            clearInterval(adTimer);
        };
    }, [timeFilter]);

    const loadData = () => {
        const allInvoices = StorageService.getInvoices();
        const allPayments = StorageService.getPayments();

        // Company is now from CompanyContext, not StorageService
        setAdminAds(StorageService.getAdminAds());

        // Date Filtering Logic
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        // 1. Calculate Daybook Metrics (Strictly for TODAY)
        const todaysInvoices = allInvoices.filter(i => i.date === todayStr);
        const todaysPayments = allPayments.filter(p => p.date === todayStr);

        setTodaySales(todaysInvoices.reduce((sum, inv) => sum + inv.total, 0));
        setTodayReceived(todaysPayments.reduce((sum, p) => sum + p.amount, 0));

        // Calculate Monthly Sales
        const monthsInvoices = allInvoices.filter(i => {
            const invDate = new Date(i.date);
            return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
        });
        setMonthlySales(monthsInvoices.reduce((sum, inv) => sum + inv.total, 0));

        // Calculate Total Sales (All Time)
        setTotalSales(allInvoices.reduce((sum, inv) => sum + inv.total, 0));

        // 2. Filter Main Dashboard List
        const filteredInvoices = allInvoices.filter(inv => {
            const invDate = new Date(inv.date);
            if (timeFilter === 'TODAY') {
                return invDate.toDateString() === now.toDateString();
            } else if (timeFilter === 'MONTH') {
                return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
            }
            return true;
        });

        setInvoices(filteredInvoices);
        setTotalRevenue(filteredInvoices.reduce((sum, inv) => sum + inv.total, 0));
        setPendingInvoices(filteredInvoices.filter(i => (i.total - (i.paidAmount || 0)) > 0).length);

        const customers = StorageService.getCustomers();
        setToCollect(customers.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0));
        setToPay(customers.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0));
        const accounts = StorageService.ensureDefaultAccounts();
        setCashBankTotal(accounts.reduce((s, a) => s + (a.balance || 0), 0));
        const prods = StorageService.getProducts().filter(p => !p.isArchived && p.category !== 'Services');
        const todayIso = now.toISOString().split('T')[0];
        const soonIso = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        setLowStockCount(prods.filter(p => (p.stock || 0) <= (p.lowStockThreshold ?? 10) || (p.batches || []).some(b => b.expiryDate && b.expiryDate <= soonIso && b.expiryDate >= todayIso)).length);
    };

    // switchCompany now comes from useCompany hook

    const createNewCompany = () => {
        if (!newCompanyName.trim()) return;
        const newId = StorageService.createCompany({
            name: newCompanyName.trim(),
            address: company?.address || '',
            phone: company?.phone || '',
            email: company?.email || '',
            state: company?.state || 'Delhi',
            gstin: newCompanyGst.trim() || undefined,
            gst_enabled: true,
        });
        setShowCreateDialog(false);
        setNewCompanyName('');
        setNewCompanyGst('');
        StorageService.switchCompany(newId);
    };



    // const currentSlide = heroSlides[activeHeroIndex];

    return (
        <div className="pb-32 bg-surface-container-low dark:bg-slate-950 min-h-screen">
            {/* Header Area - Material 3 Adaptive Top Bar */}
            <div className="px-4 pb-2 bg-surface/80 dark:bg-slate-900/80 sticky top-0 z-30 border-b border-outline-variant/50 backdrop-blur-md">
                <div className="flex items-center justify-between h-14 max-w-5xl mx-auto">

                    {/* Left: Nav Drawer Trigger */}
                    <div className="w-20 flex items-center justify-start">
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                HapticService.light();
                                onToggleSidebar();
                            }}
                            className="p-3 rounded-full hover:bg-surface-container-high transition-colors"
                        >
                            <Menu className="w-6 h-6 text-on-surface" />
                        </motion.button>
                    </div>

                    {/* Center: Brand Ident (M3 Title Large) */}
                    <div className="flex-1 flex justify-center relative">
                        <button
                            onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                            className="flex flex-col items-center justify-center active:scale-95 transition-transform"
                        >
                            <h2 className="font-black text-base text-on-surface leading-none uppercase tracking-tighter">
                                {company?.name || 'My Business'}
                            </h2>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-google-blue mt-0.5 uppercase tracking-widest bg-google-blue/5 px-2 py-0.5 rounded-full border border-google-blue/10">
                                <span>Switch</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                            </div>
                        </button>

                        <AnimatePresence>
                            {showCompanyDropdown && (
                                <>
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 10, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        className="absolute top-full mt-2 w-64 bg-surface-container-high rounded-[28px] shadow-elevation-3 border border-outline-variant p-2 z-50 origin-top text-left"
                                    >
                                        <div className="max-h-60 overflow-y-auto space-y-1">
                                            {allCompanies.map((comp, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => { switchCompany(comp.id || 'default'); setShowCompanyDropdown(false); }}
                                                    className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${comp.id === company?.id ? 'bg-google-blue text-white' : 'hover:bg-surface-container-highest text-on-surface'}`}
                                                >
                                                    <Building2 className="w-4 h-4" />
                                                    <span className="flex-1 text-left font-bold text-xs truncate">{comp.name}{comp.isLegacy && comp.name !== 'Existing books' ? ' · Existing books' : ''}</span>
                                                    {comp.id === company?.id && <Check className="w-3 h-3" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="h-px bg-outline-variant my-2 mx-2" />
                                        <button onClick={() => { setShowCompanyDropdown(false); setShowCreateDialog(true); }} className="w-full p-4 flex items-center gap-2 text-google-blue font-black text-xs rounded-2xl hover:bg-google-blue/5 transition-colors uppercase tracking-widest">
                                            <Plus className="w-4 h-4" /> Add Business
                                        </button>
                                    </motion.div>
                                    <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowCompanyDropdown(false)} />
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right: Tonal Button for Filter */}
                    <div className="w-20 flex justify-end">
                        <div className="bg-surface-container-high p-1 rounded-full flex items-center border border-outline-variant">
                            {['TODAY', 'MONTH'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => {
                                        HapticService.light();
                                        setTimeFilter(t as any)
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${timeFilter === t ? 'bg-surface text-google-blue' : 'text-on-surface-variant'}`}
                                >
                                    {t === 'TODAY' ? 'T' : 'M'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick actions */}
            <div className="px-4 mt-5">
                <div className="bg-card rounded-2xl p-3 border shadow-sm">
                    <h2 className="mb-2 px-1 text-sm font-semibold">Quick actions</h2>
                    <div className="grid grid-cols-4 gap-1 sm:gap-2">
                        {[
                            { label: 'New sale', icon: Plus, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300', onClick: () => onCreateInvoice() },
                            { label: 'POS Counter', icon: Receipt, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300', onClick: () => onNavigate?.(ViewState.POS_BILLING) },
                            { label: 'Quotation', icon: FileText, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300', onClick: () => onNavigate?.(ViewState.CREATE_VOUCHER, 'QUOTATION') },
                            { label: 'Purchase', icon: ShoppingBag, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300', onClick: () => onNavigate?.(ViewState.CREATE_PURCHASE) },
                            { label: 'Pay In', icon: ArrowDownLeft, color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300', onClick: onReceivePayment },
                            { label: 'Cash/Bank', icon: Landmark, color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300', onClick: () => onNavigate?.(ViewState.CASH_AND_BANK) },
                            { label: 'Barcodes', icon: ScanBarcode, color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300', onClick: () => onNavigate?.(ViewState.BARCODE_LABELS) },
                            { label: 'Sales bills', icon: Wallet, color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300', onClick: () => onNavigate?.(ViewState.INVOICES) },
                        ].map((act) => (
                            <button
                                key={act.label}
                                type="button"
                                onClick={() => { HapticService.light(); act.onClick(); }}
                                className="flex flex-col items-center justify-center p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors active:scale-95"
                            >
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-1.5 ${act.color}`}>
                                    <act.icon className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center leading-tight">{act.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* DASHBOARD GRID - Material 3 Cards */}
            <div className="grid grid-cols-2 gap-3 px-4 mt-6">
                {/* 1. SALES CARD with Period Slider - Material 3 Tertiary Palette */}
                <motion.div
                    className="col-span-1 h-36 rounded-[32px] bg-tertiary-container text-on-tertiary-container shadow-sm p-4 flex flex-col justify-between relative overflow-hidden"
                >
                    {/* Period Slider Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="w-8 h-8 rounded-xl bg-on-tertiary-container/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        <div className="flex bg-on-tertiary-container/10 rounded-full p-0.5">
                            {['D', 'M', 'T'].map((label, idx) => (
                                <button
                                    key={idx}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        HapticService.light();
                                        setSalesPeriod(idx);
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-[8px] font-black transition-all ${salesPeriod === idx
                                        ? 'bg-on-tertiary-container text-tertiary-container'
                                        : 'text-on-tertiary-container/60'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sales Value based on Period */}
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            if (onOpenReports) onOpenReports();
                        }}
                        className="cursor-pointer"
                    >
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
                            {salesPeriod === 0 ? 'Day Sale' : salesPeriod === 1 ? 'Month Sale' : 'Total Sale'}
                        </p>
                        <h3 className="text-xl font-black tracking-tighter">
                            ₹{(salesPeriod === 0 ? todaySales : salesPeriod === 1 ? monthlySales : totalSales).toLocaleString('en-IN')}
                        </h3>
                        <p className="text-[9px] font-bold text-google-blue mt-0.5 uppercase tracking-wider">Reports &rarr;</p>
                    </motion.div>
                </motion.div>

                {/* 2. METRICS SLIDER - Material 3 Primary Container */}
                <motion.div
                    className="col-span-1 h-36 rounded-[32px] bg-primary-container text-on-primary-container shadow-sm flex flex-col justify-between relative overflow-hidden"
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={metricIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute inset-0 p-4 flex flex-col justify-between"
                        >
                            <div className="w-10 h-10 rounded-2xl bg-on-primary-container/10 flex items-center justify-center">
                                {metricIndex === 0 && <BarChart3 className="w-5 h-5" />}
                                {metricIndex === 1 && <Check className="w-5 h-5" />}
                                {metricIndex === 2 && <PieChart className="w-5 h-5" />}
                                {metricIndex === 3 && <FileText className="w-5 h-5" />}
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
                                    {metricIndex === 0 && (timeFilter === 'TODAY' ? "Sales Today" : "Sales Month")}
                                    {metricIndex === 1 && "Cash Received"}
                                    {metricIndex === 2 && "Est. Margin"}
                                    {metricIndex === 3 && "Pending Bills"}
                                </p>
                                <h3 className="text-xl font-black truncate tracking-tighter">
                                    {metricIndex === 0 && `₹${invoices.reduce((s, i) => s + i.total, 0).toLocaleString('en-IN')}`}
                                    {metricIndex === 1 && `₹${(timeFilter === 'TODAY' ? todayReceived : invoices.reduce((s, i) => s + (i.paidAmount || 0), 0)).toLocaleString('en-IN')}`}
                                    {metricIndex === 2 && `₹${(totalRevenue * 0.2).toLocaleString('en-IN')}`}
                                    {metricIndex === 3 && `${pendingInvoices.toLocaleString('en-IN')}`}
                                </h3>
                            </div>

                            {/* Footer Branding in Reports */}
                            <div className="mt-12 mb-8 text-center opacity-30">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                                    Report Engine by Lavneet ❤️
                                </p>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                    {/* Progress indicator */}
                    <div className="absolute bottom-3 right-4 flex gap-1.5">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === metricIndex ? 'bg-on-primary-container w-3' : 'bg-on-primary-container/20'}`} />
                        ))}
                    </div>
                </motion.div>

                {/* 3. SMART CALC - Material 3 Surface Variant */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onOpenSmartCalc}
                    className="col-span-1 h-36 rounded-[32px] bg-secondary-container text-on-secondary-container p-4 flex flex-col justify-between cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-2xl bg-on-secondary-container/10 flex items-center justify-center">
                        <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="font-black text-sm block uppercase tracking-tight">Smart Calc</span>
                        <span className="text-[9px] font-bold opacity-60 uppercase tracking-widest">Calculations</span>
                    </div>
                </motion.div>


                {/* 5. JLS AI - Material 3 Surface Variant (Alt) */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onOpenAI}
                    className="col-span-1 h-36 rounded-[32px] bg-surface-container-highest text-on-surface p-4 flex flex-col justify-between cursor-pointer border border-outline-variant"
                >
                    <div className="w-10 h-10 rounded-2xl bg-google-blue/10 flex items-center justify-center text-google-blue">
                        <span className="material-symbols-outlined text-[20px] font-black">smart_toy</span>
                    </div>
                    <div>
                        <span className="font-black text-sm block uppercase tracking-tight">JLS AI</span>
                        <span className="text-[9px] font-bold text-google-blue uppercase tracking-widest">Assistant</span>
                    </div>
                </motion.div>
            </div>

            {/* BUSINESS HEALTH STRIP */}
            <div className="px-4 mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                    type="button"
                    onClick={() => onNavigate?.(ViewState.PAYMENT_REMINDERS)}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-outline-variant/40 text-left hover:shadow-sm transition-all"
                >
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                        <ArrowDownLeft className="w-3.5 h-3.5" /> To Collect
                    </p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-1">₹{toCollect.toLocaleString('en-IN')}</p>
                </button>
                <button
                    type="button"
                    onClick={() => onNavigate?.(ViewState.CUSTOMERS)}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-outline-variant/40 text-left hover:shadow-sm transition-all"
                >
                    <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" /> To Pay
                    </p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-1">₹{toPay.toLocaleString('en-IN')}</p>
                </button>
                <button
                    type="button"
                    onClick={() => onNavigate?.(ViewState.CASH_AND_BANK)}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-outline-variant/40 text-left hover:shadow-sm transition-all"
                >
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5" /> Cash + Bank
                    </p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-1">₹{cashBankTotal.toLocaleString('en-IN')}</p>
                </button>
                <button
                    type="button"
                    onClick={() => onNavigate?.(ViewState.INVENTORY)}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-outline-variant/40 text-left hover:shadow-sm transition-all"
                >
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Low Stock / Exp
                    </p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-1">{lowStockCount} items</p>
                </button>
            </div>

            {/* AD BANNER - Material 3 Promotion Style */}
            <div className="px-4 mt-6 mb-2 relative">
                <AnimatePresence mode="wait">
                    {(() => {
                        const defaultAd = {
                            id: 'default',
                            title: 'AI Bill Scanning Live!',
                            content: 'Super Admin says: "Use JLS AI to scan bills instantly."',
                            gradient: 'from-blue-600 to-indigo-600',
                            type: 'UPDATE'
                        };
                        const syncoraAd = {
                            id: 'syncora-tally-on-mobile',
                            title: 'Syncora Tally on Mobile',
                            content: 'Take your business tally wherever you go. Get the Syncora app on Google Play.',
                            buttonText: 'Get the app',
                            actionUrl: 'https://play.google.com/store/apps/details?id=com.syncoraa.app',
                            gradient: 'from-emerald-600 to-teal-700',
                            type: 'APP'
                        };
                        const sourceAds = adminAds.length > 0 ? adminAds : [defaultAd];
                        const displayAds = [
                            ...sourceAds.filter((ad: any) => !/digital\s*india/i.test(`${ad.title || ''} ${ad.content || ''}`)),
                            syncoraAd
                        ];
                        const hasAds = displayAds.length > 0;
                        const currentAd = displayAds[adIndex % displayAds.length];

                        return (
                            <motion.div
                                key={currentAd.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.4 }}
                                onClick={currentAd.actionUrl ? () => window.open(currentAd.actionUrl, '_blank', 'noopener,noreferrer') : undefined}
                                role={currentAd.actionUrl ? 'link' : undefined}
                                tabIndex={currentAd.actionUrl ? 0 : undefined}
                                onKeyDown={currentAd.actionUrl ? (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        window.open(currentAd.actionUrl, '_blank', 'noopener,noreferrer');
                                    }
                                } : undefined}
                                className={`w-full h-40 rounded-[36px] bg-gradient-to-br ${currentAd.gradient || 'from-google-blue to-indigo-600'} p-6 flex flex-col justify-center relative overflow-hidden shadow-lg shadow-google-blue/20 ${currentAd.actionUrl ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-google-blue' : ''}`}
                            >
                                <div className="z-10 text-white">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="px-3 py-1 rounded-full bg-white/20 text-[9px] font-black uppercase tracking-[0.15em] backdrop-blur-md border border-white/10">
                                            {currentAd.type || 'Update'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-black leading-tight tracking-tight mb-1">{currentAd.title}</h3>
                                    <p className="text-xs text-blue-50 mt-1 font-medium max-w-[85%] line-clamp-2 opacity-90">{currentAd.content}</p>
                                    {currentAd.buttonText && (
                                        <span className="inline-flex mt-3 px-3 py-1.5 rounded-full bg-white text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                                            {currentAd.buttonText} <ChevronRight className="w-3 h-3 ml-1" />
                                        </span>
                                    )}
                                </div>
                                {/* Pagination */}
                                {hasAds && (
                                    <div className="absolute bottom-4 right-6 flex gap-1.5">
                                        {displayAds.map((_: any, i: number) => (
                                            <div key={i} className={`h-1.5 rounded-full transition-all ${i === (adIndex % displayAds.length) ? 'bg-white w-4' : 'bg-white/30 w-1.5'}`} />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>
            </div>

            {/* QUICK ACTIONS & RECENT ACTIVITY - M3 Design */}
            <div className="px-5 mt-8">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.25em]">Recent Transactions</h3>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={onOpenReports}
                        className="text-[10px] font-black text-google-blue uppercase tracking-widest bg-google-blue/5 px-3 py-1 rounded-full"
                    >
                        View All
                    </motion.button>
                </div>

                <div className="bg-surface-container-highest/40 dark:bg-slate-900 rounded-[36px] border border-outline-variant/30 overflow-hidden shadow-sm">
                    {invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[240px] text-slate-400">
                            <div className="w-12 h-12 rounded-2xl bg-surface-container-highest flex items-center justify-center mb-3">
                                <FileText className="w-6 h-6 opacity-40" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">No recent activity</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-outline-variant/20 max-h-[400px] overflow-y-auto">
                            {invoices.slice(0, 20).map(inv => (
                                <motion.div
                                    key={inv.id}
                                    whileTap={{ backgroundColor: 'rgba(0,0,0,0.05)' }}
                                    className="p-5 flex justify-between items-center cursor-pointer active:bg-surface-container-high transition-colors"
                                    onClick={() => onViewInvoice(inv)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center text-google-blue">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-on-surface">{inv.customerName}</p>
                                            <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider opacity-70">
                                                #{inv.invoiceNumber} • {formatDate(inv.date)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-sm text-on-surface">₹{inv.total.toLocaleString('en-IN')}</p>
                                        <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${inv.status === 'PAID' ? 'bg-google-green/10 text-google-green' : 'bg-google-red/10 text-google-red'}`}>
                                            {inv.status}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Company Dialog - Copied from Previous Version */}
            <AnimatePresence>
                {showCreateDialog && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-sm p-8">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">New Business</h2>
                            <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company Name *" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold mb-3 outline-none border focus:border-blue-500 text-slate-900 dark:text-white" autoFocus />
                            <input value={newCompanyGst} onChange={(e) => setNewCompanyGst(e.target.value.toUpperCase())} placeholder="GSTIN (Optional)" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold mb-4 outline-none border focus:border-blue-500 text-slate-900 dark:text-white" />
                            <div className="flex gap-3">
                                <button onClick={() => setShowCreateDialog(false)} className="flex-1 p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold text-xs uppercase tracking-widest">Cancel</button>
                                <button onClick={createNewCompany} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest">Create</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Footer Branding */}
            <div className="mt-12 mb-8 text-center opacity-40">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface">
                    Made with <span className="text-red-500 animate-pulse">❤️</span> by Lavneet
                </p>
            </div>

            {/* Backup Settings Modal */}
            {showBackupSettings && (
                <BackupSettings onClose={() => setShowBackupSettings(false)} />
            )}
        </div>
    );
};

export default Dashboard;
