import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ImageOverrideModal } from './components/ImageOverrideModal';
import { Camera, Upload, Loader2, Info, Palette, History as HistoryIcon, ArrowRight, Trash2, LayoutGrid, Clock, Share2, Network, LogIn, LogOut, User as UserIcon, Check, Compass, Plus, Filter, SlidersHorizontal, ChevronDown, MapPin, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as heic2anyModule from 'heic2any';
import { identifyArtwork, identifyArtworkFromUrl, ArtDetails, EntityDetails, getEntityDetails } from './services/artService';
import { MuseumMap } from './components/MuseumMap';
import { HistoryItem } from './types';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { EntityViewer } from './components/EntityViewer';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './services/firebase';
import { ValidatedImage } from './components/ValidatedImage';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

// Handle potential default import differences
const heic2any = (heic2anyModule as any).default || heic2anyModule;

export default /**
 * Main Application Component for AURA.
 * Handles authentication, image processing, gallery management, and routing.
 */
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [details, setDetails] = useState<ArtDetails | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isGalleryPublic, setIsGalleryPublic] = useState(false);
  const [isBucketListPublic, setIsBucketListPublic] = useState(false);

  const deduplicateItems = (items: HistoryItem[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
      // Use Title + Artist (or Year if artist missing) as unique key
      const key = `${item.details.title.trim()}-${(item.details.artist || item.details.year || '').trim()}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  
  const [sharedGalleryOwnerName, setSharedGalleryOwnerName] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'galleries' | 'entity-viewer' | 'bucketlist'>('home');
  const [overrideTarget, setOverrideTarget] = useState<{ id: string, type: 'history' | 'bucketlist' } | null>(null);
  const updateArtworkImage = async (id: string, imageUrl: string, type: 'history' | 'bucketlist') => {
    if (!user) return;
    try {
      let updatedDetails: ArtDetails | null = null;
      
      // If it's a bucket list item or history item with placeholder description, try to identify it now
      const currentItem = type === 'history' 
        ? history.find(h => h.id === id) 
        : bucketList.find(b => b.id === id);
        
      if (currentItem && (currentItem.details.description.startsWith('Bucket list work') || currentItem.details.medium === 'Unknown')) {
        try {
          updatedDetails = await identifyArtworkFromUrl(imageUrl, currentItem.details.title, currentItem.details.artist);
        } catch (e) {
          console.error("Auto-identification failed during image update:", e);
        }
      }

      const updateData: any = { image: imageUrl };
      if (updatedDetails) {
        updateData.details = updatedDetails;
      }

      if (type === 'history') {
        const path = `users/${user.uid}/items`;
        setHistory(prev => prev.map(item => item.id === id ? { ...item, image: imageUrl, details: updatedDetails || item.details } : item));
        await updateDoc(doc(db, path, id), updateData);
        
        if (isGalleryPublic) {
          await updateDoc(doc(db, `public_items/${user.uid}/items`, id), updateData);
        }
      } else {
        const path = `users/${user.uid}/bucketlist`;
        setBucketList(prev => prev.map(item => item.id === id ? { ...item, image: imageUrl, details: updatedDetails || item.details } : item));
        await updateDoc(doc(db, path, id), updateData);
        
        if (isBucketListPublic) {
          await updateDoc(doc(db, `public_bucketlist/${user.uid}/items`, id), updateData);
        }
      }
    } catch (err) {
      console.error("Failed to update artwork image:", err);
    }
  };

  const [navStack, setNavStack] = useState<{ view: typeof view, entity: EntityDetails | null, details: ArtDetails | null }[]>([]);

  const navigateTo = (newView: typeof view, entity: EntityDetails | null = null) => {
    setNavStack(prev => [...prev, { view, entity: selectedEntity, details }]);
    if (newView !== 'home') {
      setDetails(null);
    }
    setView(newView);
    setSelectedEntity(entity);
  };

  const navigateBack = () => {
    if (navStack.length === 0) {
      setView('home');
      setSelectedEntity(null);
      setDetails(null);
      return;
    }
    const previous = navStack[navStack.length - 1];
    setNavStack(prev => prev.slice(0, -1));
    setView(previous.view);
    setSelectedEntity(previous.entity);
    setDetails(previous.details || null);
  };
  const [galleryMode, setGalleryMode] = useState<'grid' | 'graph' | 'map'>('grid');
  const [bucketList, setBucketList] = useState<HistoryItem[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Filtering State for the Gallery and Bucket List
  const [showFilters, setShowFilters] = useState(false);
  const [mediumFilters, setMediumFilters] = useState<string[]>([]);
  const [museumFilters, setMuseumFilters] = useState<string[]>([]);
  const [yearMin, setYearMin] = useState<number>(-20000); // 20,000 BCE default
  const [yearMax, setYearMax] = useState<number>(new Date().getFullYear());

  /**
   * Toggles a filter value in an array of strings.
   * Used for multi-select filtering logic.
   */
  const toggleFilter = (set: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    set(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  /**
   * Filter Section component used in both Gallery and Bucket List views.
   */
  const FilterSection = () => (
    <AnimatePresence>
      {showFilters && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden mb-12"
        >
          <div className="p-8 bg-artistic-shadow/30 rounded-3xl border border-artistic-ink/5 grid grid-cols-1 md:grid-cols-3 gap-8 text-artistic-ink">
            {/* Medium Filter */}
            <div className="space-y-4">
              <label className="text-[9px] uppercase tracking-widest font-bold opacity-40 block">Filter by Medium</label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                {allMediums.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleFilter(setMediumFilters, m)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${mediumFilters.includes(m) ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink/30'}`}
                  >
                    {m}
                  </button>
                ))}
                {allMediums.length === 0 && <span className="text-[10px] italic opacity-30">No mediums found</span>}
              </div>
            </div>

            {/* Museum Filter */}
            <div className="space-y-4">
              <label className="text-[9px] uppercase tracking-widest font-bold opacity-40 block">Filter by Museum</label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                {allMuseums.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleFilter(setMuseumFilters, m)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${museumFilters.includes(m) ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink/30'}`}
                  >
                    {m}
                  </button>
                ))}
                {allMuseums.length === 0 && <span className="text-[10px] italic opacity-30">No museums found</span>}
              </div>
            </div>

            {/* Year Range Filter */}
            <div className="space-y-4">
              <div className="flex justify-between">
                <label className="text-[9px] uppercase tracking-widest font-bold opacity-40 block">Year Range</label>
                <span className="text-[9px] font-mono opacity-60">
                  {yearMin < 0 ? `${Math.abs(yearMin)} BCE` : yearMin} — {yearMax}
                </span>
              </div>
              <div className="flex gap-4 items-center">
                <input 
                  type="number" 
                  placeholder="Min"
                  value={yearMin}
                  onChange={(e) => setYearMin(parseInt(e.target.value) || -20000)}
                  className="w-full bg-white border border-artistic-ink/10 rounded-xl px-4 py-2 text-xs font-mono outline-none focus:border-artistic-accent transition-colors"
                />
                <span className="opacity-20 text-xs">to</span>
                <input 
                  type="number" 
                  placeholder="Max"
                  value={yearMax}
                  onChange={(e) => setYearMax(parseInt(e.target.value) || new Date().getFullYear())}
                  className="w-full bg-white border border-artistic-ink/10 rounded-xl px-4 py-2 text-xs font-mono outline-none focus:border-artistic-accent transition-colors"
                />
              </div>
            </div>

            <div className="md:col-span-3 flex justify-end">
              <button 
                onClick={() => {
                  setMediumFilters([]);
                  setMuseumFilters([]);
                  setYearMin(-20000);
                  setYearMax(new Date().getFullYear());
                }}
                className="text-[9px] uppercase font-bold tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                Clear All Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const [sharedUid, setSharedUid] = useState<string | null>(new URLSearchParams(window.location.search).get('sharedProfile'));
  const [isViewOnly, setIsViewOnly] = useState(new URLSearchParams(window.location.search).has('sharedProfile') || new URLSearchParams(window.location.search).has('sharedGallery') || new URLSearchParams(window.location.search).has('sharedBucketList'));
  
  const openEntity = async (nameOrDetails: string | EntityDetails, type?: 'artist' | 'movement' | 'museum' | 'type' | 'location') => {
    const name = typeof nameOrDetails === 'string' ? nameOrDetails : nameOrDetails.name;
    const entityType = typeof nameOrDetails === 'string' ? type : nameOrDetails.type;

    if (!name || typeof name !== 'string' || name.toLowerCase() === 'unknown' || name.toLowerCase() === 'various') return;
    setIsLoading(true);
    try {
      const entity = typeof nameOrDetails === 'string' 
        ? await getEntityDetails(name, entityType!)
        : nameOrDetails;
      navigateTo('entity-viewer', entity);
    } catch (err) {
      console.error("Failed to fetch entity details", err);
      // Don't show error for now, just fallback
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedProfileUid = params.get('sharedProfile');
    const oldSharedGallery = params.get('sharedGallery');
    const oldSharedBucketList = params.get('sharedBucketList');
    
    if (user) {
      if (sharedProfileUid) {
        setIsViewOnly(user.uid !== sharedProfileUid);
      } else if (oldSharedGallery) {
        setIsViewOnly(user.uid !== oldSharedGallery);
      } else if (oldSharedBucketList) {
        setIsViewOnly(user.uid !== oldSharedBucketList);
      } else {
        setIsViewOnly(false);
      }
    } else {
      // If guest, only view only if params are present
      setIsViewOnly(!!(sharedProfileUid || oldSharedGallery || oldSharedBucketList));
    }
  }, [user]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Log basic profile
        const userDoc = doc(db, 'users', currentUser.uid);
        const userSnapshot = await getDoc(userDoc);
        let userData = userSnapshot.exists() ? userSnapshot.data() : {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          lastLogin: Date.now(),
          isGalleryPublic: false,
          isBucketListPublic: false
        };
        
        setIsGalleryPublic(userData.isGalleryPublic || false);
        setIsBucketListPublic(userData.isBucketListPublic || false);
        
        await setDoc(doc(db, 'public_profiles', currentUser.uid), {
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email
        }, { merge: true });
        
        await setDoc(userDoc, {
          ...userData,
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          lastLogin: Date.now()
        }, { merge: true });
      } else {
        // Fallback to local storage if signed out AND not viewing shared profile
        if (!isViewOnly) {
          const saved = localStorage.getItem('art_curator_history');
          if (saved) {
            try {
              setHistory(JSON.parse(saved));
            } catch (e) {
              setHistory([]);
            }
          }
          const savedBucket = localStorage.getItem('art_curator_bucketlist');
          if (savedBucket) {
            try {
              setBucketList(JSON.parse(savedBucket));
            } catch (e) {
              setBucketList([]);
            }
          }
        }
      }
    });
    return () => unsubscribe();
  }, [isViewOnly]);

  // Data Fetching Effect for User Data
  useEffect(() => {
    if (user && !isViewOnly) {
      fetchUserHistory(user.uid);
      fetchUserBucketList(user.uid);
    }
  }, [user, isViewOnly]);

  const fetchUserHistory = async (uid: string) => {
    const path = `users/${uid}/items`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      // Sort by timestamp descending and deduplicate
      const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(deduplicateItems(sorted));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  const fetchUserBucketList = async (uid: string) => {
    const path = `users/${uid}/bucketlist`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      // Sort by timestamp descending and deduplicate
      const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
      setBucketList(deduplicateItems(sorted));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return; // User closed the popup, not a real error
      }
      console.error("Login failed", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setHistory([]);
      setBucketList([]);
      setView('home');
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // Utility to resize image for better performance and storage
  const resizeImage = (base64Str: string, maxWidth: number = 1024, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str); // Fallback to original
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      setProgress(10);
      setError(null);
      setDetails(null);
      setImage(null);

      const isHeic = file.type === "image/heic" || 
                     file.type === "image/heif" || 
                     file.name.toLowerCase().endsWith(".heic") || 
                     file.name.toLowerCase().endsWith(".heif");
      
      const mimeType = isHeic ? "image/heic" : (file.type || "image/jpeg");

      try {
        console.log("Selected file:", file.name, "Mime:", mimeType);
        
        const reader = new FileReader();
        const fileToRead = file;
        
        reader.onloadend = async () => {
          const fullBase64 = reader.result as string;
          const rawBase64Data = fullBase64.split(',')[1];
          
          if (isHeic) {
            console.log("HEIC detected, attempting conversion...");
            setProgress(30);
            try {
              // Try Browser-side conversion using heic2any
              const lib = (heic2anyModule as any).default || heic2anyModule;
              const convertedBlob = await (lib as any)({
                blob: fileToRead,
                toType: "image/jpeg",
                quality: 0.7
              });
              setProgress(50);
              const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
              const convReader = new FileReader();
              convReader.onloadend = async () => {
                const convBase64 = convReader.result as string;
                const optimizedImage = await resizeImage(convBase64, 1200, 0.8);
                setImage(optimizedImage);
                processImage(optimizedImage.split(',')[1], "image/jpeg");
              };
              convReader.readAsDataURL(blob);
              return;
            } catch (convErr) {
              console.warn("HEIC browser-side conversion failed, attempting server-side...", convErr);
              setProgress(40);
              try {
                const response = await fetch('/api/convert-heic', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ base64: rawBase64Data })
                });
                if (!response.ok) throw new Error("Server conversion failed");
                const data = await response.json();
                const optimizedImage = await resizeImage(`data:image/png;base64,${data.base64}`, 1200, 0.8);
                setImage(optimizedImage);
                processImage(optimizedImage.split(',')[1], "image/png");
                return;
              } catch (srvErr) {
                console.error("HEIC conversion failed entirely:", srvErr);
                setError("I couldn't process this HEIC image. Please try a different format.");
                setIsLoading(false);
                return;
              }
            }
          } else {
            // Standard Image Processing
            setProgress(30);
            const optimizedImage = await resizeImage(fullBase64, 1200, 0.8);
            setImage(optimizedImage);
            setProgress(60);
            processImage(optimizedImage.split(',')[1], mimeType);
          }
        };

        reader.onerror = () => {
          setError("Failed to read the image file.");
          setIsLoading(false);
        };
        
        reader.readAsDataURL(fileToRead);

      } catch (err) {
        console.error("Image processing error:", err);
        setError(err instanceof Error ? err.message : "I had trouble processing this image.");
        setIsLoading(false);
      }
    }
  };

  const processImage = async (base64: string, mimeType: string = "image/jpeg") => {
    setIsLoading(true);
    setProgress(80);
    try {
      const result = await identifyArtwork(base64, mimeType);
      setProgress(100);
      setDetails(result);
      
      // Duplicate Check: Stop if already in history
      const isDuplicate = history.some(item => 
        item.details.title === result.title && 
        (item.details.artist === result.artist || item.details.year === result.year)
      );

      if (isDuplicate) {
        setIsLoading(false);
        return;
      }
      
      // Create a small thumbnail for the history to save localStorage space
      const thumbnailImg = await resizeImage(`data:${mimeType};base64,${base64}`, 400, 0.6);
      
      const newItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        image: thumbnailImg,
        details: result,
        timestamp: Date.now()
      };
      
      setHistory(prev => [newItem, ...prev].slice(0, 50));

      // Persist to Firebase if logged in
      if (user) {
        const path = `users/${user.uid}/items`;
        try {
          await setDoc(doc(db, path, newItem.id), {
            ...newItem,
            userId: user.uid
          });
          
          // Also update public gallery if sharing is ON
          if (isGalleryPublic) {
            const publicPath = `public_items/${user.uid}/items`;
            await setDoc(doc(db, publicPath, newItem.id), {
              ...newItem,
              userId: user.uid
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        // Save to local storage for guest
        const saved = localStorage.getItem('art_curator_history');
        const local = saved ? JSON.parse(saved) : [];
        // Secondary safety check for local storage
        if (!local.some((item: HistoryItem) => item.details.title === newItem.details.title)) {
          localStorage.setItem('art_curator_history', JSON.stringify([newItem, ...local].slice(0, 50)));
        }
      }
    } catch (err) {
      console.error(err);
      setError("I couldn't identify this artwork. Please try another image.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedProfileUid = params.get('sharedProfile');
    // Backward compatibility
    const oldSharedGallery = params.get('sharedGallery');
    const oldSharedBucketList = params.get('sharedBucketList');
    
    const loadShared = async () => {
        // Only load shared if we are actually in view only mode for THIS profile
        // This handles cases where owner opens their own shared link
        const currentIsViewOnly = user ? (
            sharedProfileUid ? user.uid !== sharedProfileUid :
            oldSharedGallery ? user.uid !== oldSharedGallery :
            oldSharedBucketList ? user.uid !== oldSharedBucketList :
            false
        ) : !!(sharedProfileUid || oldSharedGallery || oldSharedBucketList);

        if (!currentIsViewOnly) return;

        if (sharedProfileUid) {
            setIsLoading(true);
            
            // Try to fetch profile from public_profiles
            try {
                const userDoc = await getDoc(doc(db, 'public_profiles', sharedProfileUid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const name = userData.displayName || userData.email?.split('@')[0] || 'User';
                    setSharedGalleryOwnerName(name);
                } else {
                    setSharedGalleryOwnerName('User');
                }
            } catch (err) {
                console.error("Error fetching user profile:", err);
                setSharedGalleryOwnerName('User');
            }
            
            try {
              await Promise.all([
                  fetchPublicGallery(sharedProfileUid, false), 
                  fetchPublicBucketList(sharedProfileUid, false)
              ]);
            } catch (err) {
              console.error("Error fetching shared data:", err);
            } finally {
              setIsLoading(false);
            }
            setView('galleries');
        } else if (oldSharedGallery) {
            fetchPublicGallery(oldSharedGallery);
            setView('galleries');
        } else if (oldSharedBucketList) {
            fetchPublicBucketList(oldSharedBucketList);
            setView('bucketlist');
        }
    };

    loadShared();
  }, [user]);

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    
    if (user) {
      const path = `users/${user.uid}/items`;
      try {
        await deleteDoc(doc(db, path, id));
        if (isGalleryPublic) {
          await deleteDoc(doc(db, `public_items/${user.uid}/items`, id));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      const saved = localStorage.getItem('art_curator_history');
      if (saved) {
        const local = JSON.parse(saved).filter((i: any) => i.id !== id);
        localStorage.setItem('art_curator_history', JSON.stringify(local));
      }
    }
  };

  // Reactive re-fetch for shared views
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedProfileUid = params.get('sharedProfile');
    
    if (isViewOnly && sharedProfileUid) {
      if (view === 'bucketlist') {
        fetchPublicBucketList(sharedProfileUid, false);
      } else if (view === 'galleries') {
        fetchPublicGallery(sharedProfileUid, false);
      }
    }
  }, [view, isViewOnly]);
  
  const deleteBucketListItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBucketList(prev => prev.filter(item => item.id !== itemId));
    
    if (user) {
      const path = `users/${user.uid}/bucketlist`;
      try {
        await deleteDoc(doc(db, path, itemId));
        if (isBucketListPublic) {
          await deleteDoc(doc(db, `public_bucketlist/${user.uid}/items`, itemId));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const moveBucketToGallery = async (item: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user && isViewOnly) return;

    // 1. Remove from bucket list
    setBucketList(prev => prev.filter(i => i.id !== item.id));
    
    // 2. Add to history
    const newItem = {
      ...item,
      timestamp: Date.now() // Update timestamp to now so it appears at top of gallery
    };
    setHistory(prev => [newItem, ...prev].slice(0, 50));

    if (user) {
      try {
        const bucketPath = `users/${user.uid}/bucketlist`;
        const historyPath = `users/${user.uid}/items`;
        
        await Promise.all([
          deleteDoc(doc(db, bucketPath, item.id)),
          setDoc(doc(db, historyPath, item.id), { ...newItem, userId: user.uid })
        ]);

        if (isBucketListPublic) {
          await deleteDoc(doc(db, `public_bucketlist/${user.uid}/items`, item.id));
        }
        if (isGalleryPublic) {
          await setDoc(doc(db, `public_items/${user.uid}/items`, item.id), { ...newItem, userId: user.uid });
        }
      } catch (err) {
        console.error("Failed to move item to gallery:", err);
      }
    } else {
      // Guest local storage
      const savedBucket = localStorage.getItem('art_curator_bucketlist');
      if (savedBucket) {
        const localBucket = JSON.parse(savedBucket).filter((i: any) => i.id !== item.id);
        localStorage.setItem('art_curator_bucketlist', JSON.stringify(localBucket));
      }
      const savedHistory = localStorage.getItem('art_curator_history');
      const localHistory = savedHistory ? JSON.parse(savedHistory) : [];
      localStorage.setItem('art_curator_history', JSON.stringify([newItem, ...localHistory].slice(0, 50)));
    }
  };

  const fetchPublicBucketList = async (uid: string, autoLoading = true) => {
      if (autoLoading) setIsLoading(true);
      const path = `public_bucketlist/${uid}/items`;
      try {
        console.log("DEBUG: Fetching bucket list from:", path);
        const q = query(collection(db, path));
        const querySnapshot = await getDocs(q);
        console.log("DEBUG: Snapshot size:", querySnapshot.size);
        const items: HistoryItem[] = [];
        querySnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as HistoryItem);
        });
        const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
        setBucketList(deduplicateItems(sorted));
      } catch (err) {
        console.error("DEBUG: Failed to load shared bucket list:", err);
        setError("Failed to load shared bucket list.");
      } finally {
        if (autoLoading) setIsLoading(false);
      }
  };

  const handleShare = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AURA - Art Binnacle',
          text: 'Check out my curated art collection on AURA!',
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        // Simple fallback feedback
        const btn = document.activeElement as HTMLButtonElement;
        const originalTitle = btn.title;
        btn.title = "Copied!";
        setTimeout(() => { btn.title = originalTitle; }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const toggleProfilePublic = async () => {
    if (!user) return;
    setIsLoading(true);
    const nextPublic = !(isGalleryPublic || isBucketListPublic);
    setIsGalleryPublic(nextPublic);
    setIsBucketListPublic(nextPublic);
    
    try {
        await Promise.all([
          setDoc(doc(db, 'users', user.uid), { 
            isGalleryPublic: nextPublic,
            isBucketListPublic: nextPublic 
          }, { merge: true }),
          setDoc(doc(db, 'public_profiles', user.uid), {
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email
          }, { merge: true })
        ]);
        
        // Sync Gallery items
        if (nextPublic) {
          for (const item of history) {
              const docRef = doc(db, `public_items/${user.uid}/items`, item.id);
              await setDoc(docRef, { ...item, userId: user.uid });
          }
        } else {
          const q = query(collection(db, `public_items/${user.uid}/items`));
          const snapshot = await getDocs(q);
          for (const docSnapshot of snapshot.docs) {
              await deleteDoc(docSnapshot.ref);
          }
        }

        // Sync Bucket List items
        if (nextPublic) {
          for (const item of bucketList) {
              const docRef = doc(db, `public_bucketlist/${user.uid}/items`, item.id);
              await setDoc(docRef, { ...item, userId: user.uid });
          }
        } else {
          const q = query(collection(db, `public_bucketlist/${user.uid}/items`));
          const snapshot = await getDocs(q);
          for (const docSnapshot of snapshot.docs) {
              await deleteDoc(docSnapshot.ref);
          }
        }
    } catch (err) {
        console.error("Profile sync failed", err);
        setError("Failed to update profile sharing settings.");
        setIsGalleryPublic(!nextPublic);
        setIsBucketListPublic(!nextPublic);
    } finally {
        setIsLoading(false);
    }
  };

  const toggleBucketListPublic = async () => {
    // Deprecated in favor of toggleProfilePublic
    await toggleProfilePublic();
  };

  const toggleGalleryPublic = async () => {
    // Deprecated in favor of toggleProfilePublic
    await toggleProfilePublic();
  };

  const fetchPublicGallery = async (uid: string, autoLoading = true) => {
      if (autoLoading) setIsLoading(true);
      const path = `public_items/${uid}/items`;
      try {
        const q = query(collection(db, path));
        const querySnapshot = await getDocs(q);
        const items: HistoryItem[] = [];
        querySnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as HistoryItem);
        });
        const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(deduplicateItems(sorted));
      } catch (err) {
        setError("Failed to load shared gallery.");
      } finally {
        if (autoLoading) setIsLoading(false);
      }
  };

  const loadFromHistory = async (item: HistoryItem) => {
    setImage(item.image);
    
    // Check if details look like placeholder
    if (item.details.description.startsWith('Bucket list work by') || item.details.medium === 'Unknown') {
       try {
         // Pass existing title and artist as hints to prevent AI from messing up identified details
         const newDetails = await identifyArtworkFromUrl(item.image, item.details.title, item.details.artist);
         setDetails(newDetails);
         // Optionally update bucket list/history in state and db
       } catch (err) {
         console.error("Failed to fetch better details", err);
         setDetails(item.details);
       }
    } else {
        setDetails(item.details);
    }
    
    navigateTo('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const allMediums = useMemo(() => {
    const mediums = new Set<string>();
    history.forEach(h => h.details.medium && mediums.add(h.details.medium));
    bucketList.forEach(b => b.details.medium && mediums.add(b.details.medium));
    return Array.from(mediums).sort();
  }, [history, bucketList]);

  const allMuseums = useMemo(() => {
    const museums = new Set<string>();
    history.forEach(h => h.details.museum && museums.add(h.details.museum));
    bucketList.forEach(b => b.details.museum && museums.add(b.details.museum));
    return Array.from(museums).sort();
  }, [history, bucketList]);

  const filterItem = (item: HistoryItem) => {
    if (mediumFilters.length > 0 && item.details.medium && !mediumFilters.includes(item.details.medium)) return false;
    if (museumFilters.length > 0 && item.details.museum && !museumFilters.includes(item.details.museum)) return false;
    
    // Year range parsing
    const yearMatch = item.details.year?.match(/-?\d+/);
    if (yearMatch) {
      const y = parseInt(yearMatch[0]);
      if (y < yearMin || y > yearMax) return false;
    }
    return true;
  };

  const filteredHistory = useMemo(() => history.filter(filterItem), [history, mediumFilters, museumFilters, yearMin, yearMax]);
  const filteredBucketList = useMemo(() => bucketList.filter(filterItem), [bucketList, mediumFilters, museumFilters, yearMin, yearMax]);

  const findAndLoadFromHistoryId = (id: string) => {
    const item = history.find(i => i.id === id) || bucketList.find(i => i.id === id);
    if (item) loadFromHistory(item);
  };

  const reset = () => {
    setImage(null);
    setDetails(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen border-8 border-white box-border flex flex-col">
      {/* Shared Profile Banner */}
      {isViewOnly && sharedGalleryOwnerName && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-artistic-ink text-artistic-bg py-3 px-10 text-[9px] uppercase font-bold tracking-[0.3em] flex items-center justify-between z-[60]"
        >
          <div className="flex items-center gap-4">
            <span className="w-2 h-2 bg-artistic-accent rounded-full animate-pulse" />
            <span>Viewing {sharedGalleryOwnerName}'s Curated Heritage Binnacle</span>
          </div>
          <button 
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('sharedProfile');
              url.searchParams.delete('sharedGallery');
              url.searchParams.delete('sharedBucketList');
              window.location.href = url.origin;
            }}
            className="px-4 py-1 border border-white/20 rounded-full hover:bg-white hover:text-artistic-ink transition-all"
          >
            {user ? 'Return to my collection' : 'Start my own collection'}
          </button>
        </motion.div>
      )}

      {/* Navigation / Header */}
      <header className="h-16 md:h-20 flex justify-between items-center px-4 md:px-10 border-b border-artistic-ink/10 bg-artistic-bg/80 backdrop-blur-md z-50">
        <div 
          className="flex items-center space-x-2 md:space-x-4 cursor-pointer group"
          onClick={() => { setView('home'); reset(); setIsMobileMenuOpen(false); }}
        >
          <div className="w-8 h-8 md:w-12 md:h-12 bg-white/50 backdrop-blur rounded-full flex items-center justify-center p-1.5 border border-artistic-ink/5 overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-500">
            <img 
              src="/logo.png" 
              alt="Aura Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="uppercase tracking-[0.2em] md:tracking-[0.4em] font-black text-[9px] md:text-[11px] text-artistic-ink hover:text-artistic-accent transition-colors">Aura</span>
        </div>
        
        <nav className="hidden lg:flex space-x-12 uppercase text-[9px] tracking-[0.2em] font-bold">
          <button 
            disabled={isViewOnly}
            onClick={() => { navigateTo('home'); reset(); }} 
            className={`${view === 'home' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Scanner
          </button>
          <button 
            onClick={() => navigateTo('galleries')} 
            className={`${view === 'galleries' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Gallery
          </button>
          <button 
            onClick={() => navigateTo('bucketlist')} 
            className={`${view === 'bucketlist' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Bucket List
          </button>
        </nav>

        <div className="flex items-center gap-2 md:gap-6">
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 lg:hidden text-artistic-ink hover:bg-artistic-shadow rounded-full transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {user ? (
            <div className="hidden sm:flex items-center gap-4 border-l border-artistic-ink/10 pl-6">
              <div className="flex flex-col items-end mr-2">
                <span className="text-[8px] uppercase tracking-widest font-bold opacity-40">Collector</span>
                <span className="text-[9px] font-bold truncate max-w-[80px]">{user.displayName || user.email?.split('@')[0]}</span>
              </div>
              
              <div className="flex items-center gap-2 border-x border-artistic-ink/5 px-2 md:px-4 h-10">
                <button 
                  onClick={toggleProfilePublic}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[8px] uppercase font-bold tracking-widest transition-all ${isGalleryPublic || isBucketListPublic ? 'bg-artistic-accent text-white shadow-lg shadow-artistic-accent/20' : 'bg-artistic-shadow text-artistic-ink/40 hover:text-artistic-ink'}`}
                >
                  <Share2 className="w-3 h-3" />
                  <span className="hidden md:inline">{isGalleryPublic || isBucketListPublic ? 'Public' : 'Share Profile'}</span>
                </button>
                
                {(isGalleryPublic || isBucketListPublic) && (
                  <button 
                    onClick={() => handleShare(`${window.location.origin}/?sharedProfile=${user.uid}`)}
                    className="p-2 hover:bg-artistic-shadow rounded-full text-artistic-ink transition-colors"
                    title="Copy Profile Link"
                  >
                    <Plus className="w-3.5 h-3.5 rotate-45" />
                  </button>
                )}
              </div>

              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="hidden sm:flex items-center gap-3 px-4 py-2 bg-artistic-ink text-artistic-bg rounded-full text-[9px] uppercase font-bold tracking-widest hover:bg-artistic-accent transition-all"
            >
              <LogIn className="w-3 h-3" />
              <span>Sign In</span>
            </button>
          )}

          {image && (
            <button 
              onClick={reset}
              className="hidden md:block text-[9px] font-bold uppercase tracking-[0.2em] text-artistic-ink/40 hover:text-artistic-ink transition-colors"
            >
              Reset
            </button>
          )}
          <button 
            disabled={isViewOnly}
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 md:px-5 py-2 border border-artistic-ink rounded-full text-[9px] md:text-[10px] uppercase font-bold tracking-tight hover:bg-artistic-ink hover:text-artistic-bg transition-all ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Capture'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-artistic-ink/20 backdrop-blur-sm z-[90]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[280px] bg-artistic-bg z-[100] p-6 shadow-2xl flex flex-col border-l border-artistic-ink/5"
            >
              <div className="flex justify-between items-center mb-10">
                <span className="uppercase tracking-[0.4em] font-black text-[9px] text-artistic-ink/40">Navigator</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 transition-colors hover:bg-artistic-shadow rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex flex-col space-y-8 uppercase text-lg tracking-[0.2em] font-serif italic">
                <button 
                  disabled={isViewOnly}
                  onClick={() => { navigateTo('home'); reset(); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'home' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Scanner</span>
                  {view === 'home' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('galleries'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'galleries' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Gallery</span>
                  {view === 'galleries' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('bucketlist'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'bucketlist' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Bucket List</span>
                  {view === 'bucketlist' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
              </nav>

              <div className="mt-auto border-t border-artistic-ink/10 pt-8 space-y-6">
                {user ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest font-bold opacity-30 italic">Identified as</span>
                      <span className="text-[11px] font-bold truncate">{user.displayName || user.email}</span>
                    </div>
                    
                    <button 
                      onClick={() => { toggleProfilePublic(); setIsMobileMenuOpen(false); }}
                      className={`flex items-center justify-between w-full p-3 rounded-xl transition-all ${isGalleryPublic || isBucketListPublic ? 'bg-artistic-accent text-white shadow-lg shadow-artistic-accent/20' : 'bg-artistic-shadow text-artistic-ink/60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        <span className="text-[9px] uppercase font-bold tracking-widest">Visibility</span>
                      </div>
                      <div className={`w-7 h-3.5 rounded-full relative ${isGalleryPublic || isBucketListPublic ? 'bg-white/30' : 'bg-artistic-ink/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${isGalleryPublic || isBucketListPublic ? 'right-0.5 bg-white' : 'left-0.5 bg-artistic-ink/40'}`} />
                      </div>
                    </button>

                    <button 
                      onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                      className="flex items-center gap-2 text-red-500/60 hover:text-red-500 transition-colors font-bold uppercase tracking-widest text-[8px]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => { handleLogin(); setIsMobileMenuOpen(false); }}
                    className="w-full py-3.5 bg-artistic-ink text-artistic-bg rounded-xl text-[9px] uppercase font-bold tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-artistic-ink/20"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden">
        {view === 'entity-viewer' && selectedEntity ? (
          <EntityViewer 
            details={selectedEntity} 
            history={history}
            onEntityClick={openEntity}
            relatedArtworks={
              history.filter(h => {
                if (selectedEntity.type === 'artist') return h.details.artist === selectedEntity.name;
                if (selectedEntity.type === 'movement') return h.details.movement === selectedEntity.name;
                if (selectedEntity.type === 'museum') return h.details.museum === selectedEntity.name;
                if (selectedEntity.type === 'type') return h.details.type === selectedEntity.name;
                return false;
              })
            }
            relatedBucketList={
              bucketList.filter(h => {
                if (selectedEntity.type === 'artist') return h.details.artist === selectedEntity.name;
                if (selectedEntity.type === 'movement') return h.details.movement === selectedEntity.name;
                if (selectedEntity.type === 'museum') return h.details.museum === selectedEntity.name;
                if (selectedEntity.type === 'type') return h.details.type === selectedEntity.name;
                return false;
              })
            }
            bucketListWorks={bucketList}
            onArtworkClick={findAndLoadFromHistoryId}
            onAddToBucketList={async (work) => {
              // Avoid duplicates
              if (bucketList.some(item => item.details.title === work.title && item.details.year === work.year)) {
                return;
              }
              const favoriteDetails: ArtDetails = {
                title: work.title,
                artist: selectedEntity.type === 'artist' ? selectedEntity.name : 'Unknown',
                year: work.year,
                movement: selectedEntity.type === 'movement' ? selectedEntity.name : 'Unknown',
                medium: 'Unknown',
                type: 'Masterpiece',
                description: 'Bucket list work by ' + (selectedEntity.name || 'Unknown'),
                historicalContext: 'Saved from famous works.',
                museum: work.museum,
                location: work.location
              };
              const newItem: HistoryItem = {
                id: Date.now().toString() + Math.random().toString(36).substring(2),
                image: work.imageUrl || '',
                details: favoriteDetails,
                timestamp: Date.now()
              };

              if (!user) {
                // Add to local storage for guests
                setBucketList(prev => {
                  const updated = [newItem, ...prev].slice(0, 50);
                  localStorage.setItem('art_curator_bucketlist', JSON.stringify(updated));
                  return updated;
                });
                return;
              }

              try {
                await setDoc(doc(db, `users/${user.uid}/bucketlist`, newItem.id), {
                    ...newItem,
                    userId: user.uid
                });
                
                // Also update public bucket list if sharing is ON
                if (isBucketListPublic) {
                  await setDoc(doc(db, `public_bucketlist/${user.uid}/items`, newItem.id), {
                    ...newItem,
                    userId: user.uid
                  });
                }
                
                setBucketList(prev => [newItem, ...prev].slice(0, 50));
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/bucketlist`);
              }
            }}
            onUpdateFamousWorkImage={async (workTitle, imageUrl) => {
              if (selectedEntity) {
                const updatedWorks = selectedEntity.famousWorks.map(w => 
                  w.title === workTitle ? { ...w, imageUrl } : w
                );
                const updatedEntity = { ...selectedEntity, famousWorks: updatedWorks };
                setSelectedEntity(updatedEntity);
                
                // Persist to Firestore
                const collectionName = selectedEntity.type === 'artist' 
                  ? 'metadata_artists' 
                  : selectedEntity.type === 'movement' 
                    ? 'metadata_movements'
                    : selectedEntity.type === 'museum'
                      ? 'metadata_museums'
                      : selectedEntity.type === 'location'
                        ? 'metadata_locations'
                        : 'metadata_types';
                
                const id = updatedEntity.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                try {
                  await setDoc(doc(db, collectionName, id), updatedEntity);
                } catch (err) {
                  console.error("Failed to update entity metadata:", err);
                }
              }
            }}
            onBack={navigateBack} 
          />
            ) : view === 'bucketlist' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-10 md:mb-16">
                <div className="flex justify-between items-end gap-6 flex-wrap">
                  <div>
                    <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-2 md:mb-4">Curated Selections</span>
                    <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">
                      {isViewOnly 
                        ? (sharedGalleryOwnerName ? `${sharedGalleryOwnerName}'s` : 'User\'s') 
                        : (user ? (user.displayName || user.email?.split('@')[0] || 'My') : 'Guest')} Bucket List
                    </h2>
                  </div>
                  <div className="flex items-center gap-4 md:gap-6 flex-wrap">
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border text-[9px] md:text-[10px] uppercase font-bold tracking-widest transition-all ${showFilters ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink'}`}
                    >
                      <Filter className="w-3 h-3" />
                      <span>Filters</span>
                      {(mediumFilters.length > 0 || museumFilters.length > 0 || yearMin !== -20000 || yearMax !== new Date().getFullYear()) && (
                        <span className="w-2 h-2 bg-artistic-accent rounded-full" />
                      )}
                    </button>
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <button 
                      onClick={() => {
                        setMediumFilters([]);
                        setMuseumFilters([]);
                        setYearMin(-20000);
                        setYearMax(new Date().getFullYear());
                      }}
                      className="text-[9px] uppercase font-bold tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All Filters
                    </button>
                  </div>
                </div>
              </header>

              <FilterSection />

              {filteredBucketList.length === 0 ? (
                <div className="h-[40vh] flex flex-col items-center justify-center text-center">
                  <p className="text-artistic-ink/40 text-sm italic">
                    {bucketList.length === 0 
                      ? "You haven't added anything to your bucket list." 
                      : "No items match your active filters."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
                  <AnimatePresence>
                    {filteredBucketList.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={{ y: -5 }}
                        onClick={() => loadFromHistory(item)}
                        className="group cursor-pointer"
                      >
                        <div className="aspect-[4/5] bg-artistic-shadow p-4 mb-6 art-shadow transition-all group-hover:shadow-[40px_40px_0px_#E5E0D5]">
                          <div className="w-full h-full bg-gray-100 gallery-frame overflow-hidden relative group/img">
                            <ValidatedImage 
                              src={item.image} 
                              alt={item.details.title} 
                              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                              fallback={
                                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                  <Palette className="w-8 h-8 opacity-10 mb-2" />
                                  <div className="flex gap-4">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverrideTarget({ id: item.id, type: 'bucketlist' });
                                      }}
                                      className="text-[10px] uppercase font-bold tracking-widest text-artistic-accent hover:underline"
                                    >
                                      Assign Visual
                                    </button>
                                    <a 
                                      href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.details.title + ' ' + (item.details.artist || ''))}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[10px] uppercase font-bold tracking-widest text-artistic-ink/40 hover:text-artistic-accent hover:underline flex items-center gap-1"
                                    >
                                      Search Visual
                                    </a>
                                  </div>
                                </div>
                              }
                            />
                            {!isViewOnly && (
                              <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => moveBucketToGallery(item, e)}
                                  className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-artistic-accent hover:bg-artistic-accent/10"
                                  title="Move to Gallery"
                                >
                                  <HistoryIcon className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => deleteBucketListItem(item.id, e)}
                                  className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <h3 className="font-serif text-xl italic mb-1 group-hover:text-artistic-accent transition-colors">{item.details.title}</h3>
                        <div className="flex items-center gap-3 text-[10px] uppercase font-bold tracking-widest opacity-40">
                          <span>{item.details.artist}</span>
                          <span className="w-1 h-px bg-artistic-ink" />
                          <span>{item.details.year}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        ) : view === 'galleries' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-10 md:mb-16 flex justify-between items-end gap-6 flex-wrap">
                <div>
                  <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-2 md:mb-4">Curated Collection</span>
                  <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">
                    {isViewOnly 
                      ? (sharedGalleryOwnerName ? `${sharedGalleryOwnerName}'s` : 'User\'s') 
                      : (user ? (user.displayName || user.email?.split('@')[0] || 'My') : 'Guest')} Gallery
                  </h2>
                </div>
                <div className="flex gap-4 md:gap-8 items-center flex-wrap">
                  <div className="flex items-center gap-2 md:gap-4">
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border text-[9px] md:text-[10px] uppercase font-bold tracking-widest transition-all ${showFilters ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink'}`}
                    >
                      <Filter className="w-3 h-3" />
                      <span className="hidden sm:inline">Filters</span>
                      {(mediumFilters.length > 0 || museumFilters.length > 0 || yearMin !== -20000 || yearMax !== new Date().getFullYear()) && (
                        <span className="w-2 h-2 bg-artistic-accent rounded-full" />
                      )}
                    </button>

                    <div className="flex p-1 bg-artistic-shadow rounded-full border border-artistic-ink/5">
                      <button 
                        onClick={() => setGalleryMode('grid')}
                        className={`p-1.5 md:p-2 rounded-full transition-all ${galleryMode === 'grid' ? 'bg-artistic-ink text-artistic-bg' : 'text-artistic-ink hover:bg-artistic-ink/5'}`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5 md:w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setGalleryMode('map')}
                        className={`p-1.5 md:p-2 rounded-full transition-all ${galleryMode === 'map' ? 'bg-artistic-ink text-artistic-bg' : 'text-artistic-ink hover:bg-artistic-ink/5'}`}
                      >
                        <MapPin className="w-3.5 h-3.5 md:w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setGalleryMode('graph')}
                        className={`p-1.5 md:p-2 rounded-full transition-all ${galleryMode === 'graph' ? 'bg-artistic-ink text-artistic-bg' : 'text-artistic-ink hover:bg-artistic-ink/5'}`}
                      >
                        <Network className="w-3.5 h-3.5 md:w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="hidden sm:flex gap-4 items-center opacity-40 text-[9px] uppercase font-bold tracking-widest border-l border-artistic-ink/10 pl-8">
                    <span>{filteredHistory.length} cataloged</span>
                  </div>
                </div>
              </header>

              <FilterSection />

              {(history.length === 0 && bucketList.length === 0) ? (
                <div className="h-[40vh] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 border border-artistic-ink/10 rounded-full flex items-center justify-center mb-6">
                    <Clock className="w-6 h-6 opacity-20" />
                  </div>
                  <p className="text-artistic-ink/40 text-sm italic">Your archive is currently empty.<br />Start by scanning an artwork.</p>
                </div>
              ) : galleryMode === 'map' ? (
                <div className="w-full bg-artistic-shadow/30 md:rounded-3xl border-y md:border border-artistic-ink/5 md:p-8 flex flex-col items-center">
                  <div className="w-full h-[450px] md:h-[700px] bg-white md:rounded-3xl shadow-sm border border-artistic-ink/5 relative overflow-hidden">
                    <MuseumMap 
                      items={filteredHistory} 
                      onArtworkClick={findAndLoadFromHistoryId} 
                    />
                  </div>
                  <p className="mt-4 md:mt-8 p-4 md:p-0 text-[10px] uppercase tracking-[0.2em] font-bold opacity-30 flex items-center gap-3">
                    <MapPin className="w-3 h-3" />
                    Global Heritage Map
                  </p>
                </div>
              ) : galleryMode === 'graph' ? (
                <div className="w-full bg-artistic-shadow/30 md:rounded-3xl border-y md:border border-artistic-ink/5 md:p-8 flex flex-col items-center">
                  <div className="w-full h-[500px] md:h-[700px] bg-white md:rounded-3xl shadow-sm border border-artistic-ink/5 relative overflow-hidden">
                    <KnowledgeGraph 
                      items={filteredHistory} 
                      bucketListItems={filteredBucketList}
                      onArtworkClick={findAndLoadFromHistoryId} 
                      onEntityClick={openEntity}
                    />
                  </div>
                  <p className="mt-4 md:mt-8 p-4 md:p-0 text-[10px] uppercase tracking-[0.2em] font-bold opacity-30 flex items-center gap-3">
                    <HistoryIcon className="w-3 h-3" />
                    Interactive Knowledge Graph
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
                  <AnimatePresence>
                    {filteredHistory.length === 0 && history.length > 0 && (
                      <div className="col-span-full h-[30vh] flex flex-col items-center justify-center text-center">
                        <p className="text-artistic-ink/40 text-sm italic">No masterpieces match your active filters.</p>
                      </div>
                    )}
                    {filteredHistory.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        whileHover={{ y: -5 }}
                        onClick={() => loadFromHistory(item)}
                        className="group cursor-pointer"
                      >
                        <div className="aspect-[4/5] bg-artistic-shadow p-4 mb-6 art-shadow transition-all group-hover:shadow-[40px_40px_0px_#E5E0D5]">
                          <div className="w-full h-full bg-gray-100 gallery-frame overflow-hidden relative group/img">
                            <ValidatedImage 
                              src={item.image} 
                              alt={item.details.title} 
                              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                              fallback={
                                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                  <Palette className="w-8 h-8 opacity-10 mb-2" />
                                  <div className="flex gap-4">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverrideTarget({ id: item.id, type: 'history' });
                                      }}
                                      className="text-[10px] uppercase font-bold tracking-widest text-artistic-accent hover:underline"
                                    >
                                      Assign Visual
                                    </button>
                                    <a 
                                      href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.details.title + ' ' + (item.details.artist || ''))}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[10px] uppercase font-bold tracking-widest text-artistic-ink/40 hover:text-artistic-accent hover:underline flex items-center gap-1"
                                    >
                                      Search Visual
                                    </a>
                                  </div>
                                </div>
                              }
                            />
                            {!isViewOnly && (
                              <button 
                                onClick={(e) => deleteHistoryItem(item.id, e)}
                                className="absolute top-4 right-4 w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <h3 className="font-serif text-xl italic mb-1 group-hover:text-artistic-accent transition-colors">{item.details.title}</h3>
                        <div className="flex items-center gap-3 text-[10px] uppercase font-bold tracking-widest opacity-40">
                          <span>{item.details.artist}</span>
                          <span className="w-1 h-px bg-artistic-ink" />
                          <span>{item.details.year}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        ) : !image ? (
          <section className="w-full flex flex-col items-center justify-center p-6 md:p-12 text-center bg-white overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="max-w-3xl py-12 md:py-0"
            >
              <div className="flex justify-center mb-8 md:mb-12">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-white/50 backdrop-blur rounded-full flex items-center justify-center p-2 md:p-3 border border-artistic-ink/5 overflow-hidden shadow-xl">
                  <img 
                    src="/logo.png" 
                    alt="Aura Logo" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <span className="uppercase text-[8px] md:text-[10px] tracking-[0.3em] md:tracking-[0.4em] font-bold text-artistic-accent block mb-4 md:mb-8 text-nowrap">Intelligence meets Aesthetics</span>
              <h1 className="font-serif text-4xl md:text-8xl mb-8 md:mb-12 leading-[1.1] tracking-tighter" style={{ fontFamily: 'Georgia, serif' }}>
                AURA - The <br /> <span className="italic">Art Binnacle</span>
              </h1>
              <p className="text-artistic-ink/60 max-w-lg mx-auto mb-10 md:mb-16 text-xs md:text-sm leading-relaxed px-4 md:px-0">
                Connect your vision to the history of human creativity. Our neural engine identifies, catalogs, and contextualizes any masterpiece in seconds.
              </p>

              <div className="flex gap-10 justify-center items-center">
                <div className="flex flex-col items-center">
                  <button
                    disabled={isViewOnly || isLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-14 h-14 md:w-16 md:h-16 bg-artistic-ink text-artistic-bg rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl mb-2 ${isViewOnly || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                  </button>
                  <span className="text-[9px] uppercase font-bold tracking-widest opacity-40">Scan Art</span>
                </div>
                <div onClick={() => !isLoading && setView('galleries')} className={`cursor-pointer group flex flex-col items-center ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                   <div className="w-14 h-14 md:w-16 md:h-16 border border-artistic-ink rounded-full flex items-center justify-center group-hover:bg-artistic-ink group-hover:text-artistic-bg transition-all mb-2">
                     <HistoryIcon className="w-6 h-6" />
                   </div>
                   <span className="text-[9px] uppercase font-bold tracking-widest opacity-40">Your Gallery</span>
                </div>
              </div>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*,.heic,.heif" 
                className="hidden" 
              />
            </motion.div>
          </section>
        ) : (
          <div className="w-full flex flex-col lg:flex-row overflow-hidden">
            {/* Image Preview Side (55%) */}
            <div className="w-full lg:w-[55%] p-6 md:p-10 lg:p-20 flex flex-col justify-center items-center bg-white overflow-y-auto relative">
              <button 
                onClick={navigateBack}
                className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest opacity-40 hover:opacity-100 hover:text-artistic-accent transition-all group"
              >
                <ArrowRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" />
                <span>Back to previous</span>
              </button>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative aspect-[4/5] w-full max-w-[480px] bg-artistic-shadow p-8 art-shadow"
              >
                <div className="w-full h-full bg-gray-100 gallery-frame flex items-center justify-center overflow-hidden relative group/img">
                  <ValidatedImage 
                    src={image} 
                    alt="Artwork Preview" 
                    className="w-full h-full object-cover" 
                    fallback={
                      <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                        <Palette className="w-12 h-12 opacity-10 mb-4" />
                        <span className="text-[10px] uppercase font-bold tracking-widest opacity-20 mb-6">Visual Stream Disrupted</span>
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => {
                               // Find the current active artwork ID if possible
                               const currentItem = history.find(h => h.image === image) || bucketList.find(b => b.image === image);
                               if (currentItem) {
                                 setOverrideTarget({ id: currentItem.id, type: history.find(h => h.image === image) ? 'history' : 'bucketlist' });
                               }
                            }}
                            className="px-6 py-2 border border-artistic-ink/20 rounded-full text-[10px] uppercase font-bold hover:bg-artistic-ink hover:text-artistic-bg transition-all"
                          >
                            Manual Verification
                          </button>
                          <a 
                            href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(details?.title + ' ' + (details?.artist || ''))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-2 border border-artistic-ink/5 rounded-full text-[10px] uppercase font-bold text-artistic-ink/40 hover:text-artistic-accent transition-all text-center"
                          >
                            Search Visual
                          </a>
                        </div>
                      </div>
                    }
                  />
                  
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-12 z-20">
                      <div className="w-full max-w-[240px] flex flex-col items-center space-y-8">
                        <div className="relative">
                          <div className="w-20 h-20 border-2 border-artistic-ink/5 rounded-full flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-artistic-accent" />
                          </div>
                          {/* Pulsing ring around loader */}
                          <motion.div 
                            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 border-2 border-artistic-accent rounded-full"
                          />
                        </div>

                        <div className="w-full space-y-4">
                          <div className="flex justify-between items-end">
                            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-artistic-ink/60">Neural Analysis</p>
                            <span className="text-[10px] font-mono font-bold text-artistic-accent">{progress}%</span>
                          </div>
                          <div className="h-[3px] w-full bg-artistic-ink/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              className="h-full bg-artistic-accent"
                            />
                          </div>
                          <div className="h-4 flex items-center justify-center">
                             <AnimatePresence mode="wait">
                               <motion.p 
                                 key={progress < 30 ? 'p1' : progress < 60 ? 'p2' : progress < 90 ? 'p3' : 'p4'}
                                 initial={{ opacity: 0, y: 5 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 exit={{ opacity: 0, y: -5 }}
                                 className="text-[9px] uppercase tracking-[0.1em] font-bold text-artistic-ink/40"
                               >
                                 {progress < 30 ? "Initializing Neural Lens..." : 
                                  progress < 60 ? "Deconstructing Elements..." : 
                                  progress < 90 ? "Cross-referencing Archives..." : 
                                  "Finalizing Identifications..."}
                               </motion.p>
                             </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                      {error && (
                        <div className="absolute inset-0 bg-red-50/90 flex flex-col items-center justify-center p-8 text-center gap-4">
                          <Info className="w-8 h-8 text-red-500" />
                          <div className="space-y-2">
                            <p className="text-red-900 font-bold text-xs">
                              {error.startsWith("API_LIMIT_REACHED") ? "Neural Credits Depleted" : "Analysis Error"}
                            </p>
                            <p className="text-red-800 text-[10px] leading-relaxed">
                              {error.startsWith("API_LIMIT_REACHED") 
                                ? "Your Google AI Studio prepayment credits have been exhausted. Please recharge your account to continue scanning." 
                                : error}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 w-full max-w-[180px]">
                            {error.startsWith("API_LIMIT_REACHED") && (
                              <a 
                                href="https://ai.studio/projects" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-6 py-2 bg-artistic-ink text-artistic-bg rounded-full text-[10px] uppercase font-bold text-center hover:bg-artistic-accent transition-colors"
                              >
                                Manage Billing
                              </a>
                            )}
                            <button 
                              onClick={reset}
                              className="px-6 py-2 border border-red-900 text-red-900 rounded-full text-[10px] uppercase font-bold hover:bg-red-900 hover:text-white transition-colors"
                            >
                              {error.startsWith("API_LIMIT_REACHED") ? "Close" : "Try Again"}
                            </button>
                          </div>
                        </div>
                      )}
                </div>

                {/* Aesthetic Accents */}
                <div className="absolute top-12 left-12 flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-red-500 shadow-sm" />
                  <div className="w-1.5 h-1.5 bg-red-500 opacity-50 shadow-sm" />
                  <div className="w-1.5 h-1.5 bg-red-500 opacity-20 shadow-sm" />
                </div>
                <div className="absolute bottom-12 right-12 text-[9px] font-mono opacity-30 tracking-widest">ART_REF: 882-QX</div>
              </motion.div>
              
              <div className="mt-16 flex justify-center space-x-12 lg:space-x-24 opacity-30 uppercase text-[9px] font-bold tracking-[0.2em]">
                <span>Neural Recognition: v4.2</span>
                <span>Depth: 32-bit</span>
                <span>Ratio: Dynamic</span>
              </div>
            </div>

            {/* Analysis Results Side (45%) */}
            <div className="w-full lg:w-[45%] flex flex-col p-10 lg:p-20 relative bg-artistic-bg overflow-y-auto">
              <div className="hidden lg:block vertical-line" />
              
              <AnimatePresence mode="wait">
                {details ? (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col h-full justify-between"
                  >
                    <div>
                      <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-8">Identified Masterpiece</span>
                      <h1 className="text-5xl lg:text-7xl font-serif leading-[1.1] mb-6 tracking-tighter" style={{ fontFamily: 'Georgia, serif' }}>
                        {details.title}
                      </h1>
                      
                      <div className="flex items-baseline space-x-4 mb-12">
                        <button 
                          onClick={() => openEntity(details.artist, 'artist')}
                          className="text-2xl font-serif italic hover:text-artistic-accent transition-colors text-left" 
                          style={{ fontFamily: 'Georgia, serif' }}
                        >
                          by {details.artist}
                        </button>
                        <span className="w-12 h-px bg-artistic-ink/20" />
                        <span className="text-lg font-light opacity-60">{details.year}</span>
                      </div>

                      <div className="space-y-8">
                        <div className="relative">
                          <p className="text-sm leading-relaxed text-artistic-ink/70 italic font-serif">
                            "{details.description}"
                          </p>
                          <div className="h-px w-12 bg-artistic-accent my-8" />
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-12">
                          <button 
                            onClick={() => openEntity(details.movement, 'movement')}
                            className="text-left group"
                          >
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Movement</span>
                            <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.movement}</span>
                          </button>
                          <div>
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Medium</span>
                            <span className="text-xs font-semibold">{details.medium}</span>
                          </div>
                          <button 
                            onClick={() => openEntity(details.type, 'type')}
                            className="text-left group"
                          >
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Type</span>
                            <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.type}</span>
                          </button>
                          {details.museum && (
                            <button 
                              onClick={() => openEntity(details.museum || '', 'museum')}
                              className="text-left group"
                            >
                              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Collection</span>
                              <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.museum}</span>
                            </button>
                          )}
                          {details.location && (
                            <button 
                              onClick={() => openEntity(details.location || '', 'location')}
                              className="col-span-2 text-left group"
                            >
                              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Location</span>
                              <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.location}</span>
                            </button>
                          )}
                        </div>

                        <div>
                          <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-4">Historical Narrative</span>
                          <p className="text-xs leading-[1.8] text-artistic-ink/80 text-justify">
                            {details.historicalContext}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-20 flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-2">Registry Reference</span>
                        <span className="text-[10px] font-bold">DIGITAL_ARCHIVE_{details.title.toUpperCase().replace(/\s/g, '_')}</span>
                      </div>
                      <button 
                        onClick={navigateBack}
                        className="w-14 h-14 rounded-full bg-artistic-ink flex items-center justify-center hover:scale-105 transition-transform shadow-lg group"
                      >
                        <ArrowRight className="w-6 h-6 text-artistic-bg group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <div key="loading-placeholder" className="h-full flex flex-col justify-center">
                    <div className="space-y-10 animate-pulse">
                      <div className="h-2 w-32 bg-artistic-ink/5" />
                      <div className="h-16 w-full bg-artistic-ink/5" />
                      <div className="h-6 w-48 bg-artistic-ink/5" />
                      <div className="space-y-4">
                        <div className="h-24 w-full bg-artistic-ink/5" />
                        <div className="h-px w-12 bg-artistic-accent/20" />
                        <div className="h-32 w-full bg-artistic-ink/5" />
                      </div>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      <ImageOverrideModal 
        isOpen={overrideTarget !== null}
        onClose={() => setOverrideTarget(null)}
        onUpdate={(url) => {
          if (overrideTarget) {
            updateArtworkImage(overrideTarget.id, url, overrideTarget.type);
            // Also update the active 'image' state if it matches the current artwork
            const item = overrideTarget.type === 'history' 
              ? history.find(h => h.id === overrideTarget.id)
              : bucketList.find(b => b.id === overrideTarget.id);
            
            if (item && image === item.image) {
              setImage(url);
            }
          }
        }}
        title={overrideTarget ? (
          overrideTarget.type === 'history' 
            ? history.find(h => h.id === overrideTarget.id)?.details.title || 'Artwork'
            : bucketList.find(b => b.id === overrideTarget.id)?.details.title || 'Artwork'
        ) : 'Artwork'}
        subtitle="Spectral Alignment Required"
      />
      <footer className="h-12 bg-artistic-ink text-artistic-bg flex items-center justify-between px-10 text-[9px] uppercase tracking-[0.2em] font-medium shrink-0">
        <div className="flex items-center gap-6">
          <span>Art Curator Engine: Neural V4.2</span>
        </div>
        <div className="hidden sm:block">© 2026 Aura Art Binnacle</div>
        <div className="flex space-x-8">
          <a href="#" className="hover:opacity-60 transition-opacity">Terms</a>
          <a href="#" className="hover:opacity-60 transition-opacity">Privacy</a>
        </div>
      </footer>
    </div>
  );
}
