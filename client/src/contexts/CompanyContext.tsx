import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { collection, doc, getDocs, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InvoicePrefixConfig } from '../types';
import { useAuth, DEMO_UID } from './AuthContext';
import { StorageService } from '../services/storageService';
import { EXISTING_BOOKS_ID, hasBookRecords, loadExistingProfile, pickBookWorkspace } from '../services/existingBooks';

interface CompanyData {
  id: string;
  isLegacy?: boolean;
  name: string;
  address: string;
  state?: string;
  gst: string;
  gst_enabled: boolean;
  phone?: string;
  email?: string;
  show_hsn_summary?: boolean;
  roundUpDefault?: 0 | 10 | 100;
  upiId?: string;
  thermalSize?: '58mm' | '80mm';
  prefixConfig?: InvoicePrefixConfig;
  invoiceTemplate?: 'default' | 'modern' | 'minimal' | 'desi' | 'kacchi' | 'tally' | 'classic' | 'premium' | 'compact' | 'traditional';
  owner_uid: string;
  owner_email: string;
  created_at: any;
  updated_at: any;
  invoiceSettings?: {
    format: string;
    showWatermark?: boolean;
    watermarkText?: string;
    primaryColor?: string;
  };
}

interface CompanyContextType {
  company: CompanyData | null;
  companies: CompanyData[];
  loading: boolean;
  loadFailed: boolean;
  permissionError: boolean;
  saveCompany: (data: Partial<CompanyData>) => Promise<void>;
  createCompany: (data: Partial<CompanyData>) => Promise<string>;
  switchCompany: (companyId: string) => void;
  reloadCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);
const preferredCompanyKey = (userId: string) => `billbook_preferred_company:${userId}`;

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const requestSequence = useRef(0);

  const fetchCompanies = async () => {
    const request = ++requestSequence.current;
    setLoadFailed(false);
    setPermissionError(false);
    if (!user) {
      setCompanies([]);
      setCompany(null);
      setResolvedUserId(null);
      setLoading(false);
      return;
    }

    if (user.uid === DEMO_UID) {
      const local = StorageService.getCompanyProfile();
      const demoCompany = {
        ...(local as any),
        id: 'default',
        name: local.name || 'Demo Shop',
        address: local.address || '',
        gst: local.gst || local.gstin || '',
        gst_enabled: local.gst_enabled ?? true,
        owner_uid: DEMO_UID,
        owner_email: user.email || '',
        created_at: null,
        updated_at: null,
      } as CompanyData;
      setCompanies([demoCompany]);
      setCompany(demoCompany);
      setResolvedUserId(user.uid);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch companies owned by this user
      const qOwned = query(collection(db, 'companies'), where('owner_uid', '==', user.uid));
      const qAllowed = user.email
        ? getDocs(query(collection(db, 'companies'), where('allowed_emails', 'array-contains', user.email)))
        : Promise.resolve(null);
      const [snapshotOwned, snapshotAllowed, hasExisting] = await Promise.all([
        getDocs(qOwned), qAllowed, hasBookRecords(user.uid),
      ]);

      const fetchedCompanies: CompanyData[] = [];
      snapshotOwned.forEach((doc) => {
        fetchedCompanies.push({ id: doc.id, ...doc.data() } as CompanyData);
      });

      snapshotAllowed?.forEach((doc) => {
        // Avoid duplicates if user is owner and also in allowed list
        if (!fetchedCompanies.find(c => c.id === doc.id)) {
          fetchedCompanies.push({ id: doc.id, ...doc.data() } as CompanyData);
        }
      });

      if (hasExisting) {
        const profile = await loadExistingProfile(user.uid).catch(() => undefined);
        fetchedCompanies.push({
          ...profile,
          id: EXISTING_BOOKS_ID,
          isLegacy: true,
          name: profile?.name || 'Existing books',
          address: profile?.address || '',
          gst: profile?.gst || profile?.gstin || '',
          gst_enabled: profile?.gst_enabled ?? true,
          owner_uid: user.uid,
          owner_email: user.email || '',
          created_at: null,
          updated_at: null,
        });
      }
      const selected = await pickBookWorkspace(
        fetchedCompanies,
        localStorage.getItem(preferredCompanyKey(user.uid)),
        localStorage.getItem('active_company_id'),
        companyId => hasBookRecords(user.uid, companyId),
      );
      if (request !== requestSequence.current) return;
      setCompanies(fetchedCompanies);
      setCompany(selected);
      if (selected) localStorage.setItem('active_company_id', selected.id);
      else localStorage.removeItem('active_company_id');
    } catch (error: any) {
      if (request !== requestSequence.current) return;
      console.error('Error fetching companies:', error);
      if (error.code === 'permission-denied') {
        setPermissionError(true);
      } else {
        setLoadFailed(true);
      }
      setCompanies([]);
      setCompany(null);
    } finally {
      if (request === requestSequence.current) {
        setResolvedUserId(user.uid);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCompanies();
    return () => { requestSequence.current++; };
  }, [user]);

  const saveCompany = async (data: Partial<CompanyData>) => {
    if (!user || !company) return;

    if (user.uid === DEMO_UID || company.isLegacy) {
      const cur = StorageService.getCompanyProfile();
      const profile = { ...cur, ...data } as typeof cur;
      StorageService.saveCompanyProfile(profile);
      const updated = { ...company, ...data, id: company.id, isLegacy: company.isLegacy };
      setCompany(updated);
      setCompanies(items => items.map(item => item.id === company.id ? updated : item));
      return;
    }

    try {
      await setDoc(doc(db, 'companies', company.id), {
        ...data,
        owner_uid: company.owner_uid,
        owner_email: company.owner_email,
        updated_at: serverTimestamp()
      }, { merge: true });

      await fetchCompanies();
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        setPermissionError(true);
        throw new Error('Permission denied. Please check Firestore Rules.');
      }
      throw error;
    }
  };

  const createCompany = async (data: Partial<CompanyData>): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    try {
      // Generate new company ID
      const newCompanyRef = doc(collection(db, 'companies'));

      await setDoc(newCompanyRef, {
        name: data.name || 'New Company',
        address: data.address || '',
        gst: data.gst || '',
        gst_enabled: data.gst_enabled ?? true,
        phone: data.phone || '',
        email: data.email || user.email,
        show_hsn_summary: data.show_hsn_summary ?? true,
        roundUpDefault: data.roundUpDefault ?? 0,
        upiId: data.upiId || '',
        owner_uid: user.uid,
        owner_email: user.email,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      // Auto-switch to new company
      localStorage.setItem('active_company_id', newCompanyRef.id);
      localStorage.setItem(preferredCompanyKey(user.uid), newCompanyRef.id);
      await fetchCompanies();

      return newCompanyRef.id;
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        setPermissionError(true);
        throw new Error('Permission denied. Please check Firestore Rules.');
      }
      throw error;
    }
  };

  const switchCompany = (companyId: string) => {
    const selectedCompany = companies.find(c => c.id === companyId);
    if (selectedCompany) {
      setCompany(selectedCompany);
      localStorage.setItem('active_company_id', companyId);
      if (user) localStorage.setItem(preferredCompanyKey(user.uid), companyId);
      window.location.reload(); // Reload to refresh all data
    }
  };

  return (
    <CompanyContext.Provider value={{
      company,
      companies,
      loading: loading || resolvedUserId !== (user?.uid ?? null),
      loadFailed,
      permissionError,
      saveCompany,
      createCompany,
      switchCompany,
      reloadCompanies: fetchCompanies
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
