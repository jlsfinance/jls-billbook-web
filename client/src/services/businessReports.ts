import type { BankAccount, Customer, Expense, Godown, Invoice, InvoiceItem, Payment, Product, StaffMember, StockMovement } from '../types';
import { formatDate } from '../utils/dateUtils';
import { getPaymentAllocations } from './paymentAllocation';

export type ReportCell = number | string;
export type ReportData = {
  headers: string[];
  rows: ReportCell[][];
  summary?: { label: string; value: ReportCell; currency?: boolean }[];
  note?: string;
};

export type ReportFilters = {
  from: string;
  to: string;
  party?: string;
  item?: string;
  godown?: string;
  staff?: string;
  expiry?: string;
  status?: string;
};

export type ReportSource = {
  sales: Invoice[];
  purchases: Invoice[];
  debitNotes: Invoice[];
  customers: Customer[];
  products: Product[];
  payments: Payment[];
  expenses: Expense[];
  accounts: BankAccount[];
  godowns: Godown[];
  stockMovements: StockMovement[];
  staff: StaffMember[];
  currentUserId?: string | null;
};

export const UNRECORDED = 'unrecorded';
const DAY = 86_400_000;
export const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value: number) => Math.round(value * 100) / 100;
const total = <T>(rows: T[], value: (row: T) => number) => round(rows.reduce((sum, row) => sum + value(row), 0));
const money = (label: string, value: number) => ({ label, value: round(value), currency: true });
const day = (value: string) => value?.slice(0, 10) || '';
export const localDay = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
export const inReportRange = (date: string, from: string, to: string) => Boolean(day(date)) && day(date) >= from && day(date) <= to;
export const voucherTax = (voucher: Invoice) => amount(voucher.totalCgst) + amount(voucher.totalSgst) + amount(voucher.totalIgst);
const voucherTaxable = (voucher: Invoice) => amount(voucher.subtotal ?? (amount(voucher.total) - voucherTax(voucher)));
export const voucherNet = (voucher: Invoice) => voucher.subtotal == null
  ? round(amount(voucher.total) - voucherTax(voucher) - amount(voucher.roundUpAmount))
  : round(Math.max(0, voucherTaxable(voucher) + total(voucher.additionalCharges || [], charge => amount(charge.amount)) - amount(voucher.discountAmount)));
export const lineNet = (item: InvoiceItem) => amount(item.baseAmount ?? amount(item.quantity) * amount(item.rate));
const lineNetAfterDiscount = (voucher: Invoice, item: InvoiceItem) => {
  const base = voucherTaxable(voucher);
  return lineNet(item) * (base ? 1 - amount(voucher.discountAmount) / base : 1);
};
const partyName = (party: Customer) => party.company || party.name;
const due = (invoice: Invoice) => invoice.status === 'PAID' ? 0 : Math.max(0, amount(invoice.balanceDue ?? (amount(invoice.total) - amount(invoice.paidAmount ?? invoice.amountReceived))));
const fiscal = (voucher: Invoice) => voucher.type !== 'CREDIT_NOTE' && voucher.type !== 'DEBIT_NOTE' ? 1 : -1;
export const reportCreator = (entry: { createdBy?: string }) => entry.createdBy || UNRECORDED;

const report = (headers: string[], rows: ReportCell[][], summary?: ReportData['summary'], note?: string): ReportData => ({ headers, rows, summary, note });

function recordedCosts(products: Product[], purchases: Invoice[]) {
  const catalog = new Map(products.filter(product => product.purchasePrice != null).map(product => [product.id, amount(product.purchasePrice)]));
  const history = new Map<string, { date: string; rate: number }[]>();
  for (const purchase of [...purchases].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const item of purchase.items) {
      const qty = amount(item.quantity);
      if (!item.productId || qty <= 0) continue;
      const costs = history.get(item.productId) || [];
      costs.push({ date: day(purchase.date), rate: lineNet(item) / qty });
      history.set(item.productId, costs);
    }
  }
  return (id: string, date: string) => history.get(id)?.find(cost => cost.date <= day(date))?.rate ?? catalog.get(id);
}

export function netSaleProfit(sales: Invoice[], products: Product[], purchases: Invoice[]) {
  const costs = recordedCosts(products, purchases.filter(v => !v.isDeleted && v.conversionStatus !== 'CANCELLED'));
  return sales.filter(v => !v.isDeleted && v.conversionStatus !== 'CANCELLED').map(voucher => {
    const sign = fiscal(voucher);
    const lines = voucher.items.filter(item => amount(item.quantity) !== 0).map(item => {
      const unitCost = costs(item.productId, voucher.date);
      return {
        item, quantity: sign * amount(item.quantity), revenue: sign * lineNetAfterDiscount(voucher, item),
        cost: unitCost == null ? null : sign * unitCost * amount(item.quantity),
      };
    });
    const net = sign * voucherNet(voucher);
    const cost = lines.some(line => line.cost == null) ? null : total(lines, line => line.cost ?? 0);
    return { voucher, lines, net, cost, profit: cost == null ? null : round(net - cost) };
  });
}

function voucherReport(vouchers: Invoice[], purchase: boolean) {
  const rows = vouchers.map(voucher => [
    formatDate(voucher.date), voucher.invoiceNumber, voucher.customerName,
    fiscal(voucher) < 0 ? purchase ? 'Debit Note' : 'Credit Note' : purchase ? 'Purchase' : 'Sale',
    round(voucherNet(voucher) * fiscal(voucher)), round(voucherTax(voucher) * fiscal(voucher)),
    round(amount(voucher.total) * fiscal(voucher)), voucher.status,
  ]);
  return report(['Date', 'Voucher', 'Party', 'Type', 'Before GST', 'GST', 'Total', 'Status'], rows, [
    money(purchase ? 'Net Purchases' : 'Net Sales', total(vouchers, voucher => amount(voucher.total) * fiscal(voucher))),
    money('Net GST', total(vouchers, voucher => voucherTax(voucher) * fiscal(voucher))),
  ]);
}

function groupItemSales(sales: Invoice[], mode: string, itemId?: string) {
  const groups = new Map<string, { name: string; party: string; unit: string; quantity: number; net: number; tax: number }>();
  for (const voucher of sales) {
    const sign = fiscal(voucher);
    for (const item of voucher.items) {
      const key = item.productId || item.description;
      if (itemId && key !== itemId) continue;
      const party = mode === 'item_sales' ? '' : voucher.customerName || 'Walk-in';
      const id = JSON.stringify([key, mode === 'item_sales' ? '' : voucher.customerId || party, item.unit || '']);
      const row = groups.get(id) ?? { name: item.description || key, party, unit: item.unit || '', quantity: 0, net: 0, tax: 0 };
      row.quantity += sign * amount(item.quantity);
      row.net += sign * lineNetAfterDiscount(voucher, item);
      row.tax += sign * (amount(item.cgstAmount) + amount(item.sgstAmount) + amount(item.igstAmount));
      groups.set(id, row);
    }
  }
  const rows = [...groups.values()].sort((a, b) => b.net - a.net);
  const byItem = mode === 'party_item_sales';
  return report(
    [...(mode === 'item_sales' ? ['Item'] : byItem ? ['Party', 'Item'] : ['Item', 'Party']), 'Unit', 'Net Qty', 'Before GST', 'GST'],
    rows.map(row => [
      ...(mode === 'item_sales' ? [row.name] : byItem ? [row.party, row.name] : [row.name, row.party]),
      row.unit, row.quantity, round(row.net), round(row.tax),
    ]),
    [money('Net Item Sales Before GST', total(rows, row => row.net))],
  );
}

const paymentLabel = (p: Payment) => {
  const direction = p.type === 'PAID' ? 'Payment Out' : 'Payment In';
  return p.mode === 'CHEQUE' && p.chequeStatus && p.chequeStatus !== 'CLEARED'
    ? `${direction} (cheque ${p.chequeStatus.toLowerCase()})` : direction;
};

export function buildPartyLedger(party: Customer, source: Pick<ReportSource, 'sales' | 'purchases' | 'debitNotes' | 'payments'>, from: string, to: string) {
  const vouchers = [...source.sales, ...source.purchases.map(voucher => voucher.type ? voucher : { ...voucher, type: 'PURCHASE' as const }), ...source.debitNotes];
  const paymentRows = source.payments.filter(payment => payment.customerId === party.id && !payment.isDeleted);
  const allocated = new Map<string, number>();
  for (const payment of paymentRows) {
    for (const allocation of getPaymentAllocations(payment)) {
      const key = (payment.type === 'PAID' ? 'purchase:' : 'sale:') + allocation.invoiceId;
      allocated.set(key, (allocated.get(key) || 0) + Math.max(0, amount(allocation.amount)));
    }
  }

  const entries = [
    ...vouchers.filter(voucher => voucher.customerId === party.id && !voucher.isDeleted &&
      voucher.conversionStatus !== 'CANCELLED' && (!voucher.type || ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucher.type)))
      .map(voucher => {
        const purchase = voucher.type === 'PURCHASE' || voucher.type === 'DEBIT_NOTE';
        const isReturn = fiscal(voucher) < 0;
        const direction = (purchase ? -1 : 1) * fiscal(voucher);
        const linked = allocated.get((purchase ? 'purchase:' : 'sale:') + voucher.id) || 0;
        // Add back separate allocations here, then post each receipt/payment on its own date below.
        const value = isReturn
          ? (voucher.status === 'PAID' ? 0 : Math.abs(amount(voucher.total)))
          : Math.min(Math.abs(amount(voucher.total)), due(voucher) + linked);
        return {
          date: voucher.date, kind: purchase ? isReturn ? 'Purchase Return' : 'Purchase' : isReturn ? 'Sales Return' : 'Sale',
          ref: voucher.invoiceNumber, mode: voucher.paymentMode || '', status: voucher.status || '',
          direction, delta: round(direction * value),
        };
      }),
    ...paymentRows.map(payment => {
      const direction = payment.type === 'PAID' ? 1 : -1;
      return { date: payment.date, kind: paymentLabel(payment), ref: payment.reference || payment.invoiceNumber || '',
        mode: payment.mode, status: '', direction, delta: round(direction * amount(payment.amount)) };
    }),
  ].filter(entry => Boolean(day(entry.date))).sort((a, b) => a.date.localeCompare(b.date));

  // Legacy parties may have a running balance without a separate starting balance.
  const initial = party.openingBalance != null
    ? amount(party.openingBalance)
    : round(amount(party.balance) - total(entries, entry => entry.delta));
  const opening = round(initial + total(entries.filter(entry => day(entry.date) < from), entry => entry.delta));
  const rows = entries.filter(entry => inReportRange(entry.date, from, to)).map(entry => ({
    ...entry, debit: Math.max(0, entry.delta), credit: Math.max(0, -entry.delta),
  }));
  const debit = round(Math.max(0, opening) + total(rows, entry => entry.debit));
  const credit = round(Math.max(0, -opening) + total(rows, entry => entry.credit));
  return { opening, rows, debit, credit, closing: round(debit - credit) };
}

export function buildBusinessReport(id: string, source: ReportSource, filters: ReportFilters, today = localDay()): ReportData {
  const matchesDate = (date: string) => inReportRange(date, filters.from, filters.to);
  const matchesParty = (party: string) => !filters.party || party === filters.party;
  const matchesStaff = (entry: { createdBy?: string }) => !filters.staff || reportCreator(entry) === filters.staff;
  const sales = source.sales.filter(v => !v.isDeleted && v.conversionStatus !== 'CANCELLED' && (!v.type || v.type === 'SALE' || v.type === 'CREDIT_NOTE'));
  const purchases = source.purchases.filter(v => !v.isDeleted && v.conversionStatus !== 'CANCELLED' && (!v.type || v.type === 'PURCHASE'));
  const debitNotes = source.debitNotes.filter(v => !v.isDeleted && v.conversionStatus !== 'CANCELLED');
  const active = [...sales, ...purchases, ...debitNotes];
  const vouchers = (items: Invoice[]) => items.filter(v => matchesDate(v.date) && matchesParty(v.customerId) &&
    (!filters.godown || v.godownId === filters.godown) && (!filters.status || v.status === filters.status) && matchesStaff(v));
  const filteredSales = vouchers(sales);
  const filteredPurchases = vouchers([...purchases, ...debitNotes]);
  const taxableSales = filteredSales.filter(v => v.gstEnabled || voucherTax(v) !== 0);
  const taxablePurchases = filteredPurchases.filter(v => v.gstEnabled || voucherTax(v) !== 0);
  const gstGroup = (v: Invoice) => /^[0-9]{2}[A-Z0-9]{13}$/.test(v.customerGstin?.trim().toUpperCase() || '') ? 'B2B' : 'B2C';
  const gstTotals = (list: Invoice[]) => [
    total(list, v => fiscal(v) * voucherTaxable(v)),
    total(list, v => fiscal(v) * amount(v.totalCgst)),
    total(list, v => fiscal(v) * amount(v.totalSgst)),
    total(list, v => fiscal(v) * amount(v.totalIgst)),
    total(list, v => fiscal(v) * voucherTax(v)),
  ];
  const parties = source.customers.filter(party => matchesParty(party.id));
  const partyById = new Map(source.customers.map(party => [party.id, partyName(party)]));
  const productById = new Map(source.products.map(product => [product.id, product]));
  const products = source.products.filter(product => !product.isArchived && (!filters.item || product.id === filters.item));
  const payments = source.payments.filter(p => !p.isDeleted);
  const expenses = source.expenses.filter(e => !e.isDeleted && matchesDate(e.date) && matchesStaff(e));
  const staffName = new Map(source.staff.map(member => [member.id, member.name]));
  const creatorName = (entry: { createdBy?: string }) => entry.createdBy
    ? staffName.get(entry.createdBy) || (entry.createdBy === source.currentUserId ? 'Signed-in user' : 'Other recorded user')
    : 'Unassigned';

  switch (id) {
    case 'gstr1': {
      const grossHeaders = ['Type', 'Voucher', 'Date', 'Party', 'GSTIN', 'Place of Supply', 'Before GST', 'CGST', 'SGST', 'IGST', 'Total'];
      return report(grossHeaders, taxableSales.map(v => {
        const sign = fiscal(v);
        const type = gstGroup(v) + (sign < 0 ? ' Credit Note' : '');
        return [type, v.invoiceNumber, formatDate(v.date), v.customerName, v.customerGstin || '', v.customerState || '', sign * voucherTaxable(v),
          sign * amount(v.totalCgst), sign * amount(v.totalSgst), sign * amount(v.totalIgst), sign * amount(v.total)];
      }), [
        money('B2B Net Output GST', gstTotals(taxableSales.filter(v => gstGroup(v) === 'B2B'))[4]),
        money('B2C Net Output GST', gstTotals(taxableSales.filter(v => gstGroup(v) === 'B2C'))[4]),
      ], 'Sales register from your books. JSON data is for bookkeeping and reconciliation.');
    }
    case 'gstr2': {
      const purchaseRows = taxablePurchases.map(v => {
        const sign = fiscal(v);
        return [formatDate(v.date), sign < 0 ? 'Purchase Return' : 'Purchase',
          v.invoiceNumber, v.customerName, v.customerGstin || '', sign * voucherTaxable(v),
          sign * amount(v.totalCgst), sign * amount(v.totalSgst), sign * amount(v.totalIgst), sign * voucherTax(v)];
      });
      const eligible = expenses.filter(e => e.itcEligible && amount(e.gstAmount) > 0);
      const expenseRows = eligible.map(e => [formatDate(e.date), 'Expense marked ITC Eligible', e.invoiceRef || '',
        e.vendorName || e.category, e.vendorGstin || '', round(amount(e.amount) - amount(e.gstAmount)), '', '', '', amount(e.gstAmount)]);
      return report(['Date', 'Type', 'Voucher', 'Supplier', 'GSTIN', 'Before GST', 'CGST', 'SGST', 'IGST', 'GST Recorded'],
        [...purchaseRows, ...expenseRows], [
          money('Net Purchase GST Recorded', gstTotals(taxablePurchases)[4]),
          money('Expense GST Marked ITC Eligible', total(eligible, e => amount(e.gstAmount))),
        ], 'Purchase GST comes from your books. Reconcile eligibility against GSTR-2B before claiming ITC.');
    }
    case 'gstr3b': {
      const outward = gstTotals(taxableSales);
      const inward = gstTotals(taxablePurchases);
      const expenseItc = total(expenses.filter(e => e.itcEligible), e => amount(e.gstAmount));
      return report(['Section', 'Before GST', 'CGST', 'SGST', 'IGST', 'GST'], [
        ['Outward supplies after credit notes', ...outward], ['Purchase GST after returns', ...inward],
        ['Expenses marked ITC eligible', '', '', '', '', expenseItc],
      ], [money('Net Output GST', outward[4]), money('Net Purchase GST Recorded', inward[4])],
      'Summary from your books. ITC eligibility and cash liability require GST portal reconciliation.');
    }
    case 'sales_summary': return voucherReport(filteredSales, false);
    case 'purchase_report': return voucherReport(filteredPurchases, true);
    case 'tds_payable':
    case 'tds_receivable':
    case 'tcs_payable':
    case 'tcs_receivable': {
      const isTds = id.startsWith('tds');
      const isPayable = id.endsWith('payable');
      const inbound = isTds === isPayable;
      const label = isTds ? 'TDS' : 'TCS';
      const taxAmount = (v: Invoice) => amount(isTds ? v.tdsAmount : v.tcsAmount);
      const recorded = (inbound ? filteredPurchases : filteredSales).filter(v => taxAmount(v) !== 0);
      return report(['Date', 'Voucher', 'Party', 'Type', `${label} Rate %`, `${label} Recorded`], recorded.map(v => [
        formatDate(v.date), v.invoiceNumber, v.customerName, v.type || (inbound ? 'PURCHASE' : 'SALE'),
        (isTds ? v.tdsRate : v.tcsRate) ?? '', fiscal(v) * taxAmount(v),
      ]), [money(`Net ${label} ${isPayable ? 'Payable' : 'Receivable'} Recorded`, total(recorded, v => fiscal(v) * taxAmount(v)))],
      'Only vouchers with a saved tax amount are included. Remittances and tax-credit reconciliation are outside this register.');
    }
    case 'daily_sales': {
      const days = [...new Set(filteredSales.map(v => day(v.date)))].sort();
      return report(['Date', 'Sales', 'Returns', 'Net Sales'], days.map(date => {
        const vouchers = filteredSales.filter(v => day(v.date) === date);
        const sold = total(vouchers.filter(v => fiscal(v) > 0), v => amount(v.total));
        const returned = total(vouchers.filter(v => fiscal(v) < 0), v => amount(v.total));
        return [formatDate(date), sold, returned, round(sold - returned)];
      }), [money('Net Sales', total(filteredSales, v => amount(v.total) * fiscal(v)))]);
    }
    case 'staff_sales': {
      const ids = [...new Set(filteredSales.map(reportCreator))];
      return report(['Staff', 'Sales', 'Returns', 'Net Sales'], ids.map(staffId => {
        const entries = filteredSales.filter(v => reportCreator(v) === staffId);
        const sold = total(entries.filter(v => fiscal(v) > 0), v => amount(v.total));
        const returned = total(entries.filter(v => fiscal(v) < 0), v => amount(v.total));
        return [creatorName(entries[0]), sold, returned, round(sold - returned)];
      }), [money('Net Sales', total(filteredSales, v => amount(v.total) * fiscal(v)))], 'Entries without a recorded creator appear as Unassigned.');
    }
    case 'daybook':
    case 'staff_daybook': {
      const labels = { SALE: 'Sale', CREDIT_NOTE: 'Sales Return', PURCHASE: 'Purchase', DEBIT_NOTE: 'Purchase Return' };
      const entries = [
        ...[...filteredSales, ...filteredPurchases].map(v => ({ date: v.date, type: labels[v.type as keyof typeof labels] || (purchases.includes(v) ? 'Purchase' : 'Sale'), ref: v.invoiceNumber, name: v.customerName, value: amount(v.total), actor: creatorName(v) })),
        ...payments.filter(p => matchesDate(p.date) && matchesParty(p.customerId) && matchesStaff(p)).map(p => ({ date: p.date, type: paymentLabel(p), ref: p.reference || p.invoiceNumber || '', name: partyById.get(p.customerId) || 'Walk-in', value: amount(p.amount), actor: creatorName(p) })),
        ...expenses.filter(() => !filters.party).map(e => ({ date: e.date, type: 'Expense', ref: e.invoiceRef || '', name: e.category, value: amount(e.amount), actor: creatorName(e) })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      return report(['Date', 'Type', 'Reference', 'Particulars', 'Amount', ...(id === 'staff_daybook' ? ['Staff'] : [])], entries.map(e => [formatDate(e.date), e.type, e.ref, e.name, e.value, ...(id === 'staff_daybook' ? [e.actor] : [])]), [{ label: 'Transactions', value: entries.length }], 'Bills and payments appear as separate entries.');
    }
    case 'expenses': {
      const categories = [...new Set(expenses.map(e => e.category))].sort();
      return report(['Category', 'Entries', 'GST Included', 'Total Expense'], categories.map(category => {
        const entries = expenses.filter(e => e.category === category);
        return [category, entries.length, total(entries, e => amount(e.gstAmount)), total(entries, e => amount(e.amount))];
      }), [money('Total Expenses', total(expenses, e => amount(e.amount)))]);
    }
    case 'expense_transactions': {
      const rows = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
      return report(['Date', 'Category', 'Description', 'Vendor', 'Reference', 'Mode', 'GST Included', 'Amount'], rows.map(e => [
        formatDate(e.date), e.category, e.description || '', e.vendorName || '', e.invoiceRef || '', e.paymentMode.replace(/_/g, ' '),
        amount(e.gstAmount), amount(e.amount),
      ]), [money('Total Expenses', total(rows, e => amount(e.amount)))]);
    }
    case 'payment_register': {
      const rows = payments.filter(p => matchesDate(p.date) && matchesParty(p.customerId)).sort((a, b) => b.date.localeCompare(a.date));
      return report(['Date', 'Type', 'Party', 'Reference', 'Mode', 'Amount'], rows.map(p => [
        formatDate(p.date), paymentLabel(p), partyById.get(p.customerId) || 'Walk-in', p.reference || p.invoiceNumber || '',
        p.mode.replace(/_/g, ' '), amount(p.amount),
      ]), [
        money('Receipts Recorded', total(rows.filter(p => p.type !== 'PAID'), p => amount(p.amount))),
        money('Payments Recorded', total(rows.filter(p => p.type === 'PAID'), p => amount(p.amount))),
      ]);
    }
    case 'party_outstanding': {
      const balances = parties.filter(p => amount(p.balance) !== 0);
      const receivable = (p: Customer) => Math.max(0, amount(p.balance));
      const payable = (p: Customer) => Math.max(0, -amount(p.balance));
      return report(['Party', 'Phone', 'Receivable', 'Payable'], balances.map(p => [partyName(p), p.phone || '', receivable(p), payable(p)]), [
        money('Receivable', total(balances, receivable)), money('Payable', total(balances, payable)),
      ]);
    }
    case 'party_ledger': {
      const party = parties.find(p => p.id === filters.party);
      const headers = ['Date', 'Type', 'Reference', 'Dr', 'Cr', 'Running Balance'];
      if (!party) return report(headers, [], undefined, 'Select a party to view its statement.');
      const ledger = buildPartyLedger(party, { sales, purchases, debitNotes, payments }, filters.from, filters.to);
      let running = ledger.opening;
      const lines = ledger.rows.map(entry => {
        running = round(running + entry.delta);
        return [formatDate(day(entry.date)), entry.kind, entry.ref, entry.debit, entry.credit, running];
      });
      return report(headers, [[formatDate(filters.from), 'Opening Balance', '', '', '', ledger.opening], ...lines],
        [money('Opening Balance', ledger.opening), money('Closing Balance', ledger.closing)],
        'Positive balances are receivable. Cash paid directly on a bill is reflected in its outstanding amount.');
    }
    case 'party_aging': {
      const rows = parties.filter(p => amount(p.balance) > 0).map(party => {
        const buckets = [0, 0, 0, 0, 0];
        let remaining = amount(party.balance);
        const unpaid = sales.filter(v => v.customerId === party.id && fiscal(v) > 0 && due(v) > 0).sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
        for (const v of unpaid) {
          const days = (Date.parse(today) - Date.parse(day(v.dueDate || v.date))) / DAY;
          const index = days < 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
          const value = Math.min(remaining, due(v));
          buckets[index] += value;
          remaining -= value;
        }
        return [partyName(party), ...buckets.map(round), round(remaining), amount(party.balance)];
      });
      return report(['Party', 'Not Due', '0–30d', '31–60d', '61–90d', '90d+', 'Unallocated', 'Total Due'], rows, [
        money('Total Receivable', total(rows, row => amount(row.at(-1)))),
      ], 'Aging uses current receivable balances and saved invoice due dates.');
    }
    case 'inactive_parties': {
      const activeIds = new Set([
        ...active.filter(v => matchesDate(v.date)).map(v => v.customerId),
        ...payments.filter(p => matchesDate(p.date)).map(p => p.customerId),
      ]);
      return report(['Party', 'Phone', 'Current Balance'], parties.filter(p => !activeIds.has(p.id)).map(p => [partyName(p), p.phone || '', amount(p.balance)]));
    }
    case 'item_sales':
    case 'item_party_sales':
    case 'party_item_sales': return groupItemSales(filteredSales, id, filters.item);
    case 'hsn_sales':
    case 'hsn_gst_sales':
    case 'hsn_purchase': {
      const isPurchase = id === 'hsn_purchase';
      const groups = new Map<string, { supply: string; hsn: string; unit: string; rate: number; qty: number; net: number; cgst: number; sgst: number; igst: number }>();
      for (const voucher of isPurchase ? taxablePurchases : id === 'hsn_gst_sales' ? taxableSales : filteredSales) {
        const sign = fiscal(voucher);
        for (const item of voucher.items) {
          if (filters.item && (item.productId || item.description) !== filters.item) continue;
          const hsn = item.hsn || productById.get(item.productId)?.hsn || 'Unspecified';
          const unit = item.unit || productById.get(item.productId)?.unit || '';
          const rate = voucher.gstEnabled || voucherTax(voucher) !== 0 ? amount(item.gstRate) : 0;
          const supply = isPurchase ? 'Inward' : gstGroup(voucher);
          const key = JSON.stringify([supply, hsn, unit, rate]);
          const row = groups.get(key) ?? { supply, hsn, unit, rate, qty: 0, net: 0, cgst: 0, sgst: 0, igst: 0 };
          row.qty += sign * amount(item.quantity);
          row.net += sign * lineNet(item);
          row.cgst += sign * amount(item.cgstAmount);
          row.sgst += sign * amount(item.sgstAmount);
          row.igst += sign * amount(item.igstAmount);
          groups.set(key, row);
        }
      }
      const rows = [...groups.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
      return report(['Supply', 'HSN / SAC', 'Unit', 'GST %', 'Net Qty', 'Before GST', 'CGST', 'SGST', 'IGST'], rows.map(row => [row.supply, row.hsn, row.unit, row.rate, round(row.qty), round(row.net), round(row.cgst), round(row.sgst), round(row.igst)]), [
        money('Net GST', total(rows, row => row.cgst + row.sgst + row.igst)),
      ]);
    }
    case 'rate_list':
      return report(['Item', 'Category', 'Unit', 'HSN / SAC', 'Selling Price', 'Purchase Price', 'Wholesale', 'MRP', 'GST %'], products.map(p => [
        p.name, p.category || '', p.unit || '', p.hsn || '', amount(p.price),
        p.purchasePrice ?? '', p.wholesalePrice ?? '', p.mrp ?? '', p.gstRate ?? '',
      ]), [{ label: 'Items', value: products.length }]);
    case 'stock_detail': {
      const godowns = new Map(source.godowns.map(godown => [godown.id, godown.name]));
      const main = source.godowns.find(godown => godown.isMain)?.id;
      const rows = products.filter(p => p.category?.toLowerCase() !== 'services').flatMap(p => {
        const locations = Object.entries(p.godownStocks || {});
        if (locations.length === 0) locations.push([main ?? '', amount(p.stock)]);
        else {
          const unallocated = round(amount(p.stock) - locations.reduce((sum, [, qty]) => sum + amount(qty), 0));
          if (unallocated !== 0) locations.push(['', unallocated]);
        }
        return locations.filter(([id]) => !filters.godown || id === filters.godown).map(([id, qty]) =>
          [p.name, godowns.get(id) || (id ? 'Unknown godown' : 'Unallocated'), amount(qty), p.unit || '', p.barcode || '']);
      });
      return report(['Item', 'Godown', 'Stock Qty', 'Unit', 'Barcode'], rows, [{ label: 'Stock Locations', value: rows.length }]);
    }
    case 'stock_summary':
    case 'low_stock': {
      const main = source.godowns.find(godown => godown.isMain)?.id;
      const qty = (product: Product) => filters.godown
        ? amount(product.godownStocks?.[filters.godown] ?? (!product.godownStocks && filters.godown === main ? product.stock : 0))
        : amount(product.stock);
      const rows = products.filter(p => p.category?.toLowerCase() !== 'services');
      if (id === 'low_stock') {
        const low = rows.filter(p => qty(p) <= (p.lowStockThreshold ?? 10));
        return report(['Item', 'Stock Qty', 'Unit', 'Reorder Level'], low.map(p => [p.name, qty(p), p.unit || '', p.lowStockThreshold ?? 10]), [{ label: 'Items at or Below Reorder Level', value: low.length }]);
      }
      const costs = recordedCosts(source.products, purchases);
      return report(['Item', 'Category', 'Stock Qty', 'Unit', 'Unit Cost', 'Stock Value'], rows.map(p => {
        const cost = costs(p.id, today);
        return [p.name, p.category || '', qty(p), p.unit || '', cost ?? 'Cost missing', cost == null ? '' : round(qty(p) * cost)];
      }), [money('Stock Value at Known Cost', total(rows, p => qty(p) * (costs(p.id, today) ?? 0)))]);
    }
    case 'stock_movement': {
      const movements = source.stockMovements.filter(m => matchesDate(m.createdAt) && (!filters.item || m.productId === filters.item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return report(['Date', 'Item', 'Movement', 'Reference', 'Before', 'Change', 'After'], movements.map(m => [
        formatDate(m.createdAt), productById.get(m.productId)?.name || m.barcodeSnapshot || m.productId,
        m.movementType.replace(/_/g, ' '), m.reason || m.referenceType || '', m.stockBefore, m.quantityDelta, m.stockAfter,
      ]), [{ label: 'Stock Movements', value: movements.length }]);
    }
    case 'batch_expiry': {
      const rows = products.flatMap(p => (p.batches || []).filter(batch => amount(batch.stock) > 0).map(batch => {
        const days = (Date.parse(day(batch.expiryDate || '')) - Date.parse(today)) / DAY;
        const state = !batch.expiryDate ? 'No Expiry' : days < 0 ? 'Expired' : days <= 30 ? 'Next 30 Days' : 'Active';
        return { name: p.name, batch, state };
      })).filter(row => !filters.expiry || row.state === filters.expiry);
      rows.sort((a, b) => (a.batch.expiryDate || '9999').localeCompare(b.batch.expiryDate || '9999'));
      return report(['Item', 'Batch', 'Expiry Date', 'Stock Qty', 'Status'], rows.map(({ name, batch, state }) => [name, batch.batchNo, batch.expiryDate ? formatDate(batch.expiryDate) : '', batch.stock, state]), [{ label: 'Batches', value: rows.length }]);
    }
    case 'bill_profit': {
      const rows = netSaleProfit(filteredSales, source.products, purchases);
      return report(['Date', 'Bill No', 'Party', 'Before GST', 'Cost', 'Gross Profit'], rows.map(({ voucher, net, cost, profit }) => [formatDate(voucher.date), voucher.invoiceNumber, voucher.customerName, net, cost ?? 'Cost missing', profit ?? '']), [
        money('Gross Profit on Bills with Cost', total(rows, row => row.profit ?? 0)),
        { label: 'Bills with Missing Cost', value: rows.filter(row => row.cost == null).length },
      ], 'Costs use the latest saved purchase on or before the bill date, with the saved item cost as a fallback.');
    }
    case 'balance_sheet': {
      const costs = recordedCosts(source.products, purchases);
      const cash = total(source.accounts, account => amount(account.balance));
      const receivable = total(parties, p => Math.max(0, amount(p.balance)));
      const payable = total(parties, p => Math.max(0, -amount(p.balance)));
      const stock = total(products, p => amount(p.stock) * (costs(p.id, today) ?? 0));
      const missing = products.filter(p => amount(p.stock) !== 0 && costs(p.id, today) == null).length;
      return report(['Operating Assets and Liabilities', 'Amount'], [['Cash & Bank', cash], ['Party Receivables', receivable], ['Inventory at Known Cost', stock], ['Party Payables', payable]], [
        money('Net Operating Position', cash + receivable + stock - payable), { label: 'Stock Items with Missing Cost', value: missing },
      ], 'Current balances from Cash & Bank, parties and inventory. Capital, fixed assets, and other ledgers are outside this operating snapshot.');
    }
    default: return report([], []);
  }
}
