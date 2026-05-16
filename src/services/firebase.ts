import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import firebaseConfigBase from '../../firebase-applet-config.json';

// Fallback config if JSON is missing or empty
const defaultConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || "default",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
};

const filteredConfigBase = Object.fromEntries(
  Object.entries(firebaseConfigBase).filter(([_, v]) => v !== "")
);

const firebaseConfig = {
  ...defaultConfig,
  ...filteredConfigBase,
};

// Check for required values
export const hasValidConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);

if (!hasValidConfig) {
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push("apiKey");
  if (!firebaseConfig.projectId) missing.push("projectId");
  if (!firebaseConfig.authDomain) missing.push("authDomain");
  console.warn(`Firebase Error: missing ${missing.join(", ")}. App will run in limited mode.`);
}

// Initialize only if we have a config that doesn't look like empty strings
const app = initializeApp(
  hasValidConfig 
    ? firebaseConfig 
    : { ...firebaseConfig, apiKey: "MISSING", projectId: "MISSING", authDomain: "MISSING.firebaseapp.com" } 
);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "default"); 
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Connection Test as per instructions
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

if (hasValidConfig) {
  testConnection();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively removes undefined values from an object or replaces them with null.
 * Firestore does not allow undefined.
 */
export function sanitizeForFirestore(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(sanitizeForFirestore);
  }
  
  const sanitized: any = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
  }
  return sanitized;
}
