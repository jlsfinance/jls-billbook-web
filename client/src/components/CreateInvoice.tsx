
import React, { useState, useEffect } from 'react';
import { Customer, Product, Invoice, InvoiceItem, InvoiceFormat, VoucherType, AdditionalCharge, type Payment } from '../types';
import { StorageService } from '../services/storageService';
import { Plus, Trash2, Save, X, CreditCard, Banknote, ArrowLeft, AlertCircle, Calculator, Package, UserPlus, User, Phone, ChevronRight, ChevronDown, Truck } from 'lucide-react';
import Autocomplete from './Autocomplete';
import { useCompany } from '@/contexts/CompanyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { HapticService } from '@/services/hapticService';
import { SoundService } from '@/services/soundService';
import { ContactsService } from '@/services/contactsService';
import VoiceInput from './VoiceInput';
import { ParsedItem } from '../services/voiceParser';
import BarcodeScanField from './BarcodeScanField';
import { workspace, workspaceMoney } from './WorkspaceUI';
import { lookupBarcode } from '../services/barcodeService';
import type { BarcodeSource } from '../services/barcodeService';

interface CreateInvoiceProps {
  onSave: (invoice: Invoice, showActions?: boolean, linkedPayment?: Payment) => void;
  onCancel: () => void;
  initialInvoice?: Invoice | null;
  sourceVoucher?: Invoice | null;
  voucherType?: VoucherType;
  startSmartCalc?: boolean;
  initialCustomerId?: string;
  isCreditNote?: boolean;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ onSave, onCancel, initialInvoice, sourceVoucher, voucherType = 'SALE', startSmartCalc, initialCustomerId, isCreditNote = false }) => {
  const effectiveType: VoucherType = initialInvoice?.type || sourceVoucher?.type || (isCreditNote ? 'CREDIT_NOTE' : voucherType);
  const isReturnDoc = effectiveType === 'CREDIT_NOTE' || effectiveType === 'DEBIT_NOTE';
  const { company } = useCompany();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const gstEnabled = company?.gst_enabled ?? true;
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH'>('CREDIT');
  const [roundUpTo] = useState<0 | 10 | 100>(company?.roundUpDefault ?? 0);
  const [notes, setNotes] = useState('');
  const [includePreviousBalance, setIncludePreviousBalance] = useState(false);
  const [previousBalance, setPreviousBalance] = useState(0);

  // Additional SMB billing details (E-Way / Place of Supply / Extra Charges / Godown & Account)
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [accountId, setAccountId] = useState('');
  const [godownId, setGodownId] = useState('godown_main');
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);

  // Global Discount State
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Smart Calculator States
  const [showSmartCalculator, setShowSmartCalculator] = useState(false);
  const [smartCalcInput, setSmartCalcInput] = useState('');
  const [calcError, setCalcError] = useState('');

  // Smart Calculator Credit Flow States
  const [showAmountReceivedModal, setShowAmountReceivedModal] = useState(false);
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [pendingCreditInvoice, setPendingCreditInvoice] = useState<Invoice | null>(null);

  // Initialize with Smart Calc if requested
  useEffect(() => {
    if (startSmartCalc && !initialInvoice) {
      setShowSmartCalculator(true);
    }
  }, [startSmartCalc, initialInvoice]);

  // States for Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  // Product Creation
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductHSN, setNewProductHSN] = useState('');
  const [newProductGST, setNewProductGST] = useState('0');
  const [newProductId, setNewProductId] = useState(''); // New State for Manual ID
  const [pendingProductIndex, setPendingProductIndex] = useState<number | null>(null);

  // Contacts States
  const [contactSuggestions, setContactSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);

  // Preview
  const getInvoiceNumberPreview = () => {
    if (initialInvoice) return initialInvoice.invoiceNumber;
    return StorageService.generateVoucherNumber(effectiveType, date, selectedCustomerId || undefined);
  };

  const [hasChanges, setHasChanges] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);

  // Focus navigation

  // handleKeyDown was unused and removed

  useEffect(() => {
    setCustomers(StorageService.getCustomers());
    setProducts(StorageService.getProducts());

    const seedDoc = initialInvoice || sourceVoucher;
    if (seedDoc) {
      setSelectedCustomerId(seedDoc.customerId);
      setDate(initialInvoice ? seedDoc.date : new Date().toISOString().split('T')[0]);
      setDueDate(seedDoc.dueDate);
      setItems(seedDoc.items.map(i => ({ ...i })));
      setPaymentMode(seedDoc.status === 'PAID' ? 'CASH' : 'CREDIT');
      setNotes(seedDoc.notes || '');
      setPlaceOfSupply(seedDoc.customerState || '');
      setEwayBillNumber(seedDoc.ewayBillNumber || '');
      setVehicleNumber(seedDoc.vehicleNumber || '');
      setAccountId(seedDoc.accountId || '');
      setGodownId(seedDoc.godownId || 'godown_main');
      setAdditionalCharges(seedDoc.additionalCharges || []);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().split('T')[0]);
      if (items.length === 0) handleAddItem();

      // Pre-select Customer if provided
      if (initialCustomerId) {
        setSelectedCustomerId(initialCustomerId);
        const cust = StorageService.getCustomers().find(c => c.id === initialCustomerId);
        if (cust) {
          setPreviousBalance(cust.balance || 0);
          setPlaceOfSupply(cust.state || '');
        }
      }
    }
  }, [initialInvoice, sourceVoucher, initialCustomerId]);

  // Update previous balance when customer selection changes
  useEffect(() => {
    if (selectedCustomerId && !initialInvoice) {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (cust) {
        setPreviousBalance(cust.balance || 0);
      }
    } else if (initialInvoice) {
      setPreviousBalance(initialInvoice.previousBalance || 0);
      setIncludePreviousBalance(!!initialInvoice.previousBalance);
    }
  }, [selectedCustomerId, customers, initialInvoice]);

  const handleAddItem = () => {
    setItems([...items, { productId: '', description: '', quantity: 1, rate: 0, baseAmount: 0, hsn: '', gstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
  };

  const calculateTaxes = (item: InvoiceItem, supplier: any, customer: any, applyGst = true) => {
    let baseAmount = item.quantity * item.rate;
    // Apply Item Discount if present
    if (item.discountValue && item.discountValue > 0) {
      if (item.discountType === 'AMOUNT') {
        item.discountAmount = item.discountValue;
        baseAmount -= item.discountValue;
      } else {
        const discAmt = (baseAmount * item.discountValue / 100);
        item.discountAmount = discAmt;
        baseAmount -= discAmt;
      }
    } else {
      item.discountAmount = 0;
    }

    // Ensure baseAmount is not negative
    if (baseAmount < 0) baseAmount = 0;

    const gstRate = applyGst ? item.gstRate || 0 : 0;
    const taxType = supplier?.state === customer?.state ? 'INTRA_STATE' : 'INTER_STATE';

    if (taxType === 'INTRA_STATE') {
      item.cgstAmount = baseAmount * (gstRate / 2) / 100;
      item.sgstAmount = baseAmount * (gstRate / 2) / 100;
      item.igstAmount = 0;
    } else {
      item.cgstAmount = 0;
      item.sgstAmount = 0;
      item.igstAmount = baseAmount * gstRate / 100;
    }

    item.baseAmount = baseAmount;
    item.totalAmount = baseAmount + (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0);
  };

  // Function to finalize Smart Calc session - AUTO SAVE
  const handleSmartFinish = () => {
    // 1. If items are empty, just close
    if (items.filter(i => i.productId).length === 0) {
      setShowSmartCalculator(false);
      return;
    }

    // 2. Identify Customer
    let finalCustomerId = selectedCustomerId;
    let finalCustomer = customers.find(c => c.id === finalCustomerId);

    // 3. Prepare Invoice Data First (we'll need it for both flows)
    const cleanedItems: InvoiceItem[] = items.filter(i => i.productId).map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      rate: Number(item.rate) || 0,
      baseAmount: Number(item.baseAmount) || 0,
      gstRate: Number(item.gstRate) || 0,
      cgstAmount: Number(item.cgstAmount) || 0,
      sgstAmount: Number(item.sgstAmount) || 0,
      igstAmount: Number(item.igstAmount) || 0,
      totalAmount: Number(item.totalAmount) || 0
    }));

    // Calculate totals
    const subtotal = cleanedItems.reduce((sum, item) => sum + (item.baseAmount || 0), 0);
    const totalCgst = cleanedItems.reduce((sum, item) => sum + (item.cgstAmount || 0), 0);
    const totalSgst = cleanedItems.reduce((sum, item) => sum + (item.sgstAmount || 0), 0);
    const totalIgst = cleanedItems.reduce((sum, item) => sum + (item.igstAmount || 0), 0);

    const supplier = company as any;

    // Calculate Discount
    let globalDiscountAmount = 0;
    if (discountType === 'PERCENTAGE') {
      globalDiscountAmount = (subtotal * discountValue) / 100;
    } else {
      globalDiscountAmount = discountValue;
    }

    const totalBeforeDiscount = subtotal + totalCgst + totalSgst + totalIgst;
    const finalTotal = totalBeforeDiscount - globalDiscountAmount;

    // Rounding
    let roundedTotal = finalTotal;
    let roundUpAmount = 0;
    if (roundUpTo > 0) {
      roundedTotal = Math.ceil(finalTotal / roundUpTo) * roundUpTo;
      roundUpAmount = roundedTotal - finalTotal;
    }

    // CASE A: No Customer Selected -> CASH SALE (Quick Sale)
    if (!finalCustomerId) {
      let cashCust = customers.find(c => c.name.toUpperCase() === 'CASH');
      if (!cashCust) {
        cashCust = {
          id: crypto.randomUUID(),
          name: 'CASH',
          company: 'CASH SALES',
          phone: '',
          email: '',
          address: '',
          gstin: '',
          balance: 0,
          notifications: []
        };
        StorageService.saveCustomer(cashCust);
        setCustomers(StorageService.getCustomers());
      }
      finalCustomer = cashCust;
      finalCustomerId = cashCust!.id;

      const taxType = (supplier?.state || 'Delhi') === (finalCustomer.state || '') ? 'INTRA_STATE' : 'INTER_STATE';

      const invoiceData: Invoice = {
        id: crypto.randomUUID(),
        invoiceNumber: StorageService.generateInvoiceNumber(finalCustomerId!, date),
        customerId: finalCustomerId!,
        customerName: finalCustomer.company || finalCustomer.name,
        customerAddress: finalCustomer.address || '',
        customerState: finalCustomer.state || '',
        customerGstin: finalCustomer.gstin || '',
        supplierGstin: supplier?.gstin || '',
        taxType: taxType,
        date,
        dueDate,
        items: cleanedItems,
        discountType,
        discountValue,
        discountAmount: Math.round(globalDiscountAmount * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        totalCgst: Math.round(totalCgst * 100) / 100,
        totalSgst: Math.round(totalSgst * 100) / 100,
        totalIgst: Math.round(totalIgst * 100) / 100,
        gstEnabled: gstEnabled && cleanedItems.some(i => (i.gstRate || 0) > 0),
        roundUpTo: roundUpTo,
        roundUpAmount: Math.round(roundUpAmount * 100) / 100,
        total: Math.round(roundedTotal * 100) / 100,
        status: 'PAID',
        paymentMode: 'CASH',
        notes: notes,
        templateFormat: company?.invoiceSettings?.format || (company as any).invoiceTemplate?.toUpperCase() || InvoiceFormat.DEFAULT
      };

      onSave(invoiceData, true);
      setShowSmartCalculator(false);
      return;
    }

    // CASE B: Customer Selected -> CREDIT FLOW (Ask for Amount Received)
    if (!finalCustomer) return;

    const taxType = (supplier?.state || 'Delhi') === (finalCustomer.state || '') ? 'INTRA_STATE' : 'INTER_STATE';

    const invoiceData: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber: StorageService.generateInvoiceNumber(finalCustomerId!, date),
      customerId: finalCustomerId!,
      customerName: finalCustomer.company || finalCustomer.name,
      customerAddress: finalCustomer.address || '',
      customerState: finalCustomer.state || '',
      customerGstin: finalCustomer.gstin || '',
      supplierGstin: supplier?.gstin || '',
      taxType: taxType,
      date,
      dueDate,
      items: cleanedItems,
      discountType,
      discountValue,
      discountAmount: Math.round(globalDiscountAmount * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      gstEnabled: gstEnabled && cleanedItems.some(i => (i.gstRate || 0) > 0),
      roundUpTo: roundUpTo,
      roundUpAmount: Math.round(roundUpAmount * 100) / 100,
      total: Math.round(roundedTotal * 100) / 100,
      status: 'PENDING', // Credit Sale - PENDING until fully paid
      paymentMode: 'CREDIT',
      notes: notes,
      templateFormat: company?.invoiceSettings?.format || (company as any).invoiceTemplate?.toUpperCase() || InvoiceFormat.DEFAULT
    };

    // Store the invoice and show Amount Received Modal
    setPendingCreditInvoice(invoiceData);
    setAmountReceived(invoiceData.total); // Default to full amount
    setShowAmountReceivedModal(true);
    setShowSmartCalculator(false); // Hide Smart Calc, show Amount modal
  };

  // Function to finalize Credit Sale with Amount Received
  const handleSaveWithPayment = () => {
    if (!pendingCreditInvoice) return;

    const receivedAmt = Math.round((amountReceived || 0) * 100) / 100;
    if (!Number.isFinite(receivedAmt) || receivedAmt < 0 || receivedAmt > pendingCreditInvoice.total) {
      alert('Enter an amount between zero and the invoice total.');
      return;
    }
    const updatedInvoice: Invoice = {
      ...pendingCreditInvoice,
      status: 'PENDING',
      amountReceived: 0,
      paidAmount: 0,
      balanceDue: pendingCreditInvoice.total,
    };

    // Play success sound and haptic (Payment received - YES button)
    SoundService.playSuccess();
    HapticService.heavy();

    const receipt: Payment | undefined = receivedAmt > 0
      ? {
        id: crypto.randomUUID(),
        customerId: updatedInvoice.customerId,
        invoiceId: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        amount: receivedAmt,
        date: date,
        mode: 'CASH',
        type: 'RECEIPT',
        notes: `Payment received against ${updatedInvoice.invoiceNumber}`,
      } : undefined;
    onSave(updatedInvoice, true, receipt);

    // Reset Credit Flow States
    setPendingCreditInvoice(null);
    setAmountReceived(0);
    setShowAmountReceivedModal(false);
  };

  // Function to skip payment (Full Credit)
  const handleSkipPayment = () => {
    if (!pendingCreditInvoice) return;

    // Haptic feedback for ledger selection (NO button - Skip Payment)
    HapticService.medium();

    // Save as full credit (no payment received)
    const updatedInvoice: Invoice = {
      ...pendingCreditInvoice,
      status: 'PENDING',
      amountReceived: 0,
      balanceDue: pendingCreditInvoice.total
    };

    onSave(updatedInvoice, true);
    setPendingCreditInvoice(null);
    setAmountReceived(0);
    setShowAmountReceivedModal(false);
  };

  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);

  const handleOpenItemModal = (index: number) => {
    setActiveItemIndex(index);
    setShowItemModal(true);
    HapticService.light();
  };

  // State to track if we are editing an existing product (to allow saving same ID)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const handleEditProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setNewProductName(product.name);
    setNewProductPrice(product.price.toString());
    setNewProductHSN(product.hsn || '');
    setNewProductGST(product.gstRate?.toString() || '0');
    setNewProductId(product.id);
    setEditingProductId(product.id);

    // We need to know we are editing, not creating. 
    // Reuse saveNewProduct but we need to handle ID collision if it's an edit vs create.
    // For simplicity, we just open the modal. User can change values and "Save" which overwrites if ID matches.
    // But saveNewProduct currently generates ID if not provided, or uses random UUID.

    setShowProductModal(true);
  };

  const handleAddItemAndOpen = () => {
    const newIndex = items.length;
    handleAddItem();
    setTimeout(() => handleOpenItemModal(newIndex), 0);
  };

  const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setHasChanges(true);
    const newItems = [...items];
    const item = newItems[index];
    const supplier = company;
    const customer = customers.find(c => c.id === selectedCustomerId);

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        item.productId = product.id;
        item.description = product.name;
        item.hsn = product.hsn || '';
        item.gstRate = product.gstRate || 0;

        let rateToUse = product.price;
        if (selectedCustomerId) {
          const lastRate = StorageService.getLastSalePrice(selectedCustomerId, product.id);
          if (lastRate !== null) rateToUse = lastRate;
        }
        item.rate = rateToUse;
        item.baseAmount = item.quantity * item.rate;
        if (gstEnabled) calculateTaxes(item, supplier, customer);
        else item.totalAmount = item.baseAmount;
      }
    } else if (field === 'quantity' || field === 'rate') {
      if (field === 'quantity') item.quantity = Number(value);
      if (field === 'rate') item.rate = Number(value);
      item.baseAmount = item.quantity * item.rate;
      if (gstEnabled) calculateTaxes(item, supplier, customer);
      else item.totalAmount = item.baseAmount;
    } else if (field === 'gstRate') {
      item.gstRate = Number(value);
      if (gstEnabled) calculateTaxes(item, supplier, customer);
    } else if (field === 'hsn') {
      item.hsn = value;
    } else if (field === 'description') {
      item.description = value;
    } else if (field === 'discountType' || field === 'discountValue') {
      if (field === 'discountType') item.discountType = value;
      if (field === 'discountValue') item.discountValue = Number(value);
      if (gstEnabled) calculateTaxes(item, supplier, customer);
      else {
        // Manual recalc for non-GST
        let base = item.quantity * item.rate;
        if (item.discountValue && item.discountValue > 0) {
          if (item.discountType === 'AMOUNT') base -= item.discountValue;
          else base -= (base * item.discountValue / 100);
        }
        item.baseAmount = base > 0 ? base : 0;
        item.totalAmount = item.baseAmount;
      }
    }

    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setHasChanges(true);

    // Play delete sound and haptic feedback
    SoundService.playDelete();
    HapticService.heavy();

    setItems(items.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------
  // Barcode scanning (PRD §7.3): scan -> item added; rescan -> quantity +1
  // ---------------------------------------------------------------
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string; itemId?: string } | null>(null);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const billItems = items.filter(item => item.productId && Number(item.quantity) > 0);

  /**
   * Adds a product to the bill. Scanning the same barcode again increments the
   * existing line instead of creating a duplicate row.
   */
  const addProductToInvoice = (
    product: Product,
    barcodeSnapshot?: string
  ) => {
    setHasChanges(true);
    const supplier = company;
    const customer = customers.find(c => c.id === selectedCustomerId);

    setItems(prev => {
      const existingIndex = prev.findIndex(i => i.productId === product.id);

      if (existingIndex > -1) {
        const copy = [...prev];
        const item = { ...copy[existingIndex] };
        item.quantity = Number(item.quantity) + 1;
        calculateTaxes(item, supplier, customer, gstEnabled);
        copy[existingIndex] = item;
        return copy;
      }

      let rateToUse = product.price;
      if (selectedCustomerId) {
        const lastRate = StorageService.getLastSalePrice(selectedCustomerId, product.id);
        if (lastRate !== null) rateToUse = lastRate;
      }

      const newItem: InvoiceItem = {
        productId: product.id,
        barcodeSnapshot: barcodeSnapshot || product.barcode,
        description: product.name,
        quantity: 1,
        unit: product.unit || 'pcs',
        rate: rateToUse,
        baseAmount: rateToUse,
        hsn: product.hsn || '',
        gstRate: product.gstRate || 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: rateToUse,
      };
      calculateTaxes(newItem, supplier, customer, gstEnabled);

      return [...prev, newItem];
    });

  };

  const handleBarcodeScan = (barcode: string, source: BarcodeSource) => {
    const started = Date.now();
    const liveProducts = StorageService.getProducts();
    const result = lookupBarcode(liveProducts, barcode);

    StorageService.logBarcodeScan({
      productId: result.product?.id,
      source,
      context: 'INVOICE',
      result: !result.valid ? 'INVALID' : result.found ? 'MATCHED' : result.archived ? 'DUPLICATE' : 'NOT_FOUND',
      latencyMs: Date.now() - started,
      performedBy: StorageService.getUserId() || undefined,
    });

    if (!result.valid) {
      setScanMsg({ kind: 'err', text: 'Barcode format/value valid nahi hai.' });
      return 'rejected' as const;
    }
    if (result.archived) {
      setScanMsg({ kind: 'warn', text: 'Product archived hai. Restore karke use karein.' });
      return 'rejected' as const;
    }
    if (!result.found || !result.product) {
      setScanMsg({
        kind: 'warn',
        text: `Barcode ${barcode} kisi item se linked nahi hai.`,
      });
      return StorageService.isBarcodeTaken(barcode) ? 'rejected' as const : 'unlinked' as const;
    }

    const product = result.product;
    addProductToInvoice(product, barcode);
    setLastScannedId(product.id);
    HapticService.light();

    const available = Number(product.stock || 0);
    const stockNote = available <= 0 ? ' Is product ka stock available nahi hai.' : '';
    setScanMsg({
      kind: available <= 0 ? 'warn' : 'ok',
      text: `${product.name} ka 1 unit bill mein add hua.${stockNote}`,
      itemId: product.id,
    });
    return 'added' as const;
  };

  /** Undo the most recent scan (PRD §14: undo last scan). */
  const handleUndoLastScan = () => {
    if (!lastScannedId) return;
    setLastScannedId(null);
    const idx = items.findIndex(i => i.productId === lastScannedId);
    if (idx < 0) return;
    const item = items[idx];
    if (Number(item.quantity) > 1) {
      const copy = [...items];
      const updated = { ...copy[idx] };
      updated.quantity = Number(updated.quantity) - 1;
      calculateTaxes(updated, company, customers.find(c => c.id === selectedCustomerId), gstEnabled);
      copy[idx] = updated;
      setItems(copy);
      setScanMsg({ kind: 'ok', text: `${updated.description} — quantity ${updated.quantity} ho gayi.` });
    } else {
      setItems(items.filter((_, i) => i !== idx));
      setScanMsg({ kind: 'ok', text: `${item.description} bill se hata diya.` });
    }
  };

  // Voice Input Handler - Add items from voice command
  const handleVoiceItems = (voiceItems: ParsedItem[]) => {
    setHasChanges(true);
    const supplier = company;
    const customer = customers.find(c => c.id === selectedCustomerId);

    voiceItems.forEach(voiceItem => {
      // Find matching product by name
      const product = products.find(p =>
        p.name.toLowerCase().includes(voiceItem.productName.toLowerCase()) ||
        voiceItem.productName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (product) {
        // Check if item already exists in invoice
        const existingIndex = items.findIndex(i => i.productId === product.id);

        if (existingIndex > -1) {
          // Increment quantity
          handleUpdateItem(existingIndex, 'quantity', items[existingIndex].quantity + voiceItem.quantity);
        } else {
          // Add new item
          const newItem: InvoiceItem = {
            productId: product.id,
            description: product.name,
            quantity: voiceItem.quantity,
            rate: voiceItem.rate || product.price,
            baseAmount: 0,
            hsn: product.hsn || '',
            gstRate: product.gstRate || 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            totalAmount: 0
          };

          newItem.baseAmount = newItem.quantity * newItem.rate;
          if (gstEnabled) calculateTaxes(newItem, supplier, customer);
          else newItem.totalAmount = newItem.baseAmount;

          setItems(prev => [...prev.filter(i => i.productId), newItem]);
        }
      } else {
        // Product not found - create a manual entry
        const newItem: InvoiceItem = {
          productId: crypto.randomUUID(),
          description: voiceItem.productName,
          quantity: voiceItem.quantity,
          rate: voiceItem.rate,
          baseAmount: voiceItem.quantity * voiceItem.rate,
          hsn: '',
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalAmount: voiceItem.quantity * voiceItem.rate
        };
        setItems(prev => [...prev.filter(i => i.productId), newItem]);
      }
    });

    SoundService.playSuccess();
    HapticService.success();
  };

  // Smart Calculator Logic
  const handleSmartCalcInput = (char: string) => {
    HapticService.light();
    setCalcError('');
    if (char === 'C') {
      setSmartCalcInput('');
    } else if (char === '+') {
      if (smartCalcInput) handleSmartAction('ADD');
    } else if (char === '*') {
      // Prevent multiple *
      if (!smartCalcInput.includes('*')) setSmartCalcInput(prev => prev + char);
    } else if (char === 'BILL_DISC') {
      const val = parseFloat(smartCalcInput);
      if (!isNaN(val) && val > 0) {
        // Apply new discount from input
        setDiscountValue(val);
        setDiscountType('PERCENTAGE'); // Default to %
        setSmartCalcInput('');
        HapticService.success();
      } else {
        // No input, toggle existing discount
        if (discountValue > 0) {
          if (discountType === 'PERCENTAGE') {
            setDiscountType('AMOUNT'); // Switch to Flat Amount
            HapticService.light();
          } else {
            setDiscountValue(0); // Turn Off
            HapticService.medium();
          }
        }
      }
    } else if (char === '-') {
      // Primary Action: REMOVE item (if input present)
      if (smartCalcInput && smartCalcInput !== '-') {
        handleSmartAction('REMOVE');
      } else {
        // Start negative number (for removal by ID like -1001 or just valid negative entry)
        setSmartCalcInput(prev => prev + char);
      }
    } else {
      setSmartCalcInput(prev => prev + char);
    }
  };

  const handleSmartAction = (action: 'ADD' | 'REMOVE') => {
    // 1. Analyze Input for Mode (Remove vs Add vs Discount)
    let finalAction = action;
    let inputToParse = smartCalcInput;
    let discountValue = 0;

    // Check for Negative Entry (Remove Mode) - e.g. "-1001"
    if (smartCalcInput.startsWith('-')) {
      finalAction = 'REMOVE';
      inputToParse = smartCalcInput.substring(1); // Remove leading '-'
    } else if (smartCalcInput.includes('-')) {
      // Check for Discount (Add Mode with Discount) - e.g. "1001-50"
      const discParts = smartCalcInput.split('-');
      // Last part is discount?
      if (discParts.length === 2) {
        inputToParse = discParts[0];
        discountValue = Number(discParts[1]) || 0;
      }
    }

    // 2. Parse ID and Quantity
    const parts = inputToParse.split('*');
    let product: Product | undefined;
    let quantityOp = 1;

    if (parts.length === 1) {
      // Just ID
      product = products.find(p => p.id === parts[0]);
    } else if (parts.length === 2) {
      // Try Part 0 as ID
      let p = products.find(prod => prod.id === parts[0]);
      if (p) {
        product = p;
        quantityOp = Number(parts[1]) || 1;
      } else {
        // Try Part 1 as ID
        p = products.find(prod => prod.id === parts[1]);
        if (p) {
          product = p;
          quantityOp = Number(parts[0]) || 1;
        }
      }
    }

    if (!product) {
      setCalcError('Item ID not found');
      HapticService.heavy(); // Error haptic
      return;
    }

    setHasChanges(true);
    const existingItemIndex = items.findIndex(i => i.productId === product!.id); // bang operator safe due to check above

    if (finalAction === 'ADD') {
      if (existingItemIndex > -1) {
        // Increment quantity
        handleUpdateItem(existingItemIndex, 'quantity', items[existingItemIndex].quantity + quantityOp);

        // Update discount if provided (generic overwrite or add? let's overwrite for now or just set if provided)
        if (discountValue > 0) {
          handleUpdateItem(existingItemIndex, 'discountType', 'AMOUNT');
          handleUpdateItem(existingItemIndex, 'discountValue', discountValue);
        }

      } else {
        // Add new item
        const newItem: InvoiceItem = {
          productId: product.id,
          description: product.name,
          quantity: quantityOp,
          rate: product.price,
          baseAmount: 0,
          hsn: product.hsn || '',
          gstRate: product.gstRate || 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalAmount: 0,
          discountType: 'AMOUNT',
          discountValue: discountValue,
          discountAmount: discountValue // Initial calc will fix this but good to set
        };
        // Calculate taxes... reuse logic
        const supplier = company;
        const customer = customers.find(c => c.id === selectedCustomerId);
        let rateToUse = product.price;
        if (selectedCustomerId) {
          const lastRate = StorageService.getLastSalePrice(selectedCustomerId, product.id);
          if (lastRate !== null) rateToUse = lastRate;
        }
        newItem.rate = rateToUse;

        // Manual Discount Calc for Initial
        if (discountValue > 0) {
          newItem.discountAmount = discountValue;
          newItem.baseAmount = (newItem.quantity * newItem.rate) - discountValue;
        } else {
          newItem.baseAmount = newItem.quantity * newItem.rate;
        }

        if (gstEnabled) calculateTaxes(newItem, supplier, customer);
        else newItem.totalAmount = newItem.baseAmount;

        setItems(prev => [...prev.filter(i => i.productId), newItem]);
      }
    } else {
      // REMOVE / DECREASE
      if (existingItemIndex > -1) {
        const currentQty = items[existingItemIndex].quantity;
        const newQty = currentQty - quantityOp;

        if (newQty <= 0) {
          // Remove functionality
          handleRemoveItem(existingItemIndex);
        } else {
          // Decrease functionality
          handleUpdateItem(existingItemIndex, 'quantity', newQty);
        }
      } else {
        setCalcError('Item not in list');
        HapticService.heavy();
        return;
      }
    }

    setSmartCalcInput(''); // Reset for next item
    HapticService.medium(); // Success haptic
  };

  const modalRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const handleModalKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'productId') {
        modalRefs.current['quantity']?.focus();
      } else if (field === 'quantity') {
        modalRefs.current['rate']?.focus();
      } else if (field === 'rate') {
        // Save & Add Next
        setShowItemModal(false);
        setTimeout(handleAddItemAndOpen, 300);
      }
    }
  };

  // Calculations
  const calculateSubtotal = () => items.reduce((sum, item) => sum + (item.baseAmount || 0), 0);
  const calculateTotalCGST = () => items.reduce((sum, item) => sum + (item.cgstAmount || 0), 0);
  const calculateTotalSGST = () => items.reduce((sum, item) => sum + (item.sgstAmount || 0), 0);
  const calculateTotalIGST = () => items.reduce((sum, item) => sum + (item.igstAmount || 0), 0);

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();

    // Calculate Discount Amount
    let globalDiscountAmount = 0;
    if (discountType === 'PERCENTAGE') {
      globalDiscountAmount = (subtotal * discountValue) / 100;
    } else {
      globalDiscountAmount = discountValue;
    }

    // Tax is usually calculated on discounted base if discount is pre-tax, OR on subtotal if discount is post-tax.
    // Standard practice: Discount reduces taxable value? OR Discount on final bill?
    // Request says "full bill me dena ho toh", implies Total Bill Discount.

    // Approach A: Discount reduces Taxable Value (Subtotal) -> Re-calculate Tax?
    // Approach B: Discount on Final Total (Post-Tax).

    // Let's implement Discount on Subtotal (Pre-Tax) so taxes are reduced, or Discount on Total (Post-Tax).
    // Usually "Bill Discount" is on the final payable amount or subtotal. 
    // To keep it simple and safe for GST, lets apply it as a reduction to the Total Payable for now, 
    // BUT strictly speaking, for GST invoices, discounts should be line-item or pre-tax. 
    // However, for typical "Bill Book" usage, a flat deduction from total is often expected.

    // Let's assume Post-Tax Discount for "Bill Discount" simplicity unless purely accounting.
    // ACTUALLY: Let's apply it to the Subtotal effectively for calculation?
    // No, let's keep it clean: Subtotal + Tax = Total - Discount.

    const cgst = calculateTotalCGST();
    const sgst = calculateTotalSGST();
    const igst = calculateTotalIGST();
    const chargesSum = additionalCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const totalBeforeDiscount = subtotal + cgst + sgst + igst + chargesSum;
    const finalTotal = totalBeforeDiscount - globalDiscountAmount;

    return finalTotal > 0 ? finalTotal : 0;
  };

  const calculateRoundedTotal = () => {
    const total = calculateTotal();
    if (roundUpTo === 0) return total;
    return Math.ceil(total / roundUpTo) * roundUpTo;
  };

  const getRoundUpAmount = () => {
    if (roundUpTo === 0) return 0;
    return calculateRoundedTotal() - calculateTotal();
  };

  // Creation Handlers
  const handleCreateCustomer = (query: string) => {
    if (query.includes('|')) {
      const [name, phone] = query.split('|');
      setNewCustomerName(name);
      setNewCustomerPhone(phone);
    } else {
      setNewCustomerName(query);
      setNewCustomerPhone('');
    }
    setShowCustomerModal(true);
  };



  const handleCreateProduct = (nameQuery: string, index: number) => {
    setNewProductName(nameQuery);
    setNewProductPrice('');
    setNewProductId('');
    setEditingProductId(null);
    setPendingProductIndex(index);
    setShowProductModal(true);
  };

  const saveNewProduct = () => {
    const idToCheck = newProductId.trim();
    if (idToCheck) {
      const existingProduct = products.find(p => p.id === idToCheck);
      // If a product with this ID exists, AND we are not currently editing that specific product...
      if (existingProduct && existingProduct.id !== editingProductId) {
        alert("Warning: This Item ID already exists! Please use a unique ID.");
        return;
      }
    }

    const newProduct: Product = {
      id: newProductId.trim() || crypto.randomUUID(),
      name: newProductName,
      price: Number(newProductPrice) || 0,
      stock: 100,
      category: 'General',
      hsn: newProductHSN,
      gstRate: Number(newProductGST) || 0
    };
    StorageService.saveProduct(newProduct);
    setProducts(StorageService.getProducts());

    if (pendingProductIndex !== null) {
      const newItems = [...items];
      const item = newItems[pendingProductIndex];
      item.productId = newProduct.id;
      item.description = newProduct.name;
      item.rate = newProduct.price;
      item.quantity = 1;
      item.gstRate = newProduct.gstRate || 0;
      item.hsn = newProduct.hsn || '';
      calculateTaxes(item, company, customers.find(c => c.id === selectedCustomerId));
      setItems(newItems);
    }
    setShowProductModal(false);
    setNewProductName('');
    setNewProductPrice('');
    setNewProductHSN('');
    setNewProductGST('0');
    setNewProductId('');
    setEditingProductId(null);
    setPendingProductIndex(null);
  };

  const handleSubmit = () => {
    if (initialInvoice && hasChanges && !showEditWarning) {
      setShowEditWarning(true);
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return alert('Select a customer');
    // Filter out items with no product selected (ghost rows)
    const validItems = items.filter(i => i.productId && i.productId.trim() !== '');

    if (validItems.length === 0) return alert('Add at least one item');

    const cleanedItems: InvoiceItem[] = validItems.map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      rate: Number(item.rate) || 0,
      baseAmount: Number(item.baseAmount) || 0,
      gstRate: Number(item.gstRate) || 0,
      cgstAmount: Number(item.cgstAmount) || 0,
      sgstAmount: Number(item.sgstAmount) || 0,
      igstAmount: Number(item.igstAmount) || 0,
      totalAmount: Number(item.totalAmount) || 0
    }));

    const status = paymentMode === 'CASH' ? 'PAID' : 'PENDING';
    const subtotal = calculateSubtotal();
    const totalCgst = calculateTotalCGST();
    const totalSgst = calculateTotalSGST();
    const totalIgst = calculateTotalIGST();
    const supplier = company as any;

    // Calculate final total with discount
    let globalDiscountAmount = 0;
    if (discountType === 'PERCENTAGE') {
      globalDiscountAmount = (subtotal * discountValue) / 100;
    } else {
      globalDiscountAmount = discountValue;
    }
    // const totalBeforeDiscount = subtotal + totalCgst + totalSgst + totalIgst;
    // const finalTotal = totalBeforeDiscount - globalDiscountAmount;

    const roundedTotal = calculateRoundedTotal();
    const roundUpAmount = getRoundUpAmount();
    const resolvedState = placeOfSupply.trim() || customer.state || '';
    const resolvedTaxType = (supplier?.state || 'Delhi') === resolvedState ? 'INTRA_STATE' : 'INTER_STATE';

    const invoiceData: Invoice = {
      id: initialInvoice ? initialInvoice.id : crypto.randomUUID(),
      invoiceNumber: initialInvoice ? initialInvoice.invoiceNumber : StorageService.generateVoucherNumber(effectiveType, date, customer.id),
      customerId: customer.id,
      customerName: customer.company || customer.name,
      customerAddress: customer.address || '',
      customerState: resolvedState,
      customerGstin: customer.gstin || '',
      supplierGstin: supplier?.gstin || '',
      taxType: resolvedTaxType,
      date,
      dueDate,
      items: cleanedItems,
      additionalCharges: additionalCharges.filter(c => c.label.trim() && Number(c.amount) > 0),
      ewayBillNumber: ewayBillNumber.trim() || undefined,
      vehicleNumber: vehicleNumber.trim() || undefined,
      accountId: accountId || undefined,
      godownId: godownId || undefined,
      discountType,
      discountValue,
      discountAmount: Math.round(globalDiscountAmount * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      gstEnabled: gstEnabled && cleanedItems.some(i => (i.gstRate || 0) > 0),
      roundUpTo: roundUpTo,
      roundUpAmount: Math.round(roundUpAmount * 100) / 100,
      total: Math.round(roundedTotal * 100) / 100,
      status: isReturnDoc ? 'PENDING' : status,
      previousBalance: includePreviousBalance ? previousBalance : 0,
      notes: notes,
      paymentMode: isReturnDoc ? 'CREDIT' : paymentMode,
      type: effectiveType,
      templateFormat: company?.invoiceSettings?.format || (company as any).invoiceTemplate?.toUpperCase() || InvoiceFormat.DEFAULT
    };

    // Play success sound and haptic feedback
    SoundService.playSuccess();
    HapticService.heavy();

    onSave(invoiceData);
  };

  return (
    <div className="min-h-screen bg-surface-container-low pb-32 font-sans">
      {/* Edit Warning Modal */}
      {showEditWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-800 rounded-[24px] shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Save Changes?</h3>
            <p className="text-slate-500 mb-6">You are editing an existing invoice. This will update the customer balance and records.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowEditWarning(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleSubmit} className="flex-1 py-3 font-bold bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">Yes, Save</button>
            </div>
          </motion.div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4">
          <button type="button" aria-label="Back" onClick={onCancel} className={workspace.secondary + ' w-11 shrink-0 !px-0'}><ArrowLeft size={19} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
              {({
                QUOTATION: initialInvoice ? 'Edit Quotation' : 'New Quotation',
                PROFORMA: initialInvoice ? 'Edit Proforma Invoice' : 'New Proforma Invoice',
                DELIVERY_CHALLAN: initialInvoice ? 'Edit Delivery Challan' : 'New Delivery Challan',
                PURCHASE_ORDER: initialInvoice ? 'Edit Purchase Order' : 'New Purchase Order',
                DEBIT_NOTE: initialInvoice ? 'Edit Debit Note' : 'New Debit Note',
                CREDIT_NOTE: initialInvoice ? 'Edit Return' : 'New Return (CN)',
                PURCHASE: initialInvoice ? 'Edit Purchase' : 'New Purchase',
                SALE: initialInvoice ? 'Edit Invoice' : 'New Invoice',
              }[effectiveType] || 'New Invoice')}
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
              {getInvoiceNumberPreview()}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto space-y-3 pt-3 px-3">
        {/* Customer Section - Compact */}
        <div className={workspace.panel + ' p-4'}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-google-blue/10 flex items-center justify-center text-google-blue">
              <UserPlus className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Bill To</h2>
          </div>
          <div className="relative group">
            <Autocomplete
              options={customers.map(c => ({ id: c.id, label: c.company, subLabel: c.name }))}
              value={selectedCustomerId}
              onChange={(val) => {
                setSelectedCustomerId(val);
                setHasChanges(true);
              }}
              onCreate={handleCreateCustomer}
              placeholder="Search Customer..."
              type="customer"
            />
          </div>
          {selectedCustomerId && StorageService.predictNextItem(selectedCustomerId) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Suggested Product:</span>
              <button
                onClick={() => {
                  const pred = StorageService.predictNextItem(selectedCustomerId);
                  if (pred) handleAddItem(); // Add a new row and update it
                  // Or just update the last empty row
                  const lastIndex = items.findIndex(i => i.productId === '');
                  if (lastIndex !== -1 && pred) handleUpdateItem(lastIndex, 'productId', pred.id);
                  else if (pred) {
                    const newIdx = items.length;
                    handleAddItem();
                    setTimeout(() => handleUpdateItem(newIdx, 'productId', pred.id), 0);
                  }
                  HapticService.light();
                }}
                className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-800"
              >
                + {StorageService.predictNextItem(selectedCustomerId)?.name}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-[9px] font-bold text-muted-foreground uppercase px-1 mb-0.5 block">Date</label>
              <div className="relative bg-surface-container-high rounded-xl overflow-hidden border border-border">
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setHasChanges(true); }} className="w-full bg-transparent p-2 text-xs font-bold text-foreground outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold text-muted-foreground uppercase px-1 mb-0.5 block">Due Date</label>
              <div className="relative bg-surface-container-high rounded-xl overflow-hidden border border-border">
                <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setHasChanges(true); }} className="w-full bg-transparent p-2 text-xs font-bold text-foreground outline-none" />
              </div>
            </div>
          </div>

          {/* Previous Balance Toggle */}
          {selectedCustomerId && previousBalance > 0 && !isCreditNote && (
            <div className="mt-4 p-4 rounded-3xl bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-100 dark:border-amber-900/30 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 shadow-sm border border-amber-200/50 dark:border-amber-800/30">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-600/70 uppercase tracking-[0.2em] mb-0.5">PURANA BAKI (Prev. Bal)</p>
                  <p className="text-xl font-black text-slate-800 dark:text-amber-50 tracking-tight">₹{previousBalance.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setIncludePreviousBalance(!includePreviousBalance);
                  HapticService.impact();
                }}
                type="button"
                className={`h-11 px-6 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-md active:shadow-sm ${includePreviousBalance
                  ? 'bg-amber-500 text-white border-b-4 border-amber-700'
                  : 'bg-white dark:bg-slate-800 text-slate-400 border-2 border-slate-100 dark:border-slate-700'
                  }`}
              >
                {includePreviousBalance ? 'ADDED ✓' : 'ADD TO BILL'}
              </motion.button>
            </div>
          )}
        </div>

        {/* payment Mode - Compact */}
        <div className="bg-surface-container p-1 rounded-full border border-border flex items-center">
          <button
            onClick={() => { setPaymentMode('CREDIT'); setHasChanges(true); }}
            className={`flex-1 py-2 px-4 rounded-full flex items-center justify-center gap-1 transition-all text-xs ${paymentMode === 'CREDIT'
              ? 'bg-google-red text-white font-bold'
              : 'text-muted-foreground font-bold hover:bg-surface-container-high'
              }`}
          >
            <CreditCard className="w-4 h-4" /> <span>Credit</span>
          </button>
          <button
            onClick={() => { setPaymentMode('CASH'); setHasChanges(true); }}
            className={`flex-1 py-2 px-4 rounded-full flex items-center justify-center gap-1 transition-all text-xs ${paymentMode === 'CASH'
              ? 'bg-google-green text-white font-bold'
              : 'text-muted-foreground font-bold hover:bg-surface-container-high'
              }`}
          >
            <Banknote className="w-4 h-4" /> <span>Cash</span>
          </button>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">Items</h2>
              <VoiceInput onItemsParsed={handleVoiceItems} />
            </div>
            <button type="button" onClick={handleAddItemAndOpen} className={workspace.secondary}><Plus size={16} /> Add item</button>
          </div>

          {/* Always-visible scan surface: hardware scanner + camera (PRD §14) */}
          <div className="bg-surface-container rounded-2xl border border-border p-3">
            <BarcodeScanField
              label="Scan barcode to add item"
              placeholder="Barcode scan karein…"
              onScan={handleBarcodeScan}
              continuous
              linkUnmatched
              cameraFeedback={scanMsg}
              scanDraft={{
                title: 'Current bill',
                lines: billItems.map((item, index) => ({
                  id: `${item.productId}:${index}`,
                  productId: item.productId,
                  name: item.description,
                  quantity: Number(item.quantity),
                  amount: item.totalAmount ?? item.baseAmount,
                })),
                total: calculateRoundedTotal(),
              }}
              finalize={customers.some(customer => customer.id === selectedCustomerId) ? {
                label: 'Save bill',
                run: () => { handleSubmit(); return true; },
              } : undefined}
            />
            {scanMsg && (
              <div
                role="status"
                className={`mt-2 rounded-xl px-3 py-2 text-[12px] font-bold ${
                  scanMsg.kind === 'ok'
                    ? 'bg-google-green/10 text-google-green'
                    : scanMsg.kind === 'warn'
                    ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-google-red/10 text-google-red'
                }`}
              >
                {scanMsg.text}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground">
                {billItems.length} {billItems.length === 1 ? 'item' : 'items'} · {billItems.reduce((sum, item) => sum + Number(item.quantity), 0)} qty
              </p>
              {lastScannedId && (
                <button
                  onClick={handleUndoLastScan}
                  className="text-[10px] font-black uppercase tracking-widest text-google-blue bg-google-blue/10 px-3 py-1.5 rounded-full"
                >
                  Undo last scan
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {items.filter(i => i.productId).map((item, idx) => (
                <motion.div
                  key={idx}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  role="button"
                  tabIndex={0}
                  aria-label={'Edit line ' + item.description}
                  onClick={() => handleOpenItemModal(items.indexOf(item))}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleOpenItemModal(items.indexOf(item));
                    }
                  }}
                  className="bg-surface-container p-3 rounded-xl border border-border flex gap-3 items-center active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-google-blue/10 flex items-center justify-center text-google-blue shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{item.description}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-[9px] font-bold text-muted-foreground">{item.quantity}x</span>
                      <span className="text-[10px] text-muted-foreground">@ ₹{item.rate}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-foreground">₹{(item.totalAmount || 0).toLocaleString('en-IN')}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {!billItems.length && <p className="px-1 py-3 text-sm text-muted-foreground">Scan a barcode or choose Add item to start.</p>}
        </div>

      </div>

      {/* Item Zoom Modal */}
      <AnimatePresence>
        {showItemModal && activeItemIndex !== null && (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowItemModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%", borderRadius: "40px 40px 0 0" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative bg-white dark:bg-slate-900 w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl pb-12"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-8" />

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Item</label>
                  <Autocomplete
                    options={products.map(p => ({ id: p.id, label: p.name }))}
                    value={items[activeItemIndex].productId}
                    onChange={(val) => handleUpdateItem(activeItemIndex, 'productId', val)}
                    onCreate={(query) => handleCreateProduct(query, activeItemIndex)}
                    placeholder="Search or Create Product..."
                    type="product"
                    autoFocus
                    onKeyDown={(e) => handleModalKeyDown(e, 'productId')}
                    inputRef={(el) => { modalRefs.current['productId'] = el; }}
                  />
                  {items[activeItemIndex].productId && (
                    <div className="flex justify-end mt-1">
                      <button
                        onClick={() => handleEditProduct(items[activeItemIndex].productId)}
                        className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg flex items-center gap-1"
                      >
                        Edit Product Details
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Qty</label>
                    <input
                      type="number"
                      className="w-full bg-transparent text-2xl font-black text-blue-600 outline-none"
                      value={items[activeItemIndex].quantity || ''}
                      onChange={(e) => handleUpdateItem(activeItemIndex, 'quantity', e.target.value)}
                      placeholder="1"
                      onKeyDown={(e) => handleModalKeyDown(e, 'quantity')}
                      ref={(el) => { modalRefs.current['quantity'] = el; }}
                    />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Rate</label>
                    <input
                      type="number"
                      className="w-full bg-transparent text-2xl font-black text-slate-900 dark:text-slate-100 outline-none"
                      value={items[activeItemIndex].rate || ''}
                      onChange={(e) => handleUpdateItem(activeItemIndex, 'rate', e.target.value)}
                      placeholder="0.00"
                      onKeyDown={(e) => handleModalKeyDown(e, 'rate')}
                      ref={(el) => { modalRefs.current['rate'] = el; }}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowItemModal(false);
                      setTimeout(handleAddItemAndOpen, 300);
                    }}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 py-5 rounded-[24px] font-black text-xs uppercase tracking-wider active:scale-95 transition-all border border-slate-200 dark:border-slate-700"
                  >
                    Save & Add Next
                  </button>
                  <button
                    onClick={() => setShowItemModal(false)}
                    className="flex-1 bg-blue-600 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    Save & Done
                  </button>
                  <button
                    onClick={() => {
                      handleRemoveItem(activeItemIndex);
                      setShowItemModal(false);
                    }}
                    className="w-16 bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center justify-center rounded-[24px] active:scale-95 transition-all"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>

                <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-8 rounded-[40px] text-white flex justify-between items-center shadow-2xl shadow-blue-500/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                  <div className="relative z-10">
                    <p className="text-[11px] font-black uppercase opacity-70 tracking-widest mb-1">Item Total Amount</p>
                    <p className="text-5xl font-black tracking-tighter drop-shadow-lg">₹{(items[activeItemIndex].totalAmount || 0).toFixed(2).toLocaleString()}</p>
                  </div>
                  <div className="text-right relative z-10">
                    <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20">
                      <p className="text-[10px] font-black uppercase tracking-tight">Tax Included</p>
                      <p className="text-sm font-black">GST {items[activeItemIndex].gstRate}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* More Bill Details (GST / E-Way / Charges / Account) */}
      <div className="max-w-5xl mx-auto px-4 mt-4">
        <div className="bg-white dark:bg-slate-800 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMoreDetails(!showMoreDetails)}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Truck className="w-4 h-4 text-google-blue" />
              More Bill Details (Place of Supply, E-Way Bill, Extra Charges, Account)
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} />
          </button>

          {showMoreDetails && (
            <div className="p-6 pt-2 space-y-4 border-t border-slate-100 dark:border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Place of Supply (State)</label>
                  <input
                    type="text"
                    value={placeOfSupply}
                    onChange={(e) => { setPlaceOfSupply(e.target.value); setHasChanges(true); }}
                    placeholder="e.g. Delhi / Maharashtra"
                    className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 text-xs font-bold outline-none border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">E-Way Bill No.</label>
                  <input
                    type="text"
                    value={ewayBillNumber}
                    onChange={(e) => { setEwayBillNumber(e.target.value); setHasChanges(true); }}
                    placeholder="Optional 12-digit EWB"
                    className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 text-xs font-bold outline-none border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Vehicle / Transport No.</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => { setVehicleNumber(e.target.value.toUpperCase()); setHasChanges(true); }}
                    placeholder="e.g. DL01AB1234"
                    className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 text-xs font-bold outline-none border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Deposit / Settlement Account</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 text-xs font-bold outline-none border border-slate-200 dark:border-slate-700"
                  >
                    <option value="">Auto ({paymentMode === 'CASH' ? 'Cash in Hand' : 'Primary Bank'})</option>
                    {StorageService.ensureDefaultAccounts().map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (₹{(a.balance || 0).toLocaleString('en-IN')})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Godown / Warehouse</label>
                  <select
                    value={godownId}
                    onChange={(e) => setGodownId(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-2.5 text-xs font-bold outline-none border border-slate-200 dark:border-slate-700"
                  >
                    {StorageService.ensureDefaultGodown().map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Additional Charges (Freight / Packing)</span>
                  <button
                    type="button"
                    onClick={() => setAdditionalCharges([...additionalCharges, { id: crypto.randomUUID(), label: 'Freight Charges', amount: 0 }])}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    + Add Charge
                  </button>
                </div>
                <div className="space-y-2">
                  {additionalCharges.map((chg, cIdx) => (
                    <div key={chg.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={chg.label}
                        onChange={(e) => {
                          const next = [...additionalCharges];
                          next[cIdx] = { ...chg, label: e.target.value };
                          setAdditionalCharges(next);
                        }}
                        placeholder="Label (e.g. Freight)"
                        className="flex-1 bg-slate-50 dark:bg-slate-900 rounded-xl p-2 text-xs font-bold border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="number"
                        value={chg.amount || ''}
                        onChange={(e) => {
                          const next = [...additionalCharges];
                          next[cIdx] = { ...chg, amount: Number(e.target.value) || 0 };
                          setAdditionalCharges(next);
                        }}
                        placeholder="Amount"
                        className="w-28 bg-slate-50 dark:bg-slate-900 rounded-xl p-2 text-xs font-bold border border-slate-200 dark:border-slate-700 text-right"
                      />
                      <button
                        type="button"
                        onClick={() => setAdditionalCharges(additionalCharges.filter((x) => x.id !== chg.id))}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes Section */}
      <div className="max-w-5xl mx-auto px-4 pb-4 mt-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Additional Notes</h2>
          <textarea
            className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            rows={3}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setHasChanges(true); }}
            placeholder="Terms & Conditions, Payment Instructions, etc."
          />
        </div>
      </div>

      <section aria-label="Bill discount" className="mx-auto max-w-5xl px-3 pb-3">
        <div className={workspace.panel + ' grid grid-cols-[1fr_auto_auto] items-center gap-2 p-3'}>
          <label htmlFor="bill-discount" className="text-sm font-semibold">Bill discount</label>
          <select aria-label="Discount type" value={discountType} onChange={event => { setDiscountType(event.target.value as 'PERCENTAGE' | 'AMOUNT'); setHasChanges(true); }} className={workspace.input + ' w-auto'}>
            <option value="PERCENTAGE">%</option><option value="AMOUNT">₹</option>
          </select>
          <input id="bill-discount" type="number" min="0" value={discountValue} onChange={event => { setDiscountValue(Number(event.target.value)); setHasChanges(true); }} className={workspace.input + ' w-20'} />
        </div>
      </section>

      {/* Smart Calculator Modal */}
      {
        showSmartCalculator && (
          <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[60] flex flex-col pt-safe">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-black flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-500" />
                Smart Billing
              </h2>
              <button onClick={() => setShowSmartCalculator(false)} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-full hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Added Items (Preview) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 dark:bg-slate-950">
              {items.filter(i => i.productId).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                  <Calculator className="w-16 h-16 mb-2" />
                  <p className="font-bold">Enter Item ID & Press '+'</p>
                </div>
              ) : (
                items.filter(i => i.productId).slice().reverse().map((item, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={idx}
                    className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-sm flex justify-between items-center border border-slate-100 dark:border-slate-800"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      // Long press logic simulation
                      if (window.confirm(`Remove ${item.description}?`)) {
                        handleRemoveItem(items.indexOf(item));
                      }
                    }}
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{item.description}</p>
                      <p className="text-xs text-slate-400">ID: {item.productId} | ₹{item.rate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-black text-blue-600">x{item.quantity}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Calculator Interface */}
            <div className="bg-white dark:bg-slate-900 p-4 pb-8 shadow-[0_-5px_30px_rgba(0,0,0,0.1)] rounded-t-[32px]">
              {/* Display */}
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 mb-4 flex flex-col items-end justify-center min-h-[80px]">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{calcError || 'ITEM ID'}</span>
                <span className={`text-4xl font-mono font-black tracking-widest ${calcError ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>
                  {smartCalcInput || '0'}
                </span>
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-4 gap-3">
                {/* Row 1: 7, 8, 9, CLR */}
                {[7, 8, 9].map(n => (
                  <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-200 dark:border-slate-700">{n}</button>
                ))}
                <button onClick={() => handleSmartCalcInput('C')} className="h-16 rounded-2xl bg-red-50 text-red-600 text-xl font-black hover:bg-red-100 active:scale-95 transition-all">CLR</button>

                {/* Row 2: 4, 5, 6, QTY(*) */}
                {[4, 5, 6].map(n => (
                  <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-200 dark:border-slate-700">{n}</button>
                ))}
                <button onClick={() => handleSmartCalcInput('*')} className="h-16 rounded-2xl bg-indigo-50 text-indigo-600 text-xl font-black hover:bg-indigo-100 active:scale-95 transition-all flex flex-col items-center justify-center leading-none">
                  <span>×</span>
                  <span className="text-[9px] uppercase tracking-widest">QTY</span>
                </button>

                {/* Row 3: 1, 2, 3, ADD(+) */}
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => handleSmartCalcInput(n.toString())} className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-200 dark:border-slate-700">{n}</button>
                ))}
                <button onClick={() => handleSmartCalcInput('+')} className="row-span-2 h-full rounded-2xl bg-blue-600 text-white text-3xl font-black hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-500/30">+</button>

                {/* Row 4: 0, ., REMOVE(-) */}
                <button onClick={() => handleSmartCalcInput('0')} className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl font-bold hover:bg-slate-100 active:scale-95 transition-all shadow-sm border border-slate-200 dark:border-slate-700">0</button>
                <button onClick={() => handleSmartCalcInput('BILL_DISC')} className={`h-16 rounded-2xl font-bold active:scale-95 transition-all flex flex-col items-center justify-center leading-none shadow-sm border ${discountValue > 0 ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/30' : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'}`}>
                  <span className="text-xl">{discountValue > 0 ? (discountType === 'PERCENTAGE' ? '%' : '₹') : '%'}</span>
                  <span className="text-[9px] uppercase tracking-widest">{discountValue > 0 ? `${discountValue} ${discountType === 'PERCENTAGE' ? 'OFF' : ''}` : 'DISC'}</span>
                </button>
                <button onClick={() => handleSmartCalcInput('-')} className="h-16 rounded-2xl bg-orange-50 text-orange-600 font-bold active:scale-95 transition-all flex flex-col items-center justify-center hover:bg-orange-100 leading-none shadow-sm border border-orange-100">
                  <span className="text-xl material-symbols-outlined">delete</span>
                  <span className="text-[9px] uppercase tracking-widest">REM</span>
                </button>
              </div>

              <button onClick={handleSmartFinish} className="w-full mt-3 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold active:scale-95 transition-all flex items-center justify-center hover:bg-slate-200">
                <span className="text-xs font-black uppercase text-blue-600">Save & Close</span>
              </button>
            </div>


          </div>
        )
      }

      {/* Modal for Creating Customer */}
      <AnimatePresence>
        {showCustomerModal && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              className="bg-white dark:bg-slate-900 rounded-t-[40px] sm:rounded-[40px] w-full max-w-lg p-8 shadow-2xl relative"
            >
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-8 sm:hidden" />
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <UserPlus className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white leading-tight">Add Customer</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Smart Contact Search</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="relative">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Customer Name</label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setNewCustomerName(val);
                        if (val.length >= 2) {
                          const results = await ContactsService.searchContacts(val);
                          setContactSuggestions(results);
                          setShowContactSuggestions(results.length > 0);
                        } else {
                          setShowContactSuggestions(false);
                        }
                      }}
                      onFocus={async () => {
                        await ContactsService.requestWithDisclosure();
                      }}
                      placeholder="Type name to search contacts..."
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/30 rounded-3xl font-bold text-slate-800 dark:text-white outline-none transition-all"
                    />
                  </div>

                  {/* Contact Suggestions Dropdown */}
                  <AnimatePresence>
                    {showContactSuggestions && contactSuggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute left-0 right-0 top-[calc(100%+12px)] z-[120] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto backdrop-blur-xl"
                      >
                        {contactSuggestions.map((contact, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setNewCustomerName(contact.name);
                              setNewCustomerPhone(contact.phone.replace(/\D/g, '').slice(-10));
                              setShowContactSuggestions(false);
                              HapticService.light();
                            }}
                            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-black text-xs">
                                {contact.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-black text-slate-800 dark:text-white">{contact.name}</p>
                                <p className="text-[10px] font-bold text-slate-400">{contact.phone}</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Mobile Number</label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <span className="absolute left-14 top-1/2 -translate-y-1/2 font-black text-indigo-500">+91</span>
                    <input
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="00000 00000"
                      className="w-full pl-24 pr-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/30 rounded-3xl font-black text-slate-800 dark:text-white outline-none tracking-widest transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-12">
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setShowContactSuggestions(false);
                  }}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-3xl font-bold transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!newCustomerName) return;
                    const customerData: Customer = {
                      id: crypto.randomUUID(),
                      name: newCustomerName,
                      phone: newCustomerPhone,
                      company: newCustomerName,
                      email: '',
                      address: '',
                      balance: 0,
                      notifications: []
                    };
                    StorageService.saveCustomer(customerData);
                    setCustomers(StorageService.getCustomers());
                    setSelectedCustomerId(customerData.id);
                    setShowCustomerModal(false);
                    setShowContactSuggestions(false);
                    setNewCustomerName('');
                    setNewCustomerPhone('');
                    HapticService.heavy();
                  }}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-3xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
                >
                  Save Party
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Modal */}
      {
        showProductModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-800 rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Product</h3>
                <button onClick={() => setShowProductModal(false)} className="bg-slate-100 dark:bg-slate-700 p-2 rounded-full dark:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <input type="text" autoFocus placeholder="Product Name" className="w-full p-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                <input type="text" placeholder="Item ID (Optional, for Calculator)" className="w-full p-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest" value={newProductId} onChange={(e) => setNewProductId(e.target.value)} />
                <input type="number" placeholder="Price / Rate" className="w-full p-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500" value={newProductPrice} onChange={(e) => setNewProductPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (!gstEnabled && saveNewProduct())} />
                {gstEnabled && (
                  <div className="flex gap-4">
                    <input type="text" placeholder="HSN" className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-xl outline-none" value={newProductHSN} onChange={(e) => setNewProductHSN(e.target.value)} />
                    <input type="number" placeholder="GST %" className="w-24 p-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-xl outline-none" value={newProductGST} onChange={(e) => setNewProductGST(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNewProduct()} />
                  </div>
                )}
                <button onClick={saveNewProduct} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold mt-4">Save Product</button>
              </div>
            </motion.div>
          </div>
        )
      }

      {/* Amount Received Modal for Credit Sales */}
      {
        showAmountReceivedModal && pendingCreditInvoice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="bg-white dark:bg-slate-800 rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="bg-emerald-600 text-white p-6 rounded-t-3xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-6 h-6" />
                    <h3 className="text-lg font-bold">Amount Received</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowAmountReceivedModal(false);
                      setPendingCreditInvoice(null);
                      setAmountReceived(0);
                    }}
                    className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {pendingCreditInvoice && (
                  <div className="text-center">
                    <p className="text-emerald-100 text-sm mb-1">Bill Total</p>
                    <p className="text-4xl font-black tracking-tighter">
                      ₹{pendingCreditInvoice.total.toLocaleString('en-IN')}
                    </p>
                    <p className="text-emerald-200 text-sm mt-2">
                      Customer: {pendingCreditInvoice.customerName}
                    </p>
                  </div>
                )}
              </div>

              {/* Amount Input */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                    Enter Amount Received
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      autoFocus
                      value={amountReceived || ''}
                      onChange={(e) => setAmountReceived(Number(e.target.value) || 0)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveWithPayment()}
                      placeholder="0"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900 dark:text-white rounded-2xl text-3xl font-black outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                    />
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                {pendingCreditInvoice && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAmountReceived(pendingCreditInvoice.total)}
                      className="flex-1 py-2 px-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                    >
                      Full: ₹{pendingCreditInvoice.total.toLocaleString('en-IN')}
                    </button>
                    <button
                      onClick={() => setAmountReceived(Math.round(pendingCreditInvoice.total / 2))}
                      className="flex-1 py-2 px-3 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors"
                    >
                      Half: ₹{Math.round(pendingCreditInvoice.total / 2).toLocaleString('en-IN')}
                    </button>
                    <button
                      onClick={() => setAmountReceived(0)}
                      className="flex-1 py-2 px-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors"
                    >
                      None
                    </button>
                  </div>
                )}

                {/* Balance Display */}
                {amountReceived > 0 && pendingCreditInvoice && amountReceived < pendingCreditInvoice.total && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-700">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-300">Balance Due:</span>
                      <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                        ₹{(pendingCreditInvoice.total - amountReceived).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSkipPayment}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors"
                  >
                    Full Credit
                  </button>
                  <button
                    onClick={handleSaveWithPayment}
                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Save Receipt
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )
      }

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total payable · {billItems.length} {billItems.length === 1 ? 'item' : 'items'}</p>
            <p className="text-xl font-bold tabular-nums">{workspaceMoney(calculateRoundedTotal())}</p>
          </div>
          <button type="button" onClick={handleSubmit} className={workspace.primary + ' shrink-0'}><Save size={17} /> Save</button>
        </div>
      </footer>

    </div >
  );
};


export default CreateInvoice;
