import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InvoicePrefixConfig } from '../types';
import { useAuth, DEMO_UID } from './AuthContext';
import { StorageService } from '../services/storageService';

interface CompanyData {
  id: string;
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
  permissionError: boolean;
  saveCompany: (data: Partial<CompanyData>) => Promise<void>;
  createCompany: (data: Partial<CompanyData>) => Promise<string>;
  switchCompany: (companyId: string) => void;
  reloadCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);

  const fetchCompanies = async () => {
    if (!user) {
      setCompanies([]);
      setCompany(null);
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
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setPermissionError(false);

      // Fetch companies owned by this user
      const qOwned = query(collection(db, 'companies'), where('owner_uid', '==', user.uid));
      const snapshotOwned = await getDocs(qOwned);

      // Fetch companies where user is an allowed user
      const qAllowed = query(collection(db, 'companies'), where('allowed_emails', 'array-contains', user.email));
      const snapshotAllowed = await getDocs(qAllowed);

      const fetchedCompanies: CompanyData[] = [];
      snapshotOwned.forEach((doc) => {
        fetchedCompanies.push({ id: doc.id, ...doc.data() } as CompanyData);
      });

      snapshotAllowed.forEach((doc) => {
        // Avoid duplicates if user is owner and also in allowed list
        if (!fetchedCompanies.find(c => c.id === doc.id)) {
          fetchedCompanies.push({ id: doc.id, ...doc.data() } as CompanyData);
        }
      });

      setCompanies(fetchedCompanies);

      // Get current active company from localStorage
      const activeCompanyId = localStorage.getItem('active_company_id');

      if (activeCompanyId) {
        const activeCompany = fetchedCompanies.find(c => c.id === activeCompanyId);
        if (activeCompany) {
          setCompany(activeCompany);
        } else if (fetchedCompanies.length > 0) {
          // If stored company not found, use first one
          setCompany(fetchedCompanies[0]);
          localStorage.setItem('active_company_id', fetchedCompanies[0].id);
        }
      } else if (fetchedCompanies.length > 0) {
        // No active company set, use first one
        setCompany(fetchedCompanies[0]);
        localStorage.setItem('active_company_id', fetchedCompanies[0].id);
      } else {
        setCompany(null);
      }

    } catch (error: any) {
      console.error('Error fetching companies:', error);
      if (error.code === 'permission-denied') {
        setPermissionError(true);
      }
      setCompanies([]);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [user]);

  const saveCompany = async (data: Partial<CompanyData>) => {
    if (!user || !company) return;

    if (user.uid === DEMO_UID) {
      const cur = StorageService.getCompanyProfile();
      StorageService.saveCompanyProfile({ ...cur, ...(data as any) });
      setCompany({ ...company, ...data } as CompanyData);
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

      await fetchCompanies();

      // Auto-switch to new company
      localStorage.setItem('active_company_id', newCompanyRef.id);

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
      window.location.reload(); // Reload to refresh all data
    }
  };

  return (
    <CompanyContext.Provider value={{
      company,
      companies,
      loading,
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
