import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WhatsAppNumberModal } from '@/components/WhatsAppNumberModal';
import { InputModal } from '@/components/InputModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { AlertModal } from '@/components/AlertModal';
import { Customer, Invoice, Payment } from '../types';
import { StorageService } from '../services/storageService';
import { WhatsAppService } from '../services/whatsappService';
import { Search, ArrowLeft, Download, X, MessageCircle, Edit, Trash2, Plus, ChevronRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import InvoiceView from './InvoiceView';
import { HapticService } from '@/services/hapticService';
import { ContactsService } from '@/services/contactsService';
import { formatDate } from '../utils/dateUtils';
import { buildPartyLedger, localDay } from '../services/businessReports';
import PartyDateRange, { type PartyRange } from './PartyDateRange';
import PartyLedgerPanel, { isLedgerDebit, type PartyLedgerRow } from './PartyLedgerPanel';
import { WorkspaceFilters, WorkspaceHeading, WorkspaceMetrics, workspace, workspaceMoney } from './WorkspaceUI';

interface CustomersProps {
  onBackToWorkspace?: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onBack?: () => void;
  initialCustomerId?: string;
}

const partyAction = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/30 bg-surface-container-high hover:bg-surface-container-highest focus-visible:ring-2 focus-visible:ring-primary/50';

const Customers: React.FC<CustomersProps> = ({ onEditInvoice, onBack, onBackToWorkspace, initialCustomerId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Use a function to initialize state so it runs only once
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    if (initialCustomerId) {
      const all = StorageService.getCustomers();
      return all.find(c => c.id === initialCustomerId) || null;
    }
    return null;
  });
  const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'PROFILE'>('TRANSACTIONS');

  // Invoice Viewing State
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [pendingShareTx, setPendingShareTx] = useState<PartyLedgerRow['record'] | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [paymentNote, setPaymentNote] = useState('');

  const [range, setRange] = useState<PartyRange>(() => {
    const now = new Date();
    return { from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: localDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  });

  // Add Customer Modal State
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    state: string;
    gstin: string;
    type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
    creditLimit: string;
    creditPeriodDays: string;
    partyCategory: string;
  }>({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    gstin: '',
    type: 'CUSTOMER',
    creditLimit: '',
    creditPeriodDays: '30',
    partyCategory: '',
  });
  const [partyFilter, setPartyFilter] = useState<'ALL' | 'TO_COLLECT' | 'TO_PAY'>('ALL');
  const [groupFilter, setGroupFilter] = useState('');
  const partyGroups = [...new Set(customers.map(customer => customer.partyCategory?.trim() || '').filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const groupOptions = partyGroups.map(group => <option key={group} value={group} />);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'success' | 'danger' | 'info' | 'warning' } | null>(null);

  const showAlert = (title: string, message: string, variant: 'success' | 'danger' | 'info' | 'warning' = 'info') => {
    setAlertConfig({ isOpen: true, title, message, variant });
  };

  const getCurrentGstEnabled = () => {
    const company = StorageService.getCompanyProfile();
    return company.gst_enabled;
  };

  const gstEnabledVal = getCurrentGstEnabled();

  useEffect(() => {
    setCustomers(StorageService.getCustomers());
  }, []);

  const handleViewHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
    setActiveTab('TRANSACTIONS');
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount.', 'warning');
      return;
    }

    const payment: Payment = {
      id: crypto.randomUUID(),
      customerId: selectedCustomer.id,
      date: paymentDate,
      amount: amount,
      type: selectedCustomer.balance < 0 ? 'PAID' : 'RECEIVED',
      mode: paymentMode,
      note: paymentNote,
      reference: 'PAY-' + Date.now().toString().slice(-6)
    };

    StorageService.savePayment(payment);

    // Refresh Data
    const updatedCustomers = StorageService.getCustomers();
    setCustomers(updatedCustomers);
    const updatedSel = updatedCustomers.find(c => c.id === selectedCustomer.id) || null;
    setSelectedCustomer(updatedSel);


    // Show Success Modal via Alert? No, just close. Or Toast. 
    // User requested "Pop up redesign".
    showAlert('Payment Recorded', `₹${amount} ${payment.type === 'PAID' ? 'paid to' : 'received from'} ${selectedCustomer.company || selectedCustomer.name}`, 'success');

    setShowPaymentModal(false);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentMode('CASH');
  };

  const handleShare = (tx: PartyLedgerRow['record']) => {
    if (!selectedCustomer) return;
    const company = StorageService.getCompanyProfile();

    if (selectedCustomer.phone) {
      if (tx.kind === 'voucher') {
        WhatsAppService.shareInvoice(tx.data, selectedCustomer, company);
      } else {
        WhatsAppService.sharePayment(tx.data, selectedCustomer, company);
      }
    } else {
      setPendingShareTx(tx);
      setShowWhatsAppModal(true);
    }
  };


  const handleSendReminder = () => {
    if (!selectedCustomer) return;
    StorageService.addNotification(selectedCustomer.id, {
      type: 'REMINDER',
      title: 'Payment Reminder Sent',
      message: `A payment reminder was sent to ${selectedCustomer.email}.`,
      date: new Date().toISOString().split('T')[0]
    });

    showAlert('Reminder Sent', `Reminder sent to ${selectedCustomer.email}`, 'success');
    // Refresh
    const updatedCustomers = StorageService.getCustomers();
    const updatedSelected = updatedCustomers.find(c => c.id === selectedCustomer.id) || null;
    setCustomers(updatedCustomers);
    setSelectedCustomer(updatedSelected);
  };

  const readStatement = (party: Customer, from: string, to: string) => {
    if (!from || !to || from > to) {
      showAlert('Check dates', 'Choose a start and end date in the correct order.', 'warning');
      return null;
    }
    return buildPartyLedger(party, {
      sales: StorageService.getInvoices(), purchases: StorageService.getPurchases(),
      debitNotes: StorageService.getVouchersByType('DEBIT_NOTE'), payments: StorageService.getPayments(),
    }, from, to);
  };

  const handleDownloadStatement = async () => {
    if (!selectedCustomer) return;

    const company = StorageService.getCompanyProfile();

    const ledger = readStatement(selectedCustomer, range.from, range.to);
    if (!ledger) return;

    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text("STATEMENT OF ACCOUNT", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(company.name, 105, 30, { align: "center" });

    // Details
    doc.setFontSize(10);
    doc.text(`Customer: ${selectedCustomer.company} `, 14, 50);
    doc.text(`Period: ${formatDate(range.from)} to ${formatDate(range.to)} `, 14, 56);

    // Table Header
    let y = 70;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 6, 182, 8, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("Date", 16, y);
    doc.text("Details / Ref", 45, y);
    doc.text("Debit", 130, y, { align: "right" });
    doc.text("Credit", 160, y, { align: "right" });
    doc.text("Mode", 190, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 10;

    const formatBalance = (balance: number) => Math.abs(balance).toFixed(2) + (balance > 0 ? ' Dr.' : balance < 0 ? ' Cr.' : '');
    doc.setFont('helvetica', 'bold');
    doc.text(formatDate(range.from), 16, y);
    doc.text('Opening Balance', 45, y);
    doc.text(formatBalance(ledger.opening), ledger.opening < 0 ? 160 : 130, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;

    for (const row of ledger.rows) {
      if (y > 267) { doc.addPage(); y = 20; }
      doc.text(formatDate(row.date.slice(0, 10)), 16, y);
      doc.text(doc.splitTextToSize([row.kind, row.ref].filter(Boolean).join(' - '), 63)[0], 45, y);
      doc.text(row.debit ? row.debit.toFixed(2) : '-', 130, y, { align: 'right' });
      doc.text(row.credit ? row.credit.toFixed(2) : '-', 160, y, { align: 'right' });
      doc.text(row.mode || '-', 190, y, { align: 'right' });
      y += 8;
    }

    if (y > 254) { doc.addPage(); y = 20; }
    y += 5;
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Totals:', 100, y, { align: 'right' });
    doc.text(ledger.debit.toFixed(2), 130, y, { align: 'right' });
    doc.text(ledger.credit.toFixed(2), 160, y, { align: 'right' });
    y += 10;
    doc.text('Closing Balance', 100, y, { align: 'right' });
    doc.text(formatBalance(ledger.closing), 160, y, { align: 'right' });

    // Unified Save/Share Logic
    const fileName = `Statement_${selectedCustomer.name.replace(/[^a-zA-Z0-9]/g, '_')}_${range.from}.pdf`;
    if (Capacitor.isNativePlatform()) {
      try {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const cacheResult = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });

        await Share.share({
          title: fileName,
          url: cacheResult.uri,
          dialogTitle: 'Save or Share Statement...'
        });
      } catch (err) {
        console.error('Mobile PDF share failed:', err);
        alert('Could not share PDF. Please check permissions.');
      }
    } else {
      doc.save(fileName);
    }
  };

  const handleDownloadHistoryStatement = async (share = false) => {
    if (!selectedCustomer) return;

    const company = StorageService.getCompanyProfile();
    const todayDate = formatDate(new Date());

    const ledger = readStatement(selectedCustomer, range.from, range.to);
    if (!ledger) return;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = 20;

    // ═══════════════════════════════════════════════════════════
    // HEADER - Company Name
    // ═══════════════════════════════════════════════════════════
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(company.name.toUpperCase(), pageWidth / 2, y, { align: 'center' });

    y += 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Ledger Report of ${(selectedCustomer.name || selectedCustomer.company || 'Customer').toUpperCase()}`, pageWidth / 2, y, { align: 'center' });

    y += 6;
    doc.setFontSize(9);
    doc.text(`Period: ${range.from} to ${range.to}`, pageWidth / 2, y, { align: 'center' });

    y += 8;
    // Horizontal line
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);

    y += 10;

    // ═══════════════════════════════════════════════════════════
    // T-FORMAT LEDGER: DEBIT | CREDIT
    // ═══════════════════════════════════════════════════════════

    const centerX = pageWidth / 2;
    const colWidth = (pageWidth - (margin * 2)) / 2;

    // Column Headers
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DEBIT SIDE", margin + colWidth / 2, y, { align: 'center' });
    doc.text("CREDIT SIDE", centerX + colWidth / 2, y, { align: 'center' });

    y += 6;

    // Sub-headers
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    // Debit side headers
    // Debit side headers
    doc.text("Date", margin + 2, y);
    doc.text("Particulars", margin + 18, y);
    doc.text("St.", margin + colWidth - 18, y); // Status Column
    doc.text("Amount", margin + colWidth - 2, y, { align: 'right' });

    // Credit side headers
    doc.text("Date", centerX + 2, y);
    doc.text("Particulars", centerX + 18, y);
    doc.text("Amount", pageWidth - margin - 2, y, { align: 'right' });

    y += 5;

    // Separator line
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);

    y += 5;

    const debitRows = ledger.rows.filter(isLedgerDebit);
    const creditRows = ledger.rows.filter(row => !isLedgerDebit(row));
    const startY = y;
    const drawEntry = (date: string, particulars: string, amount: number, credit: boolean, status = '') => {
      const x = credit ? centerX : margin;
      const width = credit || !status ? 50 : 37;
      doc.text(date, x + 2, y);
      doc.text(doc.splitTextToSize(particulars, width)[0], x + 18, y);
      if (!credit && status) doc.text(status, margin + colWidth - 18, y);
      doc.text(amount.toFixed(2), x + colWidth - 2, y, { align: 'right' });
    };

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const openingLabel = ledger.opening > 0 ? 'Opening Balance (Dr.)' : ledger.opening < 0 ? 'Opening Balance (Cr.)' : 'Opening Balance';
    drawEntry(range.from, openingLabel, Math.abs(ledger.opening), ledger.opening < 0);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    for (let i = 0; i < Math.max(debitRows.length, creditRows.length); i++) {
      if (y > pageHeight - 50) { doc.addPage(); y = 20; }
      const debit = debitRows[i];
      const credit = creditRows[i];
      if (debit) drawEntry(debit.date.slice(0, 10), [debit.kind, debit.ref].filter(Boolean).join(' - '), debit.debit, false,
        debit.status === 'PAID' ? 'PAID' : debit.status === 'PARTIAL' ? 'PART' : debit.status ? 'DUE' : '');
      if (credit) drawEntry(credit.date.slice(0, 10), [credit.kind, credit.ref].filter(Boolean).join(' - '), credit.credit, true);
      y += 5;
    }

    // Add vertical separator line between columns
    doc.setLineWidth(0.3);
    doc.line(centerX, startY - 5, centerX, y);

    // ═══════════════════════════════════════════════════════════
    // TOTALS and CLOSING BALANCE
    // ═══════════════════════════════════════════════════════════

    y += 3;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    const closingBalance = ledger.closing;

    // Debit Total
    doc.text('Total Dr.', margin + 2, y);
    doc.text(ledger.debit.toFixed(2), margin + colWidth - 2, y, { align: 'right' });

    // Credit Total
    doc.text("Total Cr.", centerX + 2, y);
    doc.text(ledger.credit.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });

    y += 8;

    // Closing Balance Row
    if (closingBalance >= 0) {
      // Dr. Balance - show on credit side to balance the ledger
      doc.text(closingBalance ? "Closing Balance (Dr.)" : "Closing Balance", centerX + 2, y);
      doc.text(closingBalance.toFixed(2), pageWidth - margin - 5, y, { align: 'right' });
    } else {
      // Cr. Balance - show on debit side to balance the ledger
      doc.text("Closing Balance (Cr.)", margin + 2, y);
      doc.text(Math.abs(closingBalance).toFixed(2), margin + colWidth - 5, y, { align: 'right' });
    }

    y += 10;

    // ═══════════════════════════════════════════════════════════
    // OUTSTANDING BALANCE MESSAGE
    // ═══════════════════════════════════════════════════════════

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const balanceMsg = closingBalance > 0
      ? `Aapka Balance baaki hai Rs ${closingBalance.toFixed(2)} (Dr.)`
      : closingBalance < 0 ? `Amount payable to party Rs ${Math.abs(closingBalance).toFixed(2)} (Cr.)` : 'No balance outstanding';
    doc.text(balanceMsg, pageWidth / 2, y, { align: 'center' });

    y += 15;

    // ═══════════════════════════════════════════════════════════
    // UPI QR CODE
    // ═══════════════════════════════════════════════════════════

    if (company.upiId && closingBalance > 0 && y < pageHeight - 70) {
      try {
        const QRCode = (await import('qrcode')).default;
        const upiUrl = `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.name)}&am=${closingBalance.toFixed(2)}&cu=INR&tn=Payment`;
        const qrDataUrl = await QRCode.toDataURL(upiUrl);

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Scan to Pay", pageWidth / 2, y, { align: 'center' });

        y += 5;
        const qrSize = 45;
        doc.addImage(qrDataUrl, 'PNG', pageWidth / 2 - qrSize / 2, y, qrSize, qrSize);

        y += qrSize + 3;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`UPI: ${company.upiId}`, pageWidth / 2, y, { align: 'center' });
      } catch (error) {
        console.error('QR generation failed:', error);
      }
    }

    // Footer - Company Name
    const footerY = pageHeight - 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(company.name.toUpperCase(), pageWidth - margin - 5, footerY, { align: 'right' });

    // Unified Save/Share Logic
    const fileName = `Ledger_${(selectedCustomer.company || selectedCustomer.name || 'Party').replace(/[^a-zA-Z0-9]/g, '_')}_${todayDate}.pdf`;
    if (Capacitor.isNativePlatform()) {
      try {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const cacheResult = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });

        await Share.share({
          title: fileName,
          url: cacheResult.uri,
          dialogTitle: 'Save or Share Ledger...'
        });
      } catch (err) {
        console.error('Mobile PDF share failed:', err);
        alert('Could not share PDF. Please check permissions.');
      }
    } else {
      if (share) {
        const file = new File([doc.output('blob')], fileName, { type: 'application/pdf' });
        try {
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Party ledger' });
            return;
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      doc.save(fileName);
    }
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCustomer.name.trim();
    if (!name) {
      showAlert('Missing Information', 'Enter a party name.', 'warning');
      return;
    }

    const customer: Customer = {
      id: crypto.randomUUID(),
      name,
      company: newCustomer.company.trim() || name,
      email: newCustomer.email.trim(),
      phone: newCustomer.phone,
      address: newCustomer.address,
      state: newCustomer.state,
      gstin: newCustomer.gstin,
      type: newCustomer.type,
      partyCategory: newCustomer.partyCategory.trim(),
      creditLimit: newCustomer.creditLimit ? Number(newCustomer.creditLimit) : undefined,
      creditPeriodDays: newCustomer.creditPeriodDays ? Number(newCustomer.creditPeriodDays) : undefined,
      balance: 0,
      notifications: []
    };

    StorageService.saveCustomer(customer);
    setCustomers(StorageService.getCustomers());
    setShowAddCustomer(false);
    setNewCustomer({ name: '', company: '', email: '', phone: '', address: '', state: '', gstin: '', type: 'CUSTOMER', creditLimit: '', creditPeriodDays: '30', partyCategory: '' });
    showAlert('Customer Added', 'Customer has been added successfully!', 'success');
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer({ ...customer, email: customer.email || '', phone: customer.phone || '', address: customer.address || '' });
    setShowEditCustomer(true);
  };

  const handleSaveEditCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    const name = editingCustomer.name.trim();
    if (!name) {
      showAlert('Missing Information', 'Enter a party name.', 'warning');
      return;
    }

    StorageService.updateCustomer({
      ...editingCustomer,
      name,
      company: editingCustomer.company?.trim() || name,
      email: editingCustomer.email?.trim() || '',
      partyCategory: editingCustomer.partyCategory?.trim() || '',
    });
    const refreshed = StorageService.getCustomers();
    setCustomers(refreshed);
    if (selectedCustomer?.id === editingCustomer.id) setSelectedCustomer(refreshed.find(party => party.id === editingCustomer.id) || null);
    setShowEditCustomer(false);
    setEditingCustomer(null);
    showAlert('Updated', 'Customer details updated successfully!', 'success');
  };

  const handleDeleteCustomer = (customerId: string) => {
    setCustomerToDelete(customerId);
  };

  const confirmDeleteCustomer = () => {
    if (customerToDelete) {
      StorageService.deleteCustomer(customerToDelete);
      if (selectedCustomer?.id === customerToDelete) setSelectedCustomer(null);
      setCustomers(StorageService.getCustomers());
      setShowEditCustomer(false);
      setEditingCustomer(null);
      setCustomerToDelete(null);
      showAlert('Deleted', 'Customer has been permanently deleted.', 'success');
    }
  };



  const partyDialogs = <>
      <datalist id="party-groups">{groupOptions}</datalist>
      {/* Modals */}
      <AlertModal
        isOpen={!!alertConfig}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        variant={alertConfig?.variant}
        onClose={() => setAlertConfig(null)}
      />

      <ConfirmationModal
        isOpen={!!customerToDelete}
        title="Delete Customer?"
        message="Are you sure you want to delete this customer? This will also delete all their invoices and payments history. This action cannot be undone."
        confirmText="Delete Customer"
        variant="danger"
        onClose={() => setCustomerToDelete(null)}
        onConfirm={confirmDeleteCustomer}
      />
      {/* Edit Customer Modal */}
      <AnimatePresence>
        {showEditCustomer && editingCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowEditCustomer(false); setEditingCustomer(null); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface w-full max-w-xl rounded-[40px] shadow-google-lg overflow-hidden border border-border max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center sticky top-0 backdrop-blur-md z-10">
                <div>
                  <h3 className="text-2xl font-black font-heading text-foreground">Edit Customer</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Update client profile</p>
                </div>
                <button onClick={() => { setShowEditCustomer(false); setEditingCustomer(null); }} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={handleSaveEditCustomer} className="space-y-6">
                  <div className="group space-y-2 relative">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Customer Name</label>
                    <input
                      type="text"
                      required
                      value={editingCustomer.name}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Company Name</label>
                    <input
                      type="text"
                      value={editingCustomer.company}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, company: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Company Name"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Email</label>
                      <input
                        type="email"
                        value={editingCustomer.email}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Phone</label>
                      <input
                        type="tel"
                        value={editingCustomer.phone}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <label className="grid gap-2 text-xs font-semibold">Party group
                    <input list="party-groups" maxLength={80} value={editingCustomer.partyCategory || ''}
                      onChange={event => setEditingCustomer({ ...editingCustomer, partyCategory: event.target.value })}
                      className="w-full rounded-2xl border bg-background p-3" placeholder="Choose or type a group" />
                  </label>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Address</label>
                    <textarea
                      value={editingCustomer.address}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                      rows={2}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all resize-none"
                    />
                  </div>

                  {gstEnabledVal && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">State</label>
                        <input
                          type="text"
                          value={editingCustomer.state || ''}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, state: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">GSTIN</label>
                        <input
                          type="text"
                          value={editingCustomer.gstin || ''}
                          onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Party Type</label>
                      <select
                        value={editingCustomer.type || 'CUSTOMER'}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, type: e.target.value as any })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent rounded-[24px] text-sm font-bold text-foreground outline-none"
                      >
                        <option value="CUSTOMER">Customer</option>
                        <option value="VENDOR">Supplier / Vendor</option>
                        <option value="BOTH">Both</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Credit Limit (₹)</label>
                      <input
                        type="number"
                        value={editingCustomer.creditLimit ?? ''}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, creditLimit: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent rounded-[24px] text-sm font-bold text-foreground outline-none"
                        placeholder="No limit"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Credit Days</label>
                      <input
                        type="number"
                        value={editingCustomer.creditPeriodDays ?? ''}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, creditPeriodDays: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent rounded-[24px] text-sm font-bold text-foreground outline-none"
                        placeholder="30"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      className="flex-1 bg-google-blue text-white py-4 rounded-full font-black uppercase tracking-widest text-xs shadow-lg shadow-google-blue/20"
                    >
                      Save Changes
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => handleDeleteCustomer(editingCustomer.id)}
                      className="px-6 bg-google-red/10 text-google-red py-4 rounded-full font-black hover:bg-google-red/20 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </motion.button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <WhatsAppNumberModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        onSubmit={(phone) => {
          if (pendingShareTx && selectedCustomer) {
            const company = StorageService.getCompanyProfile();
            if (pendingShareTx.kind === 'voucher') {
              WhatsAppService.shareInvoice(pendingShareTx.data, selectedCustomer, company, phone);
            } else {
              WhatsAppService.sharePayment(pendingShareTx.data, selectedCustomer, company, phone);
            }
            setPendingShareTx(null);
          }
        }}
      />
      <InputModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        title="Log Call / Follow-up"
        placeholder="e.g. Called for payment, Agreed to pay Monday"
        submitLabel="Save Note"
        onSubmit={(note) => {
          if (selectedCustomer && typeof selectedCustomer === 'object') {
            const updated: Customer = Object.assign({}, selectedCustomer);
            if (!updated.followUpHistory) updated.followUpHistory = [];
            updated.followUpHistory.unshift({ date: new Date().toISOString().split('T')[0], note });
            StorageService.updateCustomer(updated);
            setSelectedCustomer(updated);
            HapticService.light();
          }
        }}
      />
  </>;

  if (selectedCustomer) {
    const name = selectedCustomer.company || selectedCustomer.name || 'Party';
    const netBalance = Number(selectedCustomer.balance) || 0;
    const ledger = buildPartyLedger(selectedCustomer, {
      sales: StorageService.getInvoices(), purchases: StorageService.getPurchases(),
      debitNotes: StorageService.getVouchersByType('DEBIT_NOTE'), payments: StorageService.getPayments(),
    }, range.from, range.to);

    return (
      <div className="bg-surface-container-low min-h-screen font-sans dark:bg-[#0e0f13]">
        {partyDialogs}
        {/* Overlay for viewing invoice */}
        <AnimatePresence>
          {viewingInvoice && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-0 z-[60] bg-surface overflow-y-auto"
            >
              <InvoiceView
                invoice={viewingInvoice}
                onBack={() => setViewingInvoice(null)}
                onDelete={invoice => {
                  if (invoice.type === 'PURCHASE' || invoice.type === 'DEBIT_NOTE') StorageService.deletePurchase(invoice.id);
                  else StorageService.deleteInvoice(invoice.id);
                  const list = StorageService.getCustomers();
                  setCustomers(list);
                  setSelectedCustomer(list.find(party => party.id === selectedCustomer.id) || null);
                  setViewingInvoice(null);
                }}
                onEdit={(inv) => {
                  setViewingInvoice(null);
                  if (onEditInvoice) onEditInvoice(inv);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <header className="sticky top-0 z-30 border-b border-border bg-surface-container-low/95 backdrop-blur dark:bg-[#0b0c10]/95">
          <div className="mx-auto flex min-h-[4.25rem] max-w-3xl items-center gap-2.5 px-3 sm:px-4">
            <button type="button" aria-label="Back" className={partyAction} onClick={() => {
              if (initialCustomerId && onBack) onBack();
              else setSelectedCustomer(null);
            }}><ArrowLeft size={19} /></button>
            <h1 className="min-w-0 flex-1 break-words font-heading text-lg font-black uppercase sm:text-xl">{name}</h1>
            <button type="button" aria-label="Edit party" className={partyAction} onClick={() => handleEditCustomer(selectedCustomer)}><Edit size={17} /></button>
          </div>
        </header>
        <div className="mx-auto max-w-3xl space-y-3 px-2.5 pt-3 pb-20 sm:px-4">
          <nav aria-label="Party details tabs" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1 dark:bg-[#111216]">
            {(['TRANSACTIONS', 'PROFILE'] as const).map(tab => <button key={tab} type="button" aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)} className={`min-h-9 rounded-full text-xs font-bold uppercase tracking-wide ${activeTab === tab ? 'bg-primary/15 text-primary dark:text-blue-400' : 'text-muted-foreground hover:bg-surface-container-high'}`}>
              {tab === 'TRANSACTIONS' ? 'Transactions' : 'Profile'}
            </button>)}
          </nav>
          <section aria-label="Party net balance" className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-primary/10 px-4 py-3 dark:bg-[#121b2d]">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Net balance</p>
              <p className={`break-words font-heading text-2xl font-black tabular-nums ${netBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {workspaceMoney(Math.abs(netBalance))}
                {netBalance !== 0 && <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase text-muted-foreground">{netBalance > 0 ? 'To collect' : 'To pay'}</span>}
              </p>
            </div>
            <button type="button" onClick={() => { setPaymentDate(localDay()); setShowPaymentModal(true); }}
              className="min-h-10 shrink-0 rounded-full bg-emerald-600 px-4 text-xs font-black uppercase text-white hover:bg-emerald-700">
              {netBalance < 0 ? 'Pay now' : 'Receive now'}
            </button>
          </section>

          {activeTab === 'TRANSACTIONS' ? <PartyLedgerPanel ledger={ledger} range={range} onRangeChange={setRange}
            onDownload={() => void handleDownloadHistoryStatement()} onShare={() => void handleDownloadHistoryStatement(true)}
            onShareEntry={row => handleShare(row.record)} onView={setViewingInvoice} /> : (
            <section aria-labelledby="party-profile" className="space-y-4 rounded-[1.6rem] border border-border bg-surface p-4 dark:bg-[#111216]">
              <h2 id="party-profile" className="font-heading text-lg font-black">Profile</h2>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ['Contact name', selectedCustomer.name], ['Phone', selectedCustomer.phone], ['Email', selectedCustomer.email],
                  ['Address', selectedCustomer.address], ['GSTIN', selectedCustomer.gstin], ['Group', selectedCustomer.partyCategory],
                ].filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-semibold">{value}</dd>
                </div>)}
              </dl>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowNoteModal(true)} className={workspace.secondary}>Log call</button>
                <button type="button" onClick={handleSendReminder} className={workspace.secondary}>Record reminder</button>
                <button type="button" onClick={handleDownloadStatement} className={workspace.secondary}><Download size={16} /> Download Statement</button>
              </div>
              <PartyDateRange value={range} onChange={setRange} />
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">Follow-up and activity</h3>
                {selectedCustomer.followUpHistory?.map((entry, index) => <p key={index} className="break-words text-sm">{entry.note} <time className="text-xs text-muted-foreground">{formatDate(entry.date)}</time></p>)}
                {selectedCustomer.notifications?.map(entry => <div key={entry.id} className="text-sm">
                  <p className="font-semibold">{entry.title}</p><p className="break-words text-muted-foreground">{entry.message}</p>
                </div>)}
                {!selectedCustomer.followUpHistory?.length && !selectedCustomer.notifications?.length && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
              </div>
            </section>
          )}
        </div>

        {/* M3 Payment Modal */}
        <AnimatePresence>
          {showPaymentModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPaymentModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative bg-surface w-full max-w-md rounded-[40px] shadow-google-lg overflow-hidden border border-border"
              >
                <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black font-heading text-foreground">{netBalance < 0 ? 'Make Payment' : 'Receive Payment'}</h3>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Record transaction</p>
                  </div>
                  <button onClick={() => setShowPaymentModal(false)} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <form onSubmit={handleSavePayment} className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">{netBalance < 0 ? 'Amount Paid' : 'Amount Received'}</label>
                    <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-black text-foreground">₹</span>
                      <input
                        type="number"
                        required
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full p-6 pl-12 bg-surface-container-high border-2 border-transparent focus:border-google-green/30 rounded-[24px] text-3xl font-black text-foreground focus:ring-4 focus:ring-google-green/5 outline-none transition-all placeholder:text-muted-foreground/20"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Date</label>
                      <input
                        type="date"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as any)}
                        className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all appearance-none"
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI / Online</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Reference Note</label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-sm font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="Optional details..."
                    />
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="w-full bg-google-green text-white py-5 rounded-full font-black uppercase tracking-widest text-sm shadow-xl shadow-google-green/20 hover:shadow-google-lg mt-2"
                  >
                    Process Payment
                  </motion.button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }


  const filteredCustomers = customers.filter(c => {
    const matchesSearch =
      (c.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm));
    const matchesFilter =
      partyFilter === 'ALL' ||
      (partyFilter === 'TO_COLLECT' && c.balance > 0) ||
      (partyFilter === 'TO_PAY' && c.balance < 0);
    return matchesSearch && matchesFilter && (!groupFilter || c.partyCategory?.trim() === groupFilter);
  });

  return (
    <div className="bg-surface-container-low min-h-screen font-sans">
      {partyDialogs}
      <div className={workspace.page}>
        <WorkspaceHeading title="Parties" onBack={onBackToWorkspace} actions={<>
          {onBack && <button type="button" aria-label="Back" onClick={onBack} className={workspace.secondary}><ArrowLeft size={16} /></button>}
          <button type="button" onClick={() => setShowAddCustomer(true)} className={workspace.primary}><Plus size={16} /> Add party</button>
        </>}>{customers.length} {customers.length === 1 ? 'party' : 'parties'}</WorkspaceHeading>
        <WorkspaceMetrics values={[
          { label: 'To collect', value: workspaceMoney(customers.reduce((sum, party) => sum + Math.max(0, Number(party.balance) || 0), 0)), tone: 'positive' },
          { label: 'To pay', value: workspaceMoney(customers.reduce((sum, party) => sum + Math.max(0, -(Number(party.balance) || 0)), 0)), tone: 'attention' },
        ]} />
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[130px] flex-1">
            <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" />
            <input type="search" aria-label="Search parties" placeholder="Name, company or phone" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className={workspace.input + ' pl-9'} />
          </label>
          {(partyGroups.length > 0 || groupFilter) && <select aria-label="Party group" value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className={workspace.input + ' w-auto max-w-full'}>
            <option value="">All party groups</option>
            {groupFilter && !partyGroups.includes(groupFilter) && <option value={groupFilter}>{groupFilter}</option>}
            {partyGroups.map(group => <option key={group} value={group}>{group}</option>)}
          </select>}
        </div>
        <WorkspaceFilters label="Party balance filter" value={partyFilter} onChange={setPartyFilter} options={[
          { id: 'ALL', label: 'All parties' }, { id: 'TO_COLLECT', label: 'To collect' }, { id: 'TO_PAY', label: 'To pay' },
        ]} />
        <ul aria-label="Parties" className={workspace.panel + ' divide-y divide-border overflow-hidden'}>
          {filteredCustomers.map(customer => {
            const name = customer.company?.trim() || customer.name?.trim() || 'Unnamed party';
            const details = [customer.phone || (customer.name !== name ? customer.name : ''), customer.partyCategory, customer.type === 'VENDOR' ? 'Supplier' : customer.type === 'BOTH' ? 'Customer & supplier' : ''].filter(Boolean).join(' · ');
            const value = Number(customer.balance) || 0;
            return <li key={customer.id} className="flex items-center gap-1 px-2 sm:gap-2 sm:px-3">
              <button type="button" aria-label={'Open party ' + name} onClick={() => handleViewHistory(customer)} className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-surface-container-low sm:gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary">{name[0].toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{name}</span>{details && <span className="block truncate text-xs text-muted-foreground">{details}</span>}
                  {Number(customer.creditLimit) > 0 && value > Number(customer.creditLimit) && <span className="block text-xs text-red-700 dark:text-red-300">Over credit limit</span>}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums"><span className="block font-bold">{workspaceMoney(Math.abs(value))}</span><span className="block text-xs text-muted-foreground">{value > 0 ? 'To collect' : value < 0 ? 'To pay' : 'Settled'}</span></span>
              </button>
              {value > 0 && customer.phone && <button type="button" title="Send WhatsApp reminder" aria-label={'Send payment reminder to ' + name} onClick={() => WhatsAppService.sharePaymentReminder(customer, StorageService.getCompanyProfile(), value)} className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 sm:w-10"><MessageCircle size={16} /></button>}
              <button type="button" aria-label={'Edit party ' + name} onClick={() => handleEditCustomer(customer)} className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-container-high hover:text-foreground sm:w-10"><Edit size={16} /></button>
            </li>;
          })}
          {!filteredCustomers.length && <li className="p-10 text-center text-sm text-muted-foreground">{customers.length ? 'No parties match these filters.' : 'Add a party to start billing or tracking balances.'}</li>}
        </ul>
      </div>

      {/* Add Customer Modal - M3 Expressive */}
      <AnimatePresence>
        {showAddCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCustomer(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface w-full max-w-xl rounded-[40px] shadow-google-lg overflow-hidden border border-border max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8 border-b border-border bg-surface-container-high/30 flex justify-between items-center sticky top-0 backdrop-blur-md z-10">
                <div>
                  <h3 className="text-2xl font-black font-heading text-foreground">New Customer</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Add client details</p>
                </div>
                <button onClick={() => setShowAddCustomer(false)} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={handleAddCustomer} className="space-y-6">
                  <div className="group space-y-2 relative">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                      Customer Name <span className="w-1 h-1 rounded-full bg-google-red" />
                    </label>
                    <input
                      type="text"
                      required
                      value={newCustomer.name}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setNewCustomer({ ...newCustomer, name: val });
                        if (val.length >= 2) {
                          const results = await ContactsService.searchContacts(val);
                          setSuggestions(results);
                          setShowSuggestions(results.length > 0);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={async () => {
                        await ContactsService.requestWithDisclosure();
                      }}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="Search or type name..."
                    />

                    {/* Contact Suggestions Dropdown */}
                    <AnimatePresence>
                      {showSuggestions && suggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute z-[120] left-0 right-0 top-full mt-2 bg-surface-container-highest border border-border rounded-[28px] shadow-google-lg max-h-60 overflow-y-auto p-2"
                        >
                          {suggestions.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setNewCustomer(prev => ({
                                  ...prev,
                                  name: s.name,
                                  phone: s.phone.replace(/\D/g, '').slice(-10),
                                  company: prev.company || s.name
                                }));
                                setShowSuggestions(false);
                                HapticService.light();
                              }}
                              className="w-full p-4 flex items-center justify-between hover:bg-surface-container-high rounded-[20px] transition-all text-left"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-google-blue/10 text-google-blue flex items-center justify-center font-black text-xs shrink-0">
                                  {s.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-black text-foreground truncate">{s.name}</div>
                                  <div className="text-[10px] font-bold text-muted-foreground">{s.phone}</div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={newCustomer.company}
                      onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="Business Name"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30"
                      placeholder="email@example.com"
                    />
                  </div>

                  <label className="grid gap-2 text-xs font-semibold">Party group
                    <input list="party-groups" maxLength={80} value={newCustomer.partyCategory}
                      onChange={event => setNewCustomer({ ...newCustomer, partyCategory: event.target.value })}
                      className="w-full rounded-2xl border bg-background p-3" placeholder="Choose or type a group" />
                  </label>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Phone Number</label>
                    <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-google-blue font-black">+91</span>
                      <input
                        type="tel"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        className="w-full p-4 pl-16 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-black text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all tracking-widest placeholder:text-muted-foreground/30"
                        placeholder="00000 00000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Billing Address</label>
                    <textarea
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                      rows={2}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30 resize-none"
                      placeholder="Full Address"
                    />
                  </div>

                  {gstEnabledVal && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">State</label>
                        <input
                          type="text"
                          value={newCustomer.state}
                          onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                          placeholder="State Name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">GSTIN (Optional)</label>
                        <input
                          type="text"
                          value={newCustomer.gstin}
                          onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value })}
                          className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                          placeholder="GST Number"
                          maxLength={15}
                        />
                      </div>
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="w-full bg-google-blue text-white py-5 rounded-full font-black uppercase tracking-widest text-sm shadow-xl shadow-google-blue/20 hover:shadow-google-lg mt-4"
                  >
                    Add Customer to Database
                  </motion.button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Customers;
