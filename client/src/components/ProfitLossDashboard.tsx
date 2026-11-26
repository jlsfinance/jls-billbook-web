import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, TrendingUp, DollarSign,
    Package, Calendar, PieChart as PieChartIcon,
    BarChart3, Share2
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { amount, inReportRange, localDay, netSaleProfit } from '../services/businessReports';
import { formatDate } from '../utils/dateUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { addBrandedFooter } from '../services/pdfFooterUtils';

interface ProfitLossDashboardProps {
    onBack: () => void;
}

interface ProductProfit {
    name: string;
    revenue: number;
    cost: number | null;
    profit: number | null;
    margin: number | null;
    quantity: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const formatAmount = (value: number | null) => value == null ? 'Cost missing' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatPercent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;

const ProfitLossDashboard: React.FC<ProfitLossDashboardProps> = ({ onBack }) => {
    // Date Range
    const [fromDate, setFromDate] = useState(
        localDay().slice(0, 8) + '01'
    );
    const [toDate, setToDate] = useState(localDay);
    const [datePreset, setDatePreset] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('MONTH');

    const validRange = Boolean(fromDate && toDate && fromDate <= toDate);
    const rows = useMemo(() => netSaleProfit(
        StorageService.getInvoices().filter(v => validRange && inReportRange(v.date, fromDate, toDate)),
        StorageService.getProducts(),
        StorageService.getPurchases(),
    ), [fromDate, toDate, validRange]);
    const totalExpenses = useMemo(() => StorageService.getExpenses()
        .filter(e => validRange && inReportRange(e.date, fromDate, toDate))
        .reduce((sum, e) => sum + amount(e.amount) - (e.itcEligible ? amount(e.gstAmount) : 0), 0), [fromDate, toDate, validRange]);

    const metrics = useMemo(() => {
        const totalRevenue = rows.reduce((sum, row) => sum + row.net, 0);
        const missing = rows.filter(row => row.cost == null).length;
        const totalCost = missing ? null : rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
        const grossProfit = totalCost == null ? null : totalRevenue - totalCost;
        return {
            totalRevenue, totalCost, grossProfit, totalExpenses, missing,
            profitMargin: grossProfit == null || totalRevenue <= 0 ? null : grossProfit / totalRevenue * 100,
            netProfit: grossProfit == null ? null : grossProfit - totalExpenses,
        };
    }, [rows, totalExpenses]);

    // Product-wise profit analysis
    const productProfits = useMemo((): ProductProfit[] => {
        const profitMap = new Map<string, ProductProfit>();
        for (const { lines } of rows) {
            for (const line of lines) {
                const key = JSON.stringify([line.item.productId || line.item.description, line.item.unit]);
                const row = profitMap.get(key) ?? { name: line.item.description, revenue: 0, cost: 0, profit: null, margin: null, quantity: 0 };
                row.quantity += line.quantity;
                row.revenue += line.revenue;
                row.cost = row.cost == null || line.cost == null ? null : row.cost + line.cost;
                profitMap.set(key, row);
            }
        }
        return [...profitMap.values()].map(row => {
            const profit = row.cost == null ? null : row.revenue - row.cost;
            return { ...row, profit, margin: profit == null || row.revenue <= 0 ? null : profit / row.revenue * 100 };
        }).sort((a, b) => b.revenue - a.revenue);
    }, [rows]);

    // Best selling products chart data
    const bestSellingData = useMemo(() => {
        return productProfits.slice(0, 5).map(p => ({
            name: p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name,
            quantity: p.quantity,
            revenue: Math.round(p.revenue)
        }));
    }, [productProfits]);

    // Profit distribution for pie chart
    const profitDistribution = useMemo(() => {
        return productProfits.filter(p => (p.profit ?? 0) > 0).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, 6).map((p, idx) => ({
            name: p.name.length > 10 ? p.name.substring(0, 10) + '...' : p.name,
            value: Math.round(p.profit ?? 0),
            color: COLORS[idx % COLORS.length]
        }));
    }, [productProfits]);

    // Date preset handlers
    const handlePresetChange = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM') => {
        setDatePreset(preset);
        const today = new Date();

        switch (preset) {
            case 'TODAY':
                setFromDate(localDay(today));
                setToDate(localDay(today));
                break;
            case 'WEEK':
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 6);
                setFromDate(localDay(weekAgo));
                setToDate(localDay(today));
                break;
            case 'MONTH':
                setFromDate(localDay(today).slice(0, 8) + '01');
                setToDate(localDay(today));
                break;
        }
    };

    // PDF Export
    const handleExportPDF = async () => {
        const doc = new jsPDF();
        const company = StorageService.getCompanyProfile();

        // Header
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text(company.name, 105, 15, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(company.address, 105, 22, { align: "center" });
        doc.line(10, 28, 200, 28);

        // Title
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("PROFIT & LOSS STATEMENT", 105, 38, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 105, 45, { align: "center" });

        // Summary
        let yPos = 55;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Summary", 14, yPos);
        yPos += 8;

        const summaryData = [
            ['Net Revenue Before GST', formatAmount(metrics.totalRevenue)],
            ['Cost of Goods Sold', formatAmount(metrics.totalCost)],
            ['Gross Profit', formatAmount(metrics.grossProfit)],
            ['Profit Margin', formatPercent(metrics.profitMargin)],
            ['Operating Expenses', formatAmount(metrics.totalExpenses)],
            ['Net Profit', formatAmount(metrics.netProfit)],
            ['Bills with Missing Cost', String(metrics.missing)],
        ];

        autoTable(doc, {
            startY: yPos,
            head: [['Description', 'Amount']],
            body: summaryData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 10 },
        });

        // Product-wise profit
        yPos = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Product-wise Profit Analysis", 14, yPos);
        yPos += 8;

        autoTable(doc, {
            startY: yPos,
            head: [['Product', 'Qty Sold', 'Revenue', 'Cost', 'Profit', 'Margin %']],
            body: productProfits.map(p => [
                p.name,
                p.quantity.toString(),
                formatAmount(p.revenue),
                formatAmount(p.cost),
                formatAmount(p.profit),
                formatPercent(p.margin)
            ]),
            theme: 'grid',
            headStyles: { fillColor: [34, 197, 94] },
            styles: { fontSize: 9 },
        });

        addBrandedFooter(doc, { showDisclaimer: true });

        // Save/Share
        const fileName = `PnL_Report_${Date.now()}.pdf`;
        if (Capacitor.isNativePlatform()) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: pdfBase64,
                    directory: Directory.Cache
                });
                await Share.share({
                    title: 'Profit & Loss Report',
                    url: savedFile.uri,
                    dialogTitle: 'Share P&L Report'
                });
            } catch (e) {
                console.error("Share failed", e);
            }
        } else {
            doc.save(fileName);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button aria-label="Back" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg text-slate-800 dark:text-white leading-none">Profit & Loss</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Net of sales returns, before GST</p>
                    </div>
                </div>

                <button
                    onClick={handleExportPDF}
                    disabled={!validRange}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
                >
                    <Share2 className="w-4 h-4" />
                    Export
                </button>
            </div>

            {/* Date Filter */}
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex gap-2 mb-3">
                    {(['TODAY', 'WEEK', 'MONTH', 'CUSTOM'] as const).map(preset => (
                        <button
                            key={preset}
                            onClick={() => handlePresetChange(preset)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${datePreset === preset
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>

                {datePreset === 'CUSTOM' && (
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <input aria-label="From"
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="bg-transparent w-full text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <input aria-label="To"
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="bg-transparent w-full text-xs font-bold outline-none text-slate-700 dark:text-slate-200"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {!validRange && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Choose a valid date range.</p>}
                {metrics.missing > 0 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {metrics.missing} bills have items without a recorded purchase cost. Add their cost to calculate the period’s profit.
                </p>}
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Revenue</span>
                        </div>
                        <p className="text-xl font-black">₹{metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Gross Profit</span>
                        </div>
                        <p className="text-xl font-black">{formatAmount(metrics.grossProfit)}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white"
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <Package className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Cost</span>
                        </div>
                        <p className="text-xl font-black">{formatAmount(metrics.totalCost)}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className={`bg-gradient-to-br ${metrics.profitMargin == null ? 'from-slate-500 to-slate-600' : metrics.profitMargin >= 20 ? 'from-green-500 to-green-600' : metrics.profitMargin >= 10 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'} rounded-2xl p-4 text-white`}
                    >
                        <div className="flex items-center gap-2 mb-2 opacity-80">
                            <BarChart3 className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Margin</span>
                        </div>
                        <p className="text-xl font-black">{formatPercent(metrics.profitMargin)}</p>
                    </motion.div>
                </div>

                {/* Expenses & Net Profit Strip */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Operating Expenses</span>
                        <p className="text-lg font-black text-rose-600 mt-1">₹{metrics.totalExpenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Net Profit</span>
                        <p className={`text-lg font-black mt-1 ${metrics.netProfit == null ? 'text-slate-500' : metrics.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatAmount(metrics.netProfit)}
                        </p>
                    </div>
                </div>

                {/* Best Selling Products Chart */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                        Best Selling Products
                    </h3>
                    {bestSellingData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={bestSellingData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                                <Tooltip
                                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                />
                                <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                            No sales data for this period
                        </div>
                    )}
                </div>

                {/* Profit Distribution Pie Chart */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-purple-500" />
                        Products with Positive Profit
                    </h3>
                    {profitDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={profitDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {profitDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Profit']}
                                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                />
                                <Legend
                                    layout="horizontal"
                                    verticalAlign="bottom"
                                    wrapperStyle={{ fontSize: 10 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                            No profit data for this period
                        </div>
                    )}
                </div>

                {/* Product-wise Profit Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            Product Margin Analysis
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Product</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Qty</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Revenue</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Profit</th>
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {productProfits.length > 0 ? productProfits.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-3 text-xs font-medium text-slate-700 dark:text-slate-300">{p.name}</td>
                                        <td className="p-3 text-xs font-bold text-slate-600 dark:text-slate-400 text-right">{p.quantity}</td>
                                        <td className="p-3 text-xs font-bold text-blue-600 text-right">₹{p.revenue.toFixed(0)}</td>
                                        <td className={`p-3 text-xs font-bold text-right ${p.profit == null ? 'text-slate-500' : p.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {formatAmount(p.profit)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.margin == null ? 'bg-slate-100 text-slate-700' : p.margin >= 30 ? 'bg-emerald-100 text-emerald-700' :
                                                p.margin >= 15 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                {formatPercent(p.margin)}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                                            No sales data for this period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center py-4 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        P&L Engine by Lavneet ❤️
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProfitLossDashboard;
