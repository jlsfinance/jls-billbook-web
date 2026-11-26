import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Product } from '../types';

export interface Storefront {
  name: string;
  tagline: string;
  phone: string;
  products: { id: string; name: string; price: number }[];
}

export function buildStorefront(name: string, tagline: string, rawPhone: string, products: Product[]): Storefront {
  const digits = rawPhone.replace(/\D/g, '');
  const phone = digits.length === 10 && !rawPhone.trim().startsWith('+') ? `91${digits}` : digits;
  if (!/^[1-9]\d{9,14}$/.test(phone)) throw new Error('Enter a valid business WhatsApp number.');
  if (!name.trim() || name.length > 100 || tagline.length > 180) throw new Error('Enter a store name of up to 100 characters and a tagline of up to 180.');
  if (products.length === 0 || products.length > 500) throw new Error('Select between 1 and 500 products.');
  return {
    name: name.trim(),
    tagline: tagline.trim(),
    phone,
    products: products.map(product => {
      if (!product.name.trim() || product.name.length > 200 || !Number.isFinite(product.price) || product.price < 0) {
        throw new Error(`Check the name and selling price for ${product.name || 'an unnamed item'}.`);
      }
      return { id: product.id, name: product.name, price: product.price };
    }),
  };
}

export async function loadStorefront(companyId: string) {
  const snapshot = await getDoc(doc(db, 'publicStorefronts', companyId));
  return snapshot.exists() ? snapshot.data() as Storefront : null;
}

export function publishStorefront(companyId: string, storefront: Storefront) {
  return setDoc(doc(db, 'publicStorefronts', companyId), storefront);
}

export function unpublishStorefront(companyId: string) {
  return deleteDoc(doc(db, 'publicStorefronts', companyId));
}
