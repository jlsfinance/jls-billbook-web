import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '../../components/Sidebar';
import MobileBottomNav from '../../components/MobileBottomNav';
import type { QuickCreateAction } from '../../components/MobileBottomNav';
import InvoiceView from '../../components/InvoiceView';
import CreateInvoice from '../../components/CreateInvoice';
import CreatePurchase from '../../components/CreatePurchase';
import SmartCalculator from './pages/SmartCalculator';
import CreditNote from './pages/CreditNote'; // Added
import AllInvoices from '../../pages/AllInvoices';
import Inventory from '../../components/Inventory';
import StockIn from '../../components/StockIn';
import Customers from '../../components/Customers';
import Settings from '../../components/Settings';
import Daybook from '../../components/Daybook';
import Expenses from '../../components/Expenses';
import Payments from '../../components/Payments';
import Import from '../../components/Import';

import Dashboard from '../../components/Dashboard';
import Reports from '../../components/Reports';
import { PublicBillView } from '../../components/PublicBillView';
import { BackupSettings } from '../../components/BackupSettings';
import POSBilling from '../../components/POSBilling';
import CashAndBank from '../../components/CashAndBank';
import GodownManager from '../../components/GodownManager';
import BarcodeLabelGenerator from '../../components/BarcodeLabelGenerator';
import PaymentReminderCenter from '../../components/PaymentReminderCenter';
import ComplianceCenter from '../../components/ComplianceCenter';
import AccountantExport from '../../components/AccountantExport';
import CustomerEngagement from '../../components/CustomerEngagement';
import OnlineStoreManager from '../../components/OnlineStoreManager';
import AutomatedBills from '../../components/AutomatedBills';
import StaffAndRoles from '../../components/StaffAndRoles';
import RecycleBin from '../../components/RecycleBin';
import MoreHub from '../../components/MoreHub';
import { ViewState, Invoice, VoucherType, type Payment } from '@/types';
import { StorageService } from '../../services/storageService';
import { FirebaseService } from '../../services/firebaseService';
import { WhatsAppService } from '../../services/whatsappService';
import { Menu as SidebarIcon, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useTheme } from 'next-themes';
import { HapticService } from '@/services/hapticService';
import { CompanyForm } from '@/components/CompanyForm';
import Auth from '@/components/Auth';
import { PermissionErrorModal } from '@/components/PermissionErrorModal';
import { WhatsAppNumberModal } from '@/components/WhatsAppNumberModal';
import { SearchProvider } from '@/contexts/SearchContext';
import GlobalSearch from '@/components/GlobalSearch';

const STARTUP_WAIT_MS = 12_000;

function StartupScreen({ phase, failed = false }: { phase: string; failed?: boolean }) {
    const [takingLonger, setTakingLonger] = useState(false);

    useEffect(() => {
        if (failed) return;
        const timeout = window.setTimeout(() => setTakingLonger(true), STARTUP_WAIT_MS);
        return () => window.clearTimeout(timeout);
    }, [failed]);

    const canRetry = failed || takingLonger;
    return (
        <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-white px-6 text-center dark:bg-slate-950">
            <div className="relative">
                <div className="flex h-20 w-20 rotate-12 items-center justify-center rounded-3xl bg-blue-600 shadow-2xl shadow-blue-500/20">
                    <SidebarIcon className="h-10 w-10 -rotate-12 text-white" />
                </div>
                <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white bg-emerald-500 dark:border-slate-950">
                    <div className={`h-2 w-2 rounded-full bg-white ${canRetry ? '' : 'motion-safe:animate-ping'}`} />
                </div>
            </div>
            <div className="max-w-sm space-y-2">
                <h1 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 dark:text-white">JLS Suite</h1>
                <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
                    {failed ? `Could not load ${phase}.` : takingLonger ? `Loading ${phase} is taking longer than expected.` : `Loading ${phase}…`}
                </p>
            </div>
            {canRetry && <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Retry</button>}
        </div>
    );
}

const AccountingApp: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const { company, loading: companyLoading, loadFailed: companyLoadFailed, permissionError } = useCompany();
    const { theme, setTheme } = useTheme();

    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    // const [invoices, setInvoices] = useState<Invoice[]>([]); // Removed unused
    const [purchases, setPurchases] = useState<Invoice[]>([]); // Added
    const [publicBillId, setPublicBillId] = useState<string | null>(null);
    const dataUserId = user && user.uid !== 'demo-local' ? user.uid : null;
    const dataCompanyId = user ? company?.id ?? '' : '';
    const dataScope = JSON.stringify([dataUserId, dataCompanyId]);
    const [loadedScope, setLoadedScope] = useState<string | null>(null);
    const [failedScope, setFailedScope] = useState<string | null>(null);
    const isInitializing = loadedScope !== dataScope;
    const [isCloudConnected, setIsCloudConnected] = useState(false);
    const [showImport, setShowImport] = useState(false);
    // const [selectedDaybookDate, setSelectedDaybookDate] = useState<string | null>(null); // Removed unused
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [startSmartCalc, setStartSmartCalc] = useState(false);
    const [startAI, setStartAI] = useState(false);
    const [paymentCreateDirection, setPaymentCreateDirection] = useState<'RECEIVED' | 'PAID' | null>(null);
    const clearPaymentCreate = React.useCallback(() => setPaymentCreateDirection(null), []);
    const [showPostSaveActions, setShowPostSaveActions] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [pendingShareInvoice, setPendingShareInvoice] = useState<Invoice | null>(null);
    const [showBackupSettings, setShowBackupSettings] = useState(false);
    const [activeVoucherType, setActiveVoucherType] = useState<VoucherType>('SALE');

    useEffect(() => {
        if (authLoading || (user && (companyLoading || companyLoadFailed || permissionError))) return;
        let cancelled = false;
        const initApp = async () => {
            try {
                await StorageService.init(dataUserId, dataCompanyId);
                if (cancelled) return;
                // setInvoices(StorageService.getInvoices());
                setPurchases(StorageService.getPurchases()); // Added

                // Check cloud status
                const hasConfig = !!StorageService.getFirebaseConfig();
                const isReady = FirebaseService.isReady();
                setIsCloudConnected(hasConfig && isReady);

                // Handle Deep Links
                const path = window.location.pathname;
                if (path.startsWith('/view/')) {
                    const invoiceId = path.split('/')[2];
                    if (invoiceId) {
                        setPublicBillId(invoiceId);
                        setCurrentView(ViewState.PUBLIC_VIEW_INVOICE);
                    }
                } else if (path.startsWith('/customer/')) {
                    const parts = path.split('/');
                    const custId = parts[2];
                    if (custId && parts[3] === 'ledger') {
                        setSelectedCustomerId(custId);
                        setCurrentView(ViewState.CUSTOMER_LEDGER);
                    }
                }
                setLoadedScope(dataScope);
            } catch (error) {
                if (cancelled) return;
                console.error('Could not load billing records:', error);
                setFailedScope(dataScope);
            }
        };
        initApp();
        return () => { cancelled = true; };
    }, [authLoading, user, companyLoading, companyLoadFailed, permissionError, dataUserId, dataCompanyId, dataScope]);


    useEffect(() => {
        if (!isInitializing) {
            // setInvoices(StorageService.getInvoices());
            setPurchases(StorageService.getPurchases()); // Added
        }
    }, [currentView, isInitializing]);

    const handleViewInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setCurrentView(ViewState.VIEW_INVOICE);
    };

    const handleViewCustomerLedger = (customerId: string) => {
        setSelectedCustomerId(customerId);
        setCurrentView(ViewState.CUSTOMER_LEDGER);
    };

    const isPurchaseBill = (invoice: Invoice) => invoice.type === 'PURCHASE'
        || (!invoice.type && StorageService.getPurchases().some(purchase => purchase.id === invoice.id));

    const handleEditInvoice = (invoice: Invoice) => {
        setInvoiceToEdit(invoice);
        setCurrentView(isPurchaseBill(invoice) ? ViewState.EDIT_PURCHASE : ViewState.EDIT_INVOICE);
    };

    const handleSaveInvoice = (invoice: Invoice, showActions = false, linkedPayment?: Payment) => {
        if (currentView === ViewState.EDIT_INVOICE) {
            StorageService.updateVoucher(invoice);
        } else {
            const saved = StorageService.saveVoucher(invoice);
            if (!saved.ok) {
                alert('error' in saved && saved.error ? saved.error : 'The invoice could not be saved.');
                return;
            }
        }
        if (linkedPayment) StorageService.savePayment(linkedPayment);

        // Refresh Data
        // setInvoices(StorageService.getInvoices());
        // setCustomers(StorageService.getCustomers()); // Balance updates - This state is not defined in the current scope.
        // ... (rest depends on context, usually re-fetching is good)

        // Show Actions if requested (Print/Share)
        if (showActions) {
            // setLastSavedInvoice(invoice); // This state is not defined in the current scope.
            // setShowInvoiceActions(true); // This state is not defined in the current scope.
            setSelectedInvoice(linkedPayment ? StorageService.getInvoices().find(item => item.id === invoice.id) || invoice : invoice);
            setShowPostSaveActions(true); // Use existing state for post save actions
            setCurrentView(ViewState.VIEW_INVOICE); // Stay on view invoice to show actions
        } else {
            setCurrentView(ViewState.DASHBOARD);
        }

        // Reset Edit State
        setInvoiceToEdit(null);
        setStartSmartCalc(false);
        setSelectedCustomerId(null);
    };

    // Purchase Handlers
    const handleSavePurchase = (purchase: Invoice) => {
        if (currentView === ViewState.EDIT_PURCHASE) {
            StorageService.updatePurchase(purchase);
        } else {
            if (StorageService.getPurchases(true).some(record => record.id === purchase.id)) return;
            const paidAmount = purchase.paidAmount ?? 0;
            if (paidAmount > 0) {
                StorageService.savePurchase({ ...purchase, status: 'PENDING', paidAmount: 0, balanceDue: purchase.total });
                StorageService.savePayment({
                    id: crypto.randomUUID(),
                    customerId: purchase.customerId,
                    invoiceId: purchase.id,
                    invoiceNumber: purchase.invoiceNumber,
                    date: purchase.date,
                    amount: paidAmount,
                    mode: 'CASH',
                    type: 'PAID',
                    reference: 'Purchase Entry',
                    note: `Payment for purchase ${purchase.invoiceNumber}`,
                });
            } else {
                StorageService.savePurchase(purchase);
            }
        }
        setPurchases(StorageService.getPurchases());
        setCurrentView(ViewState.PURCHASES);
        setInvoiceToEdit(null); // Reuse this state or create new one? reuse is risky if typing mismatch
        // Actually CreateInvoice uses `invoiceToEdit` state. CreatePurchase uses `initialPurchase`.
        // I should stick to `invoiceToEdit` but cast it, or create `purchaseToEdit`.
        // Let's use `invoiceToEdit` since Invoice type is same.
    };

    const handleEditPurchase = (purchase: Invoice) => {
        setInvoiceToEdit(purchase);
        setCurrentView(ViewState.EDIT_PURCHASE);
    };



    const handleDeleteInvoice = (invoice: Invoice) => {
        StorageService.deleteInvoice(invoice.id);
        // setInvoices(StorageService.getInvoices());
        if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
    };

    const handleDeletePurchase = (purchase: Invoice) => {
        StorageService.deletePurchase(purchase.id);
        setPurchases(StorageService.getPurchases());
        if (selectedInvoice?.id === purchase.id) setSelectedInvoice(null);
    };

    const handleOpenAI = () => {
        setStartAI(true);
        setShowImport(true);
    };


    if (authLoading) return <StartupScreen key="session" phase="your session" />;
    if (user && (companyLoading || companyLoadFailed)) return <StartupScreen key="companies" phase="your companies" failed={companyLoadFailed} />;
    if (permissionError) {
        return <PermissionErrorModal />;
    }
    if (isInitializing) return <StartupScreen key={dataScope} phase="your billing records" failed={failedScope === dataScope} />;

    if (!user && currentView !== ViewState.PUBLIC_VIEW_INVOICE) {
        return <Auth />;
    }

    if (!company && currentView !== ViewState.PUBLIC_VIEW_INVOICE) {
        return <CompanyForm />;
    }

    const handleCreateNew = () => {
        setInvoiceToEdit(null);
        setStartSmartCalc(false);
        setSelectedCustomerId(null); // Ensure no customer is pre-selected for generic create
        setCurrentView(ViewState.CREATE_INVOICE);
    };

    const handleQuickCreate = (action: QuickCreateAction) => {
        if (action === 'SALE') {
            handleCreateNew();
            return;
        }

        setInvoiceToEdit(null);
        setStartSmartCalc(false);
        setSelectedCustomerId(null);
        if (action === 'RECEIVED' || action === 'PAID') {
            setPaymentCreateDirection(action);
            setCurrentView(ViewState.PAYMENTS);
            return;
        }
        if (action === 'POS' || action === 'PURCHASE' || action === 'CREDIT_NOTE') {
            const entry = { POS: ViewState.POS_BILLING, PURCHASE: ViewState.CREATE_PURCHASE, CREDIT_NOTE: ViewState.CREATE_CREDIT_NOTE };
            setCurrentView(entry[action]);
            return;
        }
        setActiveVoucherType(action);
        setCurrentView(ViewState.CREATE_VOUCHER);
    };

    const handleOpenSmartCalc = () => {
        setInvoiceToEdit(null);
        setStartSmartCalc(false); // Reset this flag as we are using dedicated view now
        setSelectedCustomerId(null);
        setCurrentView(ViewState.SMART_CALCULATOR);
    }

    // Handler for search result selection
    const handleSearchSelectInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setCurrentView(ViewState.VIEW_INVOICE);
    };

    const handleSearchSelectCustomer = (customer: any) => {
        setSelectedCustomerId(customer.id);
        setCurrentView(ViewState.CUSTOMER_LEDGER);
    };

    return (
        <SearchProvider>
            <div
                className="flex h-screen h-[100dvh] w-full bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans flex-col md:flex-row"
            >
                {/* Global Search - Scroll Direction Based */}
                <GlobalSearch
                    onSelectInvoice={handleSearchSelectInvoice}
                    onSelectCustomer={handleSearchSelectCustomer}
                />
                {/* Sidebar - Desktop (Static) & Mobile (Drawer) */}
                <div
                    className={`
          fixed inset-0 z-[100] md:relative md:z-auto
          ${isSidebarOpen ? 'flex' : (['VIEW_INVOICE', 'CREATE_INVOICE', 'EDIT_INVOICE', 'PUBLIC_VIEW_INVOICE', 'CREATE_PURCHASE', 'EDIT_PURCHASE', 'SMART_CALCULATOR', 'CREDIT_NOTE', 'CREATE_CREDIT_NOTE', 'CUSTOMER_LEDGER', 'REPORTS'].includes(currentView) ? 'hidden' : 'hidden md:flex')}
        `}
                >
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-md md:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                    <div className="relative h-full animate-in slide-in-from-left duration-300">
                        <Sidebar
                            currentView={currentView}
                            isOpen={isSidebarOpen}
                            onClose={() => setIsSidebarOpen(false)}
                            isCloudConnected={isCloudConnected}
                            onNavigate={(view) => {
                                if (view === ViewState.CREATE_INVOICE) {
                                    setInvoiceToEdit(null);
                                    setStartSmartCalc(false);
                                    setSelectedCustomerId(null);
                                }
                                if (view === ViewState.IMPORT) {
                                    setShowImport(true);
                                } else {
                                    setCurrentView(view);
                                }
                                setIsSidebarOpen(false);
                            }}
                            onOpenBackup={() => setShowBackupSettings(true)}
                        />
                    </div>
                </div>

                <main className="flex-1 overflow-y-auto h-full relative w-full scroll-smooth bg-slate-50 dark:bg-slate-900 pb-20 lg:pb-0">
                    {!['DASHBOARD', 'VIEW_INVOICE', 'CREATE_INVOICE', 'EDIT_INVOICE', 'CREATE_VOUCHER', 'PUBLIC_VIEW_INVOICE', 'CREATE_PURCHASE', 'EDIT_PURCHASE', 'SMART_CALCULATOR', 'CREDIT_NOTE', 'CREATE_CREDIT_NOTE', 'CUSTOMER_LEDGER', 'REPORTS', 'POS_BILLING', 'CASH_AND_BANK', 'GODOWNS', 'BARCODE_LABELS', 'ONLINE_STORE', 'PAYMENT_REMINDERS', 'AUTOMATED_BILLS', 'COMPLIANCE_CENTER', 'STAFF_ROLES', 'RECYCLE_BIN'].includes(currentView) && (
                        <div className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                            <div className="h-16 px-4 flex items-center justify-between">
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
                                >
                                    <SidebarIcon className="w-6 h-6" />
                                </button>
                                <div className="flex-1 text-center px-4 overflow-hidden">
                                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter truncate leading-tight">
                                        {company?.name || 'JLS Suite'}
                                    </h2>
                                    <p className="text-[9px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest leading-tight">
                                        {currentView.replace('_', ' ')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setTheme(theme === 'dark' ? 'light' : 'dark');
                                        HapticService.medium();
                                    }}
                                    className="p-2 -mr-2 rounded-xl text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
                                >
                                    {theme === 'dark' ? <Sun className="w-6 h-6 text-yellow-500" /> : <Moon className="w-6 h-6 text-blue-600" />}
                                </button>
                            </div>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentView}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full"
                        >

                            {currentView === ViewState.DASHBOARD && (
                                <Dashboard
                                    onCreateInvoice={() => { setActiveVoucherType('SALE'); handleCreateNew(); }}
                                    onCreateCreditNote={() => setCurrentView(ViewState.CREATE_CREDIT_NOTE)}
                                    onViewInvoice={handleViewInvoice}
                                    onOpenReports={() => setCurrentView(ViewState.REPORTS)}
                                    onOpenSmartCalc={handleOpenSmartCalc}
                                    onOpenAI={handleOpenAI}
                                    onReceivePayment={() => handleQuickCreate('RECEIVED')}
                                    onToggleSidebar={() => setIsSidebarOpen(true)}
                                    onNavigate={(view, voucherType) => {
                                        if (voucherType) setActiveVoucherType(voucherType);
                                        if (view === ViewState.CREATE_INVOICE || view === ViewState.CREATE_VOUCHER) {
                                            setInvoiceToEdit(null);
                                            setStartSmartCalc(false);
                                            setSelectedCustomerId(null);
                                        }
                                        setCurrentView(view);
                                    }}
                                />
                            )}

                            {currentView === ViewState.INVENTORY && (
                                <Inventory
                                    onOpenStockIn={() => setCurrentView(ViewState.STOCK_IN)}
                                    onOpenBarcodeLabels={() => setCurrentView(ViewState.BARCODE_LABELS)}
                                />
                            )}
                            {currentView === ViewState.STOCK_IN && (
                                <StockIn onBack={() => setCurrentView(ViewState.INVENTORY)} />
                            )}
                            {(currentView === ViewState.CUSTOMERS || currentView === ViewState.CUSTOMER_LEDGER) && (
                                <Customers
                                    onEditInvoice={handleEditInvoice}
                                    initialCustomerId={currentView === ViewState.CUSTOMER_LEDGER ? selectedCustomerId || undefined : undefined}
                                    onBack={() => {
                                        setCurrentView(ViewState.DASHBOARD);
                                        setSelectedCustomerId(null);
                                    }}
                                />
                            )}
                            {currentView === ViewState.DAYBOOK && <Daybook onViewCustomerLedger={handleViewCustomerLedger} />}
                            {currentView === ViewState.EXPENSES && <Expenses onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.PAYMENTS && <Payments onBack={() => setCurrentView(ViewState.DASHBOARD)} createDirection={paymentCreateDirection} onCreateOpened={clearPaymentCreate} />}
                            {currentView === ViewState.REPORTS && <Reports onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {(currentView === ViewState.ALL_INVOICES || currentView === ViewState.INVOICES) && (
                                <AllInvoices
                                    title="Sales"
                                    createLabel="Add Sale"
                                    onCreate={() => { setActiveVoucherType('SALE'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_INVOICE); }}
                                    onView={handleViewInvoice}
                                    onEdit={handleEditInvoice}
                                    onDelete={handleDeleteInvoice}
                                    onViewLedger={handleViewCustomerLedger}
                                    onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }}
                                />
                            )}
                            {currentView === ViewState.PURCHASES && <AllInvoices title="Purchases" createLabel="Add Purchase" invoices={purchases} onCreate={() => setCurrentView(ViewState.CREATE_PURCHASE)} onView={handleViewInvoice} onEdit={handleEditPurchase} onDelete={handleDeletePurchase} onViewLedger={handleViewCustomerLedger} />}
                            {currentView === ViewState.QUOTATIONS && (
                                <AllInvoices title="Quotations" createLabel="New Quotation" initialDocFilter="QUOTATION" onCreate={() => { setActiveVoucherType('QUOTATION'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_VOUCHER); }} onView={handleViewInvoice} onEdit={handleEditInvoice} onDelete={handleDeleteInvoice} onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }} />
                            )}
                            {currentView === ViewState.PROFORMA_INVOICES && (
                                <AllInvoices title="Proforma Invoices" createLabel="New Proforma" initialDocFilter="PROFORMA" onCreate={() => { setActiveVoucherType('PROFORMA'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_VOUCHER); }} onView={handleViewInvoice} onEdit={handleEditInvoice} onDelete={handleDeleteInvoice} onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }} />
                            )}
                            {currentView === ViewState.DELIVERY_CHALLANS && (
                                <AllInvoices title="Delivery Challans" createLabel="New Challan" initialDocFilter="DELIVERY_CHALLAN" onCreate={() => { setActiveVoucherType('DELIVERY_CHALLAN'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_VOUCHER); }} onView={handleViewInvoice} onEdit={handleEditInvoice} onDelete={handleDeleteInvoice} onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }} />
                            )}
                            {currentView === ViewState.PURCHASE_ORDERS && (
                                <AllInvoices title="Purchase Orders" createLabel="New PO" initialDocFilter="PURCHASE_ORDER" onCreate={() => { setActiveVoucherType('PURCHASE_ORDER'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_VOUCHER); }} onView={handleViewInvoice} onEdit={handleEditInvoice} onDelete={handleDeletePurchase} onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }} />
                            )}
                            {currentView === ViewState.DEBIT_NOTES && (
                                <AllInvoices title="Debit Notes" createLabel="New Debit Note" initialDocFilter="DEBIT_NOTE" onCreate={() => { setActiveVoucherType('DEBIT_NOTE'); setInvoiceToEdit(null); setCurrentView(ViewState.CREATE_VOUCHER); }} onView={handleViewInvoice} onEdit={handleEditInvoice} onDelete={handleDeletePurchase} />
                            )}
                            {currentView === ViewState.SETTINGS && <Settings />}

                            {currentView === ViewState.POS_BILLING && <POSBilling onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.CASH_AND_BANK && <CashAndBank onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.GODOWNS && <GodownManager onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.BARCODE_LABELS && <BarcodeLabelGenerator onBack={() => setCurrentView(ViewState.INVENTORY)} />}
                            {currentView === ViewState.ONLINE_STORE && <OnlineStoreManager key={company?.id} onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.PAYMENT_REMINDERS && <PaymentReminderCenter onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.AUTOMATED_BILLS && <AutomatedBills onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.COMPLIANCE_CENTER && <ComplianceCenter onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.ACCOUNTANT_EXPORT && <AccountantExport onBack={() => setCurrentView(ViewState.MORE_HUB)} />}
                            {currentView === ViewState.CUSTOMER_ENGAGEMENT && <CustomerEngagement onBack={() => setCurrentView(ViewState.MORE_HUB)} />}
                            {currentView === ViewState.STAFF_ROLES && <StaffAndRoles onBack={() => setCurrentView(ViewState.DASHBOARD)} onOpenAccountant={() => setCurrentView(ViewState.ACCOUNTANT_EXPORT)} />}
                            {currentView === ViewState.RECYCLE_BIN && <RecycleBin onBack={() => setCurrentView(ViewState.DASHBOARD)} />}
                            {currentView === ViewState.MORE_HUB && (
                                <MoreHub onNavigate={(view, voucherType) => {
                                    if (voucherType) setActiveVoucherType(voucherType);
                                    setCurrentView(view);
                                }} />
                            )}

                            {currentView === ViewState.VIEW_INVOICE && selectedInvoice && (
                                <InvoiceView
                                    invoice={selectedInvoice}
                                    onBack={() => { setSelectedInvoice(null); setCurrentView(ViewState.DASHBOARD); }}
                                    onEdit={() => handleEditInvoice(selectedInvoice)}
                                    onConverted={(conv) => { setSelectedInvoice(conv); setCurrentView(ViewState.VIEW_INVOICE); }}
                                    onDelete={(inv) => {
                                        if (isPurchaseBill(inv) || inv.type === 'PURCHASE_ORDER' || inv.type === 'DEBIT_NOTE') handleDeletePurchase(inv);
                                        else handleDeleteInvoice(inv);
                                        setSelectedInvoice(null);
                                        setCurrentView(ViewState.DASHBOARD);
                                    }}
                                    showPostSaveActions={showPostSaveActions}
                                    onClosePostSaveActions={() => setShowPostSaveActions(false)}
                                />
                            )}




                            {(currentView === ViewState.CREATE_INVOICE || currentView === ViewState.EDIT_INVOICE || currentView === ViewState.CREATE_CREDIT_NOTE || currentView === ViewState.CREATE_VOUCHER) && (
                                <CreateInvoice
                                    initialInvoice={invoiceToEdit}
                                    initialCustomerId={selectedCustomerId || undefined}
                                    voucherType={currentView === ViewState.CREATE_VOUCHER ? activeVoucherType : 'SALE'}
                                    startSmartCalc={startSmartCalc}
                                    onSave={handleSaveInvoice}
                                    onCancel={() => { setCurrentView(ViewState.DASHBOARD); setInvoiceToEdit(null); setStartSmartCalc(false); setSelectedCustomerId(null); }}
                                    isCreditNote={currentView === ViewState.CREATE_CREDIT_NOTE}
                                />
                            )}

                            {(currentView === ViewState.CREATE_PURCHASE || currentView === ViewState.EDIT_PURCHASE) && (
                                <CreatePurchase
                                    initialPurchase={invoiceToEdit}
                                    onSave={handleSavePurchase}
                                    onCancel={() => { setCurrentView(ViewState.PURCHASES); setInvoiceToEdit(null); }}
                                />
                            )}

                            {currentView === ViewState.SMART_CALCULATOR && (
                                <SmartCalculator
                                    onBack={() => setCurrentView(ViewState.DASHBOARD)}
                                    onSaveSuccess={() => {
                                        // Refresh invoice list and maybe go to view it?
                                        // For now just refresh global state if needed
                                        // setInvoices(StorageService.getInvoices());
                                    }}
                                />
                            )}

                            {currentView === ViewState.CREDIT_NOTE && (
                                <CreditNote
                                    onBack={() => setCurrentView(ViewState.DASHBOARD)}
                                    onSaveSuccess={() => {
                                        // setInvoices(StorageService.getInvoices());
                                    }}
                                />
                            )}

                            {currentView === ViewState.PUBLIC_VIEW_INVOICE && publicBillId && (
                                <PublicBillView billId={publicBillId} />
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {showImport && (
                        <Import
                            onClose={() => {
                                setShowImport(false);
                                setStartAI(false);
                                if (currentView === ViewState.IMPORT) setCurrentView(ViewState.DASHBOARD);
                            }}
                            onImportComplete={() => {
                                // setInvoices(StorageService.getInvoices());
                                if (currentView === ViewState.IMPORT) setCurrentView(ViewState.INVENTORY);
                            }}
                            startWithAI={startAI}
                        />
                    )}
                </main>

                {!['VIEW_INVOICE', 'CREATE_INVOICE', 'EDIT_INVOICE', 'CREATE_VOUCHER', 'PUBLIC_VIEW_INVOICE', 'CREATE_PURCHASE', 'EDIT_PURCHASE', 'SMART_CALCULATOR', 'CREDIT_NOTE', 'CREATE_CREDIT_NOTE', 'CUSTOMER_LEDGER', 'REPORTS', 'POS_BILLING', 'CASH_AND_BANK', 'GODOWNS', 'BARCODE_LABELS', 'ONLINE_STORE', 'PAYMENT_REMINDERS', 'AUTOMATED_BILLS', 'COMPLIANCE_CENTER', 'STAFF_ROLES', 'RECYCLE_BIN'].includes(currentView) && (
                    <MobileBottomNav
                        currentView={currentView}
                        onChangeView={(view) => {
                            if (view === ViewState.IMPORT) {
                                setShowImport(true);
                            } else {
                                setCurrentView(view);
                            }
                        }}
                        onCreateAction={handleQuickCreate}
                    />
                )}

                <WhatsAppNumberModal
                    isOpen={showWhatsAppModal}
                    onClose={() => setShowWhatsAppModal(false)}
                    onSubmit={(phone) => {
                        if (pendingShareInvoice) {
                            const customer = StorageService.getCustomers().find(c => c.id === pendingShareInvoice.customerId);
                            const company = StorageService.getCompanyProfile();
                            WhatsAppService.shareInvoice(pendingShareInvoice, customer, company, phone);
                            setPendingShareInvoice(null);
                        }
                    }}
                />

                {/* Backup Settings Modal */}
                {showBackupSettings && (
                    <BackupSettings onClose={() => setShowBackupSettings(false)} />
                )}
            </div>
        </SearchProvider>
    );
};

export default AccountingApp;

