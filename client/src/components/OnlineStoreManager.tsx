import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Store, Share2, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { Product } from '../types';
import { StorageService } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { buildStorefront, loadStorefront, publishStorefront, unpublishStorefront } from '../services/storefrontService';

interface OnlineStoreManagerProps {
  onBack?: () => void;
}

export const OnlineStoreManager: React.FC<OnlineStoreManagerProps> = ({ onBack }) => {
  const { user, isDemo } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id;
  const canPublish = Boolean(companyId && user && company?.owner_uid === user.uid && !isDemo);
  const initialCompany = StorageService.getCompanyProfile();
  const [storeName, setStoreName] = useState(initialCompany.onlineStore?.storeName || initialCompany.name);
  const [tagline, setTagline] = useState(initialCompany.onlineStore?.tagline || 'Order directly via WhatsApp');
  const [whatsappPhone, setWhatsappPhone] = useState(initialCompany.onlineStore?.whatsappPhone || initialCompany.phone || '');
  const [products, setProducts] = useState<Product[]>(() => StorageService.getProducts().filter((p) => !p.isArchived));
  const [cart, setCart] = useState<Record<string, number>>({});
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState('');
  const [publicationError, setPublicationError] = useState('');

  const storeProducts = useMemo(() => products.filter((p) => p.showInOnlineStore !== false), [products]);
  const publicUrl = companyId && /^https?:$/.test(window.location.protocol)
    ? new URL(`/store/${encodeURIComponent(companyId)}`, window.location.origin).href
    : '';

  useEffect(() => {
    if (!canPublish || !companyId) return;
    let cancelled = false;
    loadStorefront(companyId).then(
      result => { if (!cancelled) setPublished(Boolean(result)); },
      () => { if (!cancelled) setPublicationError('Could not load the publication status.'); },
    );
    return () => { cancelled = true; };
  }, [canPublish, companyId]);

  const saveSettings = (enabled: boolean) => {
    const comp = StorageService.getCompanyProfile();
    StorageService.saveCompanyProfile({
      ...comp,
      onlineStore: {
        enabled,
        storeName: storeName.trim() || comp.name,
        tagline: tagline.trim(),
        whatsappPhone: whatsappPhone.trim(),
      },
    });
  };

  async function updatePublication(makePublic: boolean) {
    if (!canPublish || !companyId || publishing) return;
    setPublishing(true);
    setPublicationMessage('');
    setPublicationError('');
    try {
      if (makePublic) {
        await publishStorefront(companyId, buildStorefront(storeName, tagline, whatsappPhone, storeProducts));
      } else {
        await unpublishStorefront(companyId);
      }
      setPublished(makePublic);
      saveSettings(makePublic);
      setPublicationMessage(makePublic ? 'Catalogue published.' : 'Catalogue unpublished.');
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : 'Could not update the public catalogue.');
    } finally {
      setPublishing(false);
    }
  }
  const toggleProductVisibility = (prod: Product) => {
    const updated: Product = { ...prod, showInOnlineStore: prod.showInOnlineStore === false };
    StorageService.updateProduct(updated);
    setProducts(StorageService.getProducts().filter((p) => !p.isArchived));
  };

  const handleWhatsAppCatalogOrder = () => {
    const lines: string[] = [`*Order for ${storeName}*`];
    let grandTotal = 0;
    storeProducts.forEach((p) => {
      const q = cart[p.id] || 0;
      if (q > 0) {
        const sub = q * p.price;
        grandTotal += sub;
        lines.push(`• ${p.name} x ${q} = ₹${sub}`);
      }
    });
    if (grandTotal === 0) return;
    lines.push(`\n*Total: ₹${grandTotal.toLocaleString('en-IN')}*`);
    const cleanPhone = whatsappPhone.replace(/\D/g, '');
    const prefix = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${prefix}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  };

  const shareCatalogLink = () => {
    const summary = [storeName, tagline, ...storeProducts.slice(0, 5).map(product => `${product.name} ₹${product.price}`)].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(published && publicUrl ? publicUrl : summary)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Online Dukaan (Catalogue Store)
            </h1>
            <p className="text-xs text-slate-500">WhatsApp storefront &amp; item visibility manager</p>
          </div>
        </div>
        <button
          type="button"
          onClick={shareCatalogLink}
          className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Share2 className="w-4 h-4" /> {published && publicUrl ? 'Share store link' : 'Share catalogue summary'}
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Storefront Settings</h2>
              <span className="text-xs font-medium">{published ? 'Published' : 'Draft'}</span>
            </div>
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store Name" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Store Tagline" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="Order WhatsApp Number" className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <button type="button" onClick={() => { saveSettings(published); setPublicationMessage('Draft settings saved.'); }} className="w-full py-3 rounded-xl border text-xs font-bold">
              Save draft settings
            </button>
            {canPublish ? <>
              <p className="text-xs text-muted-foreground">The link publishes the shop name, tagline, business WhatsApp number and {storeProducts.length} selected product names and prices. Publish again to update the link.</p>
              <button type="button" disabled={publishing} onClick={() => void updatePublication(true)} className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-50">
                {publishing ? 'Updating…' : published ? 'Publish changes' : 'Publish catalogue'}
              </button>
              {published && <div className="flex items-center justify-between gap-2">
                {publicUrl && <a target="_blank" rel="noopener noreferrer" href={publicUrl} className="text-xs font-semibold text-blue-600 dark:text-blue-400">Open public catalogue</a>}
                <button type="button" disabled={publishing} onClick={() => void updatePublication(false)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Unpublish</button>
              </div>}
            </> : <p className="text-xs text-muted-foreground">The company owner can publish this catalogue.</p>}
            {publicationError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{publicationError}</p>}
            {publicationMessage && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{publicationMessage}</p>}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-2">Catalogue Visibility</h2>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <label key={p.id} className="py-2 flex items-center justify-between text-xs cursor-pointer">
                  <span className="font-bold truncate pr-2">{p.name} (₹{p.price})</span>
                  <input
                    type="checkbox"
                    checked={p.showInOnlineStore !== false}
                    onChange={() => toggleProductVisibility(p)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white mb-4">
              <p className="text-xs font-bold uppercase opacity-80">Customer Catalogue Preview</p>
              <h3 className="text-xl font-black">{storeName}</h3>
              <p className="text-xs opacity-90">{tagline}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto">
              {storeProducts.map((p) => (
                <div key={p.id} className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-xs font-black text-emerald-600">₹{p.price} {p.mrp ? <span className="line-through text-slate-400 font-normal">₹{p.mrp}</span> : null}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setCart({ ...cart, [p.id]: Math.max(0, (cart[p.id] || 0) - 1) })} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-bold">-</button>
                    <span className="text-xs font-black w-5 text-center">{cart[p.id] || 0}</span>
                    <button type="button" onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })} className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold">+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleWhatsAppCatalogOrder}
            className="mt-4 w-full py-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2"
          >
            {Object.values(cart).some((q) => q > 0) ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            Test Send WhatsApp Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineStoreManager;
