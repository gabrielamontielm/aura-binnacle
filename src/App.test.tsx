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
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
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
    // Since App has a useEffect with search params, we wait for it
    await waitFor(() => {
      // Check if scanner button is disabled (indicator of isViewOnly in some versions)
      const scannerBtn = screen.getByText(/Scanner/i);
      expect(scannerBtn).toBeDisabled();
    });
  });
});
