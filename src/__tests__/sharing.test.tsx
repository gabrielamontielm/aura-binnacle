import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import React from 'react';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  auth: {
    onAuthStateChanged: vi.fn((cb) => cb(null)),
  },
  db: {},
  googleProvider: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'list', WRITE: 'write', DELETE: 'delete' }
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb(null);
    return () => {};
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, path) => ({ path })),
  query: vi.fn((q) => q),
  where: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ size: 0, forEach: () => {} })),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((db, ...paths) => ({ path: paths.join('/') })),
  setDoc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  getFirestore: vi.fn(),
}));

const originalLocation = window.location;

describe('App Sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.location mock
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true
    });
  });

  it('should display the shared owner name in the title when view only', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?sharedProfile=test-uid',
        origin: 'http://localhost'
      },
      writable: true
    });

    // Mock getDoc for the profile
    const { getDoc } = await import('firebase/firestore');
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.path === 'public_profiles/test-uid') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ displayName: 'Art Critic' })
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    render(<App />);

    // Check if "Art Critic's Gallery" appears in the heading
    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 2, name: /Art Critic's Gallery/i });
      expect(heading).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should default to "User\'s Gallery" if profile name is missing', async () => {
    Object.defineProperty(window, 'location', {
        value: {
          search: '?sharedProfile=missing-uid',
          origin: 'http://localhost'
        },
        writable: true
    });

    // Ensure getDoc returns not found for this test
    const { getDoc } = await import('firebase/firestore');
    (getDoc as any).mockImplementation(() => Promise.resolve({ exists: () => false }));

    render(<App />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 2, name: /User's Gallery/i });
      expect(heading).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should display shared bucket list items when viewing a shared profile', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?sharedProfile=test-uid',
        origin: 'http://localhost'
      },
      writable: true
    });

    const { getDocs, getDoc, collection } = await import('firebase/firestore');
    
    // Mock profile
    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.path === 'public_profiles/test-uid') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ displayName: 'Art Critic' })
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    // Mock bucket list items
    (getDocs as any).mockImplementation((colRef: any) => {
      if (colRef.path === 'public_bucketlist/test-uid/items') {
        return Promise.resolve({
          size: 1,
          forEach: (cb: any) => {
            cb({
              id: 'item-1',
              data: () => ({
                image: 'data:image/jpeg;base64,mock',
                details: { title: 'Shared Masterpiece', artist: 'Test Artist', year: '2024' },
                timestamp: Date.now()
              })
            });
          }
        });
      }
      return Promise.resolve({ size: 0, forEach: () => {} });
    });

    render(<App />);

    // Switch to bucket list view
    const bucketListBtn = await screen.findByRole('button', { name: /bucket list/i });
    bucketListBtn.click();

    // Check if item is rendered
    await waitFor(() => {
      expect(screen.getByText('Shared Masterpiece')).toBeInTheDocument();
      expect(screen.getByText('Art Critic\'s Bucket List')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
