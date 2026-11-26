import React, { useState, useMemo, useCallback, memo, useEffect } from 'react';
import { Invoice, VoucherType } from '../types';
import { StorageService } from '../services/storageService';
import { AnalyticsService } from '../services/analyticsService';
import { Search, MoreVertical, FileText, Trash2, Users, Edit, Eye, ChevronRight, Plus, Download, BookOpen, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HapticService } from '../services/hapticService';
import { useCompany } from '../contexts/CompanyContext';
import { InvoicePdfService } from '../services/invoicePdfService';
import { isLowEndDevice, debounce } from '../utils/performance';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import SmartCalcHelpModal from '../components/SmartCalcHelpModal';
import { WorkspaceFilters, WorkspaceHeading, WorkspaceMetrics, workspace, workspaceMoney } from '../components/WorkspaceUI';
import { localDay, inReportRange } from '../services/businessReports';
import { getInvoicePaid } from '../services/paymentAllocation';

// Check device capability once
const IS_LOW_END = isLowEndDevice();
const PAGE_SIZE = IS_LOW_END ? 15 : 30;

interface AllInvoicesProps {
  onBack?: () => void;
  invoices?: Invoice[];
  title?: string;
  createLabel?: string;
  initialDocFilter?: VoucherType | 'ALL';
  onView?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoice: Invoice) => void;
  onViewLedger?: (customerId: string) => void;
  onCreate?: () => void;
  onConverted?: (newInvoice: Invoice) => void;
}

// Analytics tracking wrapper
const trackAnalytics = (action: string, metadata: any = {}) => {
  const page = window.location.pathname;
  // Only track if userId is available
  const userId = StorageService.getUserId ? StorageService.getUserId() : undefined;
  const companyId = StorageService.getCompanyId ? StorageService.getCompanyId() : undefined;
  if (userId && companyId) {
    AnalyticsService.trackAction(action, page, metadata, userId, companyId);
  } else {
    // Store for later when auth is ready
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem('pending_analytics') || '[]';
      const arr = JSON.parse(existing);
      arr.push({ action, metadata, timestamp: Date.now() });
      localStorage.setItem('pending_analytics', JSON.stringify(arr));
    }
  }
};

const paymentFilters = [
  { id: 'ALL', label: 'All statuses' }, { id: 'PAID', label: 'Paid' },
  { id: 'PENDING', label: 'Pending' }, { id: 'PARTIAL', label: 'Part-paid' }, { id: 'OVERDUE', label: 'Overdue' },
] as const;
type PaymentFilter = typeof paymentFilters[number]['id'];

const InvoiceCard = memo(({ invoice, onView, onMenuOpen }: {
  invoice: Invoice; onView?: (invoice: Invoice) => void; onMenuOpen: (invoice: Invoice) => void;
}) => {
  const isReturn = invoice.type === 'CREDIT_NOTE' || invoice.type === 'DEBIT_NOTE';
  const isBill = !invoice.type || invoice.type === 'SALE' || invoice.type === 'PURCHASE';
  const badge = isReturn ? 'Return' : isBill ? paymentFilters.find(option => option.id === invoice.status)?.label || 'Pending'
    : invoice.conversionStatus === 'CONVERTED' ? 'Converted' : invoice.conversionStatus === 'CANCELLED' ? 'Cancelled' : 'Open';
  const color = isReturn || invoice.status === 'OVERDUE' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
    : isBill && invoice.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary dark:text-blue-300';
  return <article className={workspace.panel + ' flex items-center gap-1 px-2 sm:px-3'}>
    <button type="button" disabled={!onView} aria-label={'Open bill ' + invoice.invoiceNumber} onClick={() => {
      trackAnalytics('VIEW_INVOICE_ITEM', { invoiceId: invoice.id });
      onView?.(invoice);
    }} className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-surface-container-low sm:gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText size={17} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{invoice.customerName || 'Walk-in'}</span>
        <span className="block break-words text-xs text-muted-foreground">{invoice.invoiceNumber} · {formatDate(invoice.date)}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums"><span className="block text-sm font-bold">{workspaceMoney(Number(invoice.total))}</span>
        <span className={'inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ' + color}>{badge}</span></span>
    </button>
    <button type="button" aria-label={'Actions for bill ' + invoice.invoiceNumber} className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-container-low sm:w-10" onClick={() => {
      HapticService.light();
      onMenuOpen(invoice);
    }}><MoreVertical size={18} /></button>
  </article>;
});

InvoiceCard.displayName = 'InvoiceCard';

const AllInvoices: React.FC<AllInvoicesProps> = ({
  invoices: propInvoices,
  title = 'Invoices',
  createLabel = 'Add Invoice',
  initialDocFilter = 'ALL',
  onView,
  onEdit,
  onDelete,
  onViewLedger,
  onCreate,
  onBack,
  onConverted
}) => {
  const [docFilter, setDocFilter] = useState<VoucherType | 'ALL'>(initialDocFilter);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setDocFilter(initialDocFilter);
  }, [initialDocFilter]);

  const invoices = useMemo(() => {
    if (propInvoices && docFilter === 'ALL') return propInvoices;
    if (docFilter !== 'ALL') return StorageService.getVouchersByType(docFilter);
    return StorageService.getAllVouchers();
  }, [propInvoices, docFilter, refreshTick]);

  const filteredSalesInvoices = title === 'Sales' && docFilter === 'ALL'
    ? invoices.filter(inv => !inv.type || inv.type === 'SALE')
    : invoices;

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month'>('all');
  const [selectedForAction, setSelectedForAction] = useState<Invoice | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { company } = useCompany();
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Debounced search
  const handleSearchChange = useMemo(() => debounce((value: string) => setDebouncedSearch(value), 300), []);

  const onSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    handleSearchChange(value);
  }, [handleSearchChange]);

  // Memoized filtered list
  const filteredInvoices = useMemo(() => {
    return filteredSalesInvoices.filter(inv => {
      const matchesSearch =
        (inv.customerName || '').toLowerCase().includes(debouncedSearch.trim().toLowerCase()) ||
        (inv.invoiceNumber || '').toLowerCase().includes(debouncedSearch.trim().toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
      const today = localDay();
      const matchesDate = dateFilter === 'all' || inReportRange(inv.date, dateFilter === 'today' ? today : today.slice(0, 8) + '01', today);
      return matchesSearch && matchesStatus && matchesDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSalesInvoices, debouncedSearch, statusFilter, dateFilter]);

  // Visible items
  const visibleInvoices = useMemo(() => filteredInvoices.slice(0, visibleCount), [filteredInvoices, visibleCount]);
  const hasMore = visibleCount < filteredInvoices.length;

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, []);

  const handleDelete = useCallback((inv: Invoice) => {
    setInvoiceToDelete(inv);
    trackAnalytics('DELETE_INVOICE', { invoiceId: inv.id, customerName: inv.customerName });
  }, []);

  const confirmDelete = async () => {
    if (invoiceToDelete) {
      if (onDelete) { onDelete(invoiceToDelete); setRefreshTick(tick => tick + 1); }
      else {
        StorageService.deleteInvoice(invoiceToDelete.id);
        window.location.reload();
      }
      setInvoiceToDelete(null);
    }
  };

  const handleMenuOpen = useCallback((inv: Invoice) => {
    setSelectedForAction(inv);
  }, []);

  // Analytics: Track view
  useEffect(() => {
    const userId = StorageService.getUserId ? StorageService.getUserId() : undefined;
    const companyId = StorageService.getCompanyId ? StorageService.getCompanyId() : undefined;
    if (userId && companyId) {
      AnalyticsService.startSession(userId, companyId);
      // Track initial page view
      AnalyticsService.trackPageView(window.location.pathname, userId, companyId);
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <div className={workspace.page}>
        <WorkspaceHeading title={title} onBack={onBack} actions={<>
          {onCreate && <button type="button" onClick={onCreate} className={workspace.primary}><Plus size={16} /> {createLabel}</button>}
          <button type="button" aria-label="Smart Calculator help" onClick={() => setShowHelp(true)} className={workspace.secondary}><BookOpen size={16} /></button>
        </>} />
        <WorkspaceMetrics values={[
          { label: 'Documents', value: filteredInvoices.length },
          { label: 'Document total', value: workspaceMoney(filteredInvoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0)) },
          ...((title === 'Sales' && docFilter !== 'CREDIT_NOTE' || title === 'Purchases') ? [{
            label: title === 'Purchases' ? 'Balance to pay' : 'Balance to collect', tone: 'attention' as const,
            value: workspaceMoney(filteredInvoices.reduce((sum, invoice) => sum + (invoice.status === 'PAID' ? 0 : Math.max(0, Number(invoice.balanceDue ?? Number(invoice.total) - getInvoicePaid(invoice)) || 0)), 0)),
          }] : []),
        ]} />
        {title === 'Sales' && <WorkspaceFilters<VoucherType | 'ALL'> label="Sales documents" value={docFilter} onChange={value => { setDocFilter(value); setStatusFilter('ALL'); setVisibleCount(PAGE_SIZE); }} options={[
          { id: 'ALL', label: 'Sales invoices' }, { id: 'CREDIT_NOTE', label: 'Sales returns' },
        ]} />}
        <div className={workspace.panel + ' space-y-2 p-3'}>
          <label className="relative block">
            <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" />
            <input type="search" aria-label="Search bills" placeholder="Party or bill number" className={workspace.input + ' pl-9'} value={searchTerm} onChange={onSearchInput} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <WorkspaceFilters<'all' | 'today' | 'month'> label="Document period" value={dateFilter} onChange={setDateFilter} options={[
              { id: 'all', label: 'All dates' }, { id: 'today', label: 'Today' }, { id: 'month', label: 'This month' },
            ]} />
          </div>
          {((title === 'Sales' && docFilter !== 'CREDIT_NOTE') || title === 'Purchases') && <WorkspaceFilters<PaymentFilter> label="Bill status" value={statusFilter} onChange={setStatusFilter} options={paymentFilters} />}
        </div>
        <div className="space-y-2" aria-label={title + ' documents'}>
          {visibleInvoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} onView={onView} onMenuOpen={handleMenuOpen} />)}
          {hasMore && <button type="button" onClick={loadMore} className={workspace.secondary + ' w-full'}>Load more <ChevronRight size={16} /></button>}
          {!filteredInvoices.length && <div role="status" className={workspace.panel + ' p-10 text-center text-sm text-muted-foreground'}>No documents match these filters.</div>}
        </div>
      </div>

      {/* Premium Bottom Action Sheet */}
      <AnimatePresence>
        {selectedForAction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedForAction(null)}
              className="fixed inset-0 bg-black/60 z-[100]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 z-[101] rounded-t-[32px] shadow-2xl overflow-hidden pb-8"
            >
              <div className="flex justify-center py-3">
                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
              </div>

              <div className="px-6 py-4 flex items-center gap-4 border-b border-slate-50 dark:border-slate-800/50">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-lg font-black font-heading text-slate-900 dark:text-slate-100 tracking-tight">
                    {selectedForAction.customerName}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Invoice: #{selectedForAction.invoiceNumber} • {selectedForAction.status}
                  </p>
                </div>
              </div>

              <div className="px-4 py-4 space-y-2">
                <button
                  onClick={() => {
                    onView && onView(selectedForAction);
                    setSelectedForAction(null);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <Eye className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-base">View Details</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">View or print breakdown</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>

                <button
                  onClick={async () => {
                    if (company && selectedForAction) {
                      const customer = StorageService.getCustomers().find(c => c.id === selectedForAction.customerId) || null;
                      await InvoicePdfService.generatePDF(selectedForAction, company as any, customer);
                      setSelectedForAction(null);
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Download className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Download PDF</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Save as PDF file</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>

                <button
                  onClick={() => {
                    onViewLedger && onViewLedger(selectedForAction.customerId);
                    setSelectedForAction(null);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Customer Ledger</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Statement & history</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>

                <button
                  onClick={() => {
                    onEdit && onEdit(selectedForAction);
                    setSelectedForAction(null);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                    <Edit className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Edit Document</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Modify balance or items</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>

                {selectedForAction.conversionStatus !== 'CONVERTED' && ['QUOTATION', 'PROFORMA', 'DELIVERY_CHALLAN', 'PURCHASE_ORDER'].includes(selectedForAction.type || '') && (
                  <button
                    onClick={() => {
                      const targetType: VoucherType = selectedForAction.type === 'PURCHASE_ORDER' ? 'PURCHASE' : 'SALE';
                      const converted = StorageService.convertVoucher(selectedForAction.id, targetType);
                      setSelectedForAction(null);
                      setRefreshTick(t => t + 1);
                      if (converted && onConverted) onConverted(converted);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0">
                      <ArrowRightLeft className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400 text-base">
                        {selectedForAction.type === 'PURCHASE_ORDER' ? 'Convert to Purchase' : 'Convert to Tax Invoice'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">1-tap auto convert without duplicating stock</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-emerald-300" />
                  </button>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => {
                      handleDelete(selectedForAction);
                      setSelectedForAction(null);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-[24px] hover:bg-red-50 dark:hover:bg-red-900/10 transition-all group active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-red-600 text-base">Delete document</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-red-200 group-hover:text-red-400 transition-colors" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete document?"
        message="Remove this document from the active list?"
        confirmText="Delete"
        variant="danger"
      />

      {/* Smart Calculator Help Modal */}
      <SmartCalcHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
};

export default AllInvoices;
