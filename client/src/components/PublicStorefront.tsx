import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { loadStorefront } from '../services/storefrontService';
import type { Storefront } from '../services/storefrontService';

const formatAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function StorefrontCatalogue({ store }: { store: Storefront }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const items = store.products.filter(product => (cart[product.id] || 0) > 0);
  const total = items.reduce((amount, product) => amount + cart[product.id] * product.price, 0);
  const message = [
    `Order enquiry for ${store.name}`,
    ...items.map(product => `${cart[product.id]} × ${product.name} — ${formatAmount.format(cart[product.id] * product.price)}`),
    `Estimated total: ${formatAmount.format(total)}`,
    'Please confirm availability and the final total.',
  ].join('\n');

  function changeQuantity(id: string, delta: number) {
    setCart(current => ({ ...current, [id]: Math.min(999, Math.max(0, (current[id] || 0) + delta)) }));
  }

  return (
    <main className="mx-auto max-w-5xl space-y-7 px-5 py-8 sm:px-8 sm:py-12">
      <header className="rounded-3xl bg-emerald-950 px-6 py-9 text-white sm:px-9">
        <ShoppingBag className="mb-5 text-emerald-300" aria-hidden="true" />
        <h1 className="break-words text-3xl font-semibold sm:text-4xl">{store.name}</h1>
        {store.tagline && <p className="mt-2 text-emerald-100">{store.tagline}</p>}
      </header>
      <section aria-label="Products" className="grid gap-3 sm:grid-cols-2">
        {store.products.map(product => (
          <article key={product.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="min-w-0">
              <h2 className="break-words font-semibold">{product.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{formatAmount.format(product.price)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" disabled={!cart[product.id]} aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)} className="rounded-lg border p-2 disabled:opacity-40"><Minus size={16} /></button>
              <span className="min-w-5 text-center tabular-nums">{cart[product.id] || 0}</span>
              <button type="button" disabled={cart[product.id] >= 999} aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)} className="rounded-lg border p-2 disabled:opacity-40"><Plus size={16} /></button>
            </div>
          </article>
        ))}
      </section>
      {items.length > 0 && <section aria-label="Order summary" className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <div><div className="text-xs text-muted-foreground">Estimated total</div><strong>{formatAmount.format(total)}</strong></div>
        <a href={`https://wa.me/${store.phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Send order enquiry on WhatsApp</a>
      </section>}
    </main>
  );
}

function StorefrontLoader({ companyId }: { companyId: string }) {
  const [store, setStore] = useState<Storefront | null>();

  useEffect(() => {
    let cancelled = false;
    loadStorefront(companyId).then(
      result => { if (!cancelled) setStore(result); },
      () => { if (!cancelled) setStore(null); },
    );
    return () => { cancelled = true; };
  }, [companyId]);

  if (store) return <StorefrontCatalogue store={store} />;
  return <main className="mx-auto max-w-3xl p-8"><p role="status">{store === undefined ? 'Loading catalogue…' : 'This catalogue is currently unavailable.'}</p></main>;
}

export default function PublicStorefront() {
  const { companyId } = useParams();
  if (!companyId) return null;
  return <StorefrontLoader key={companyId} companyId={companyId} />;
}
