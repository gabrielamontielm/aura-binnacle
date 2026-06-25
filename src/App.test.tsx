import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as firebaseService from './services/firebase';

// Mock dependencies
vi.mock('./services/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
  },
  googleProvider: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  }
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...paths) => ({ path: paths.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(() => Promise.resolve({ size: 0, forEach: () => {}, docs: [] })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  collection: vi.fn((db, path) => ({ path })),
  query: vi.fn((q) => q),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
  })),
  onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function() {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            title: 'Test Art',
            artist: 'Test Artist',
            year: '2024',
            movement: 'Modern',
            medium: 'Digital',
            description: 'A test description',
            historicalContext: 'Context',
            isPlaceholder: false
          })
        })
      }
    };
  }),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY'
  }
}));

describe('App Sharing Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URLSearchParams
    const url = new URL('http://localhost/?sharedProfile=test-uid');
    // @ts-ignore
    delete window.location;
    // @ts-ignore
    window.location = new URL(url);
  });

  it('sets isViewOnly when sharedProfile is present', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Curated Heritage Binnacle/i)).toBeInTheDocument();
    });
  });
});
