import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { v4 as uuid } from 'uuid';

export interface PageView {
  id: string;
  page: string;
  path: string;
  userId: string;
  companyId: string;
  timestamp: string;
  duration?: number;
}

export interface UserAction {
  id: string;
  action: string;
  page: string;
  path: string;
  userId: string;
  companyId: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface AnalyticsSession {
  id: string;
  userId: string;
  companyId: string;
  startedAt: string;
  page: string;
  pageViews: number;
  actions: any[];
  totalTime: number;
}

const ANALYTICS_COLLECTION = 'analytics';

export const AnalyticsService = {
  // Start tracking a session
  startSession: async (userId: string, companyId: string): Promise<string> => {
    const sessionId = uuid();
    const session: AnalyticsSession = {
      id: sessionId,
      userId,
      companyId,
      startedAt: new Date().toISOString(),
      page: window.location.pathname,
      pageViews: 0,
      actions: [],
      totalTime: 0
    };

    try {
      await setDoc(doc(db, ANALYTICS_COLLECTION, sessionId), session);
    } catch (e) {
      console.warn('Analytics session start failed:', e);
    }

    // Track initial page view
    await AnalyticsService.trackPageView(window.location.pathname, userId, companyId, sessionId);

    return sessionId;
  },

  // Track page view
  trackPageView: async (path: string, userId: string, companyId: string, sessionId?: string): Promise<void> => {
    const pageView: PageView = {
      id: uuid(),
      page: window.location.pathname,
      path,
      userId,
      companyId,
      timestamp: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, ANALYTICS_COLLECTION, `pageview_${pageView.id}`), pageView);
    } catch (e) {
      console.warn('Page view tracking failed:', e);
    }

    // Also store in session if available
    if (sessionId) {
      try {
        const sessionRef = doc(db, ANALYTICS_COLLECTION, sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const session = sessionSnap.data() as AnalyticsSession;
          const updatedSession = {
            ...session,
            pageViews: session.pageViews + 1,
            totalTime: Date.now() - new Date(session.startedAt).getTime()
          };
          await updateDoc(sessionRef, {
            pageViews: updatedSession.pageViews,
            totalTime: updatedSession.totalTime
          });
        }
      } catch (e) {
        console.warn('Session update failed:', e);
      }
    }
  },

  // Track user action
  trackAction: async (action: string, page: string, metadata: Record<string, any> = {}, userId?: string, companyId?: string): Promise<void> => {
    const userAction: UserAction = {
      id: uuid(),
      action: action,
      page,
      path: window.location.pathname,
      userId: userId || 'anonymous',
      companyId: companyId || 'anonymous',
      metadata: {
        ...metadata,
        component: window.location.pathname
      },
      timestamp: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, ANALYTICS_COLLECTION, `action_${userAction.id}`), userAction);
    } catch (e) {
      console.warn('Action tracking failed:', e);
    }
  },

  // Track button click with context
  trackButtonClick: async (buttonName: string, context: Record<string, any> = {}) => {
    await AnalyticsService.trackAction('CLICK:' + buttonName, window.location.pathname, context);
  },

  // Track invoice-related actions
  trackInvoiceAction: async (action: string, invoiceId?: string, customerId?: string) => {
    const metadata: Record<string, any> = {};
    if (invoiceId) metadata.invoiceId = invoiceId;
    if (customerId) metadata.customerId = customerId;

    await AnalyticsService.trackAction('INVOICE_' + action, window.location.pathname, metadata);
  },

  // Track smart calculator usage
  trackSmartCalculator: async (action: string, mode: string) => {
    await AnalyticsService.trackAction('SMART_CALC:' + action, window.location.pathname, { smartMode: mode });
  },

  // Get page analytics
  getPageAnalytics: async (companyId: string): Promise<any> => {
    try {
      const snapshot = await getDoc(doc(db, ANALYTICS_COLLECTION, `pageview_${companyId}`));
      void snapshot; // fetched for parity with the write path; aggregation lands later
      // This is a simplified version - would need aggregation in production
      return { message: 'Analytics tracking enabled', companyId };
    } catch (e) {
      console.warn('Analytics fetch failed:', e);
      return { message: 'No analytics available', error: e };
    }
  },

  // Track invoice view time
  trackInvoiceViewTime: async (invoiceId: string, startTime: number) => {
    const duration = Date.now() - startTime;
    await AnalyticsService.trackAction('INVOICE_VIEWED', window.location.pathname, {
      invoiceId,
      duration
    });
  }
};
