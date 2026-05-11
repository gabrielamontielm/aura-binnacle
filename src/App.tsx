import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, Info, Palette, History as HistoryIcon, ArrowRight, Trash2, LayoutGrid, Clock, Share2, Network, LogIn, LogOut, User as UserIcon, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as heic2anyModule from 'heic2any';
import { identifyArtwork, identifyArtworkFromUrl, ArtDetails, EntityDetails } from './services/artService';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { EntityViewer } from './components/EntityViewer';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './services/firebase';
import { ValidatedImage } from './components/ValidatedImage';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';

// Handle potential default import differences
const heic2any = (heic2anyModule as any).default || heic2anyModule;

interface HistoryItem {
  id: string;
  image: string;
  details: ArtDetails;
  timestamp: number;
}

export default /**
 * Main Application Component for Artistic Lens.
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
  const [view, setView] = useState<'home' | 'galleries' | 'entity-viewer' | 'bucketlist'>('home');
  const [galleryMode, setGalleryMode] = useState<'grid' | 'graph'>('grid');
  const [bucketList, setBucketList] = useState<HistoryItem[]>([]);
  const [isViewOnly, setIsViewOnly] = useState(false);
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
        
        await setDoc(userDoc, {
          ...userData,
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          lastLogin: Date.now()
        }, { merge: true });
        
        fetchUserHistory(currentUser.uid);
        fetchUserBucketList(currentUser.uid);
      } else {
        // Fallback to local history if signed out
        const saved = localStorage.getItem('art_curator_history');
        if (saved) {
          try {
            setHistory(JSON.parse(saved));
          } catch (e) {
            setHistory([]);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUserHistory = async (uid: string) => {
    const path = `users/${uid}/items`;
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push(doc.data() as HistoryItem);
      });
      // Sort by timestamp descending
      setHistory(items.sort((a, b) => b.timestamp - a.timestamp));
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
        items.push(doc.data() as HistoryItem);
      });
      // Sort by timestamp descending
      setBucketList(items.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setHistory([]);
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
      
      // Create a small thumbnail for the history to save localStorage space
      const thumbnailImg = await resizeImage(`data:${mimeType};base64,${base64}`, 400, 0.6);
      
      const newItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        image: thumbnailImg,
        details: result,
        timestamp: Date.now()
      };
      
      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, 50);
        return updated;
      });

      // Persist to Firebase if logged in
      if (user) {
        const path = `users/${user.uid}/items`;
        try {
          await setDoc(doc(db, path, newItem.id), {
            ...newItem,
            userId: user.uid
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        // Save to local storage for guest
        const saved = localStorage.getItem('art_curator_history');
        const local = saved ? JSON.parse(saved) : [];
        localStorage.setItem('art_curator_history', JSON.stringify([newItem, ...local].slice(0, 50)));
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
    
    if (sharedProfileUid) {
        fetchPublicGallery(sharedProfileUid);
        fetchPublicBucketList(sharedProfileUid);
        setIsViewOnly(true);
    } else if (oldSharedGallery) {
        fetchPublicGallery(oldSharedGallery);
        setIsViewOnly(true);
    } else if (oldSharedBucketList) {
        fetchPublicBucketList(oldSharedBucketList);
        setIsViewOnly(true);
    }
  }, []);

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    
    if (user) {
      const path = `users/${user.uid}/items`;
      try {
        await deleteDoc(doc(db, path, id));
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

  const deleteBucketListItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBucketList(prev => prev.filter(item => item.id !== itemId));
    
    if (user) {
      const path = `users/${user.uid}/bucketlist`;
      try {
        await deleteDoc(doc(db, path, itemId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const fetchPublicBucketList = async (uid: string) => {
      setIsLoading(true);
      const path = `public_bucketlist/${uid}/items`;
      try {
        const q = query(collection(db, path));
        const querySnapshot = await getDocs(q);
        const items: HistoryItem[] = [];
        querySnapshot.forEach((doc) => {
          items.push(doc.data() as HistoryItem);
        });
        setBucketList(items.sort((a, b) => b.timestamp - a.timestamp));
        setView('bucketlist');
      } catch (err) {
        setError("Failed to load shared bucket list.");
      } finally {
          setIsLoading(false);
      }
  };

  const toggleBucketListPublic = async () => {
    if (!user) return;
    const nextPublic = !isBucketListPublic;
    setIsBucketListPublic(nextPublic);
    
    // Update user doc
    try {
        await setDoc(doc(db, 'users', user.uid), { isBucketListPublic: nextPublic }, { merge: true });
        
        // Sync items
        if (nextPublic) {
          // Copy all items to public_bucketlist/{uid}/items
          for (const item of bucketList) {
              const docId = item.id || (Date.now().toString() + Math.random().toString(36).substring(2));
              const docRef = doc(db, `public_bucketlist/${user.uid}/items`, docId);
              await setDoc(docRef, { ...item, id: docId, userId: user.uid });
          }
        } else {
          // Delete all items in public_bucketlist/{uid}/items
          const q = query(collection(db, `public_bucketlist/${user.uid}/items`));
          const snapshot = await getDocs(q);
          for (const docSnapshot of snapshot.docs) {
              await deleteDoc(docSnapshot.ref);
          }
        }
    } catch (err) {
        console.error("Sync failed", err);
        handleFirestoreError(err, OperationType.WRITE, `public_bucketlist/${user.uid}/items`);
        setIsBucketListPublic(!nextPublic);
        setError("Failed to update bucket list sharing settings.");
    }
  };

  const toggleGalleryPublic = async () => {
    if (!user) return;
    const nextPublic = !isGalleryPublic;
    setIsGalleryPublic(nextPublic);
    
    // Update user doc
    try {
        await setDoc(doc(db, 'users', user.uid), { isGalleryPublic: nextPublic }, { merge: true });
        
        // Sync items
        if (nextPublic) {
          // Copy all items to public_items/{uid}/items
          for (const item of history) {
              const docId = item.id || (Date.now().toString() + Math.random().toString(36).substring(2));
              const docRef = doc(db, `public_items/${user.uid}/items`, docId);
              console.log("Attempting to save item to public_items with ID:", docId, "item id:", item.id);
              await setDoc(docRef, { ...item, id: docId, userId: user.uid });
          }
        } else {
          // Delete all items in public_items/{uid}/items
          const q = query(collection(db, `public_items/${user.uid}/items`));
          const snapshot = await getDocs(q);
          for (const docSnapshot of snapshot.docs) {
              await deleteDoc(docSnapshot.ref);
          }
        }
    } catch (err) {
        console.error("Sync failed", err);
        handleFirestoreError(err, OperationType.WRITE, `public_items/${user.uid}/items`);
        setIsGalleryPublic(!nextPublic);
        setError("Failed to update sharing settings.");
    }
  };

  const fetchPublicGallery = async (uid: string) => {
      setIsLoading(true);
      const path = `public_items/${uid}/items`;
      try {
        const q = query(collection(db, path));
        const querySnapshot = await getDocs(q);
        const items: HistoryItem[] = [];
        querySnapshot.forEach((doc) => {
          items.push(doc.data() as HistoryItem);
        });
        setHistory(items.sort((a, b) => b.timestamp - a.timestamp));
        setView('galleries');
      } catch (err) {
        setError("Failed to load shared gallery.");
      } finally {
          setIsLoading(false);
      }
  };

  const loadFromHistory = async (item: HistoryItem) => {
    setImage(item.image);
    
    // Check if details look like placeholder
    if (item.details.description.startsWith('Bucket list work by') || item.details.medium === 'Unknown') {
       try {
         const newDetails = await identifyArtworkFromUrl(item.image);
         setDetails(newDetails);
         // Optionally update bucket list/history in state and db
       } catch (err) {
         console.error("Failed to fetch better details", err);
         setDetails(item.details);
       }
    } else {
        setDetails(item.details);
    }
    
    setView('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const findAndLoadFromHistoryId = (id: string) => {
    const item = history.find(i => i.id === id);
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
      {/* Navigation / Header */}
      <header className="h-20 flex justify-between items-center px-10 border-b border-artistic-ink/10 bg-artistic-bg/80 backdrop-blur-md z-50">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-artistic-ink rounded-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-artistic-bg rounded-full" />
          </div>
          <span className="uppercase tracking-[0.3em] font-bold text-[10px]">Aura v1.0</span>
        </div>
        
        <nav className="hidden md:flex space-x-12 uppercase text-[9px] tracking-[0.2em] font-bold">
          <button 
            disabled={isViewOnly}
            onClick={() => { setView('home'); reset(); }} 
            className={`${view === 'home' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Scanner
          </button>
          <button 
            onClick={() => setView('galleries')} 
            className={`${view === 'galleries' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Knowledge Base
          </button>
          <button 
            onClick={() => setView('bucketlist')} 
            className={`${view === 'bucketlist' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Bucket List
          </button>
        </nav>

        <div className="flex items-center gap-6">
          {user ? (
            <div className="flex items-center gap-4 border-l border-artistic-ink/10 pl-6">
              <div className="flex flex-col items-end">
                <span className="text-[8px] uppercase tracking-widest font-bold opacity-40">Collector</span>
                <span className="text-[9px] font-bold">{user.displayName || user.email}</span>
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
              className="flex items-center gap-3 px-4 py-2 bg-artistic-ink text-artistic-bg rounded-full text-[9px] uppercase font-bold tracking-widest hover:bg-artistic-accent transition-all"
            >
              <LogIn className="w-3 h-3" />
              <span>Sing In</span>
            </button>
          )}

          {image && (
            <button 
              onClick={reset}
              className="text-[9px] font-bold uppercase tracking-[0.2em] text-artistic-ink/40 hover:text-artistic-ink transition-colors"
            >
              Reset
            </button>
          )}
          <button 
            disabled={isViewOnly}
            onClick={() => fileInputRef.current?.click()}
            className={`px-5 py-2 border border-artistic-ink rounded-full text-[10px] uppercase font-bold tracking-tight hover:bg-artistic-ink hover:text-artistic-bg transition-all ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Capture Art
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {view === 'entity-viewer' && selectedEntity ? (
          <EntityViewer 
            details={selectedEntity} 
            relatedArtworks={
              selectedEntity.type === 'artist' 
                ? history.filter(h => h.details.artist === selectedEntity.name)
                : history.filter(h => h.details.movement === selectedEntity.name)
            }
            bucketListWorks={bucketList}
            onArtworkClick={findAndLoadFromHistoryId}
            onAddToBucketList={async (work) => {
              if (!user) {
                setError("Please sign in to save bucket list items.");
                return;
              }
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
              try {
                await setDoc(doc(db, `users/${user.uid}/bucketlist`, newItem.id), {
                    ...newItem,
                    userId: user.uid
                });
                setBucketList(prev => [newItem, ...prev].slice(0, 50));
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/bucketlist`);
              }
            }}
            onBack={() => setView('galleries')} 
          />
            ) : view === 'bucketlist' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-10 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-16">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-4">Your Curated Selections</span>
                    <h2 className="text-5xl font-serif tracking-tighter italic">Bucket List</h2>
                  </div>
                  {user && (
                    <div className="flex flex-col items-end gap-2">
                       <button 
                        onClick={toggleBucketListPublic}
                        className={`text-[9px] uppercase font-bold tracking-widest ${isBucketListPublic ? 'text-artistic-accent' : 'text-artistic-ink/40'}`}
                      >
                        {isBucketListPublic ? 'Profile sharing is ON' : 'Share Profile'}
                      </button>
                      {isBucketListPublic && (
                        <div className="flex items-center gap-2 bg-artistic-shadow/50 p-2 rounded-full mt-1">
                          <input 
                            type="text" 
                            readOnly 
                            value={`${window.location.origin}/?sharedProfile=${user.uid}`}
                            className="text-[8px] max-w-[120px] font-bold bg-transparent italic outline-none truncate"
                          />
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/?sharedProfile=${user.uid}`);
                            }}
                            className="text-artistic-accent hover:text-artistic-ink transition-colors"
                            title="Copy link"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                 </div>
              </header>

              {bucketList.length === 0 ? (
                <div className="h-[40vh] flex flex-col items-center justify-center text-center">
                  <p className="text-artistic-ink/40 text-sm italic">You haven't added anything to your bucket list.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                  <AnimatePresence>
                    {bucketList.map((item) => (
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
                          <div className="w-full h-full bg-gray-100 gallery-frame overflow-hidden relative">
                            <ValidatedImage src={item.image} alt={item.details.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                            <button 
                              onClick={(e) => deleteBucketListItem(item.id, e)}
                              className="absolute top-4 right-4 w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
          <section className="w-full h-full overflow-y-auto bg-white p-10 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-16 flex justify-between items-end">
                <div>
                  <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-4">Curated Collection</span>
                  <h2 className="text-5xl font-serif tracking-tighter italic">Your Knowledge Base</h2>
                </div>
                <div className="flex gap-8 items-center">
                  {user && (
                    <div className="flex flex-col items-end gap-2">
                      <button 
                        onClick={toggleGalleryPublic}
                        className={`text-[9px] uppercase font-bold tracking-widest ${isGalleryPublic ? 'text-artistic-accent' : 'text-artistic-ink/40'}`}
                      >
                        {isGalleryPublic ? 'Profile sharing is ON' : 'Share Profile'}
                      </button>
                      {isGalleryPublic && (
                        <div className="flex items-center gap-2 bg-artistic-shadow/50 p-2 rounded-full mt-1">
                          <input 
                            type="text" 
                            readOnly 
                            value={`${window.location.origin}/?sharedProfile=${user.uid}`}
                            className="text-[8px] max-w-[120px] font-bold bg-transparent italic outline-none truncate"
                          />
                          <button 
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/?sharedProfile=${user.uid}`);
                                // Would be nice to add feedback toast here, but for now just copy.
                            }}
                            className="text-artistic-accent hover:text-artistic-ink transition-colors"
                            title="Copy link"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex p-1 bg-artistic-shadow rounded-full border border-artistic-ink/5">
                    <button 
                      onClick={() => setGalleryMode('grid')}
                      className={`p-2 rounded-full transition-all ${galleryMode === 'grid' ? 'bg-artistic-ink text-artistic-bg' : 'text-artistic-ink hover:bg-artistic-ink/5'}`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setGalleryMode('graph')}
                      className={`p-2 rounded-full transition-all ${galleryMode === 'graph' ? 'bg-artistic-ink text-artistic-bg' : 'text-artistic-ink hover:bg-artistic-ink/5'}`}
                    >
                      <Network className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-4 items-center opacity-40 text-[9px] uppercase font-bold tracking-widest border-l border-artistic-ink/10 pl-8">
                    <span>{history.length} Masterpieces cataloged</span>
                  </div>
                </div>
              </header>

              {history.length === 0 ? (
                <div className="h-[40vh] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 border border-artistic-ink/10 rounded-full flex items-center justify-center mb-6">
                    <Clock className="w-6 h-6 opacity-20" />
                  </div>
                  <p className="text-artistic-ink/40 text-sm italic">Your archive is currently empty.<br />Start by scanning an artwork.</p>
                </div>
              ) : galleryMode === 'graph' ? (
                <div className="w-full bg-artistic-shadow/30 rounded-3xl border border-artistic-ink/5 p-4 md:p-8 flex flex-col items-center">
                  <div className="w-full h-[700px] bg-white rounded-3xl shadow-sm border border-artistic-ink/5 relative overflow-hidden">
                    <KnowledgeGraph 
                      items={history} 
                      onArtworkClick={findAndLoadFromHistoryId} 
                      onEntityClick={(details) => {
                        setSelectedEntity(details);
                        setView('entity-viewer');
                      }}
                    />
                  </div>
                  <p className="mt-8 text-[9px] uppercase tracking-[0.2em] font-bold opacity-30 flex items-center gap-3">
                    <HistoryIcon className="w-3 h-3" />
                    Interactive Spatial Knowledge Graph: Click nodes to explore relationships
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                  <AnimatePresence>
                    {history.map((item) => (
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
                          <div className="w-full h-full bg-gray-100 gallery-frame overflow-hidden relative">
                            <ValidatedImage src={item.image} alt={item.details.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                            <button 
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="absolute top-4 right-4 w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
          <section className="w-full flex flex-col items-center justify-center p-12 text-center bg-white">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="max-w-3xl"
            >
              <span className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-8">Intelligence meets Aesthetics</span>
              <h1 className="font-serif text-6xl md:text-8xl mb-12 leading-[1.0] tracking-tighter" style={{ fontFamily: 'Georgia, serif' }}>
                AURA - The <br /> <span className="italic">Art Binnacle</span>
              </h1>
              <p className="text-artistic-ink/60 max-w-lg mx-auto mb-16 text-sm leading-relaxed">
                Connect your vision to the history of human creativity. Our neural engine identifies, catalogs, and contextualizes any masterpiece in seconds.
              </p>

              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                <button
                  disabled={isViewOnly}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-16 h-16 bg-artistic-ink text-artistic-bg rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Upload className="w-6 h-6" />
                </button>
                <div onClick={() => setView('galleries')} className="cursor-pointer group flex flex-col items-center">
                   <div className="w-16 h-16 border border-artistic-ink rounded-full flex items-center justify-center group-hover:bg-artistic-ink group-hover:text-artistic-bg transition-all mb-2">
                     <HistoryIcon className="w-6 h-6" />
                   </div>
                   <span className="text-[10px] uppercase font-bold tracking-widest opacity-40">Your Knowledge Base</span>
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
            <div className="w-full lg:w-[55%] p-10 lg:p-20 flex flex-col justify-center items-center bg-white overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative aspect-[4/5] w-full max-w-[480px] bg-artistic-shadow p-8 art-shadow"
              >
                <div className="w-full h-full bg-gray-100 gallery-frame flex items-center justify-center overflow-hidden relative">
                  <img 
                    src={image} 
                    alt="Artwork Preview" 
                    className="w-full h-full object-cover"
                  />
                  
                  {isLoading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-12">
                      <div className="w-full max-w-[200px] space-y-4">
                        <div className="flex justify-between items-end">
                          <p className="text-[9px] uppercase tracking-[0.3em] font-bold opacity-40">Neural Analysis</p>
                          <span className="text-[9px] font-mono opacity-40">{progress}%</span>
                        </div>
                        <div className="h-[2px] w-full bg-black/5 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-artistic-accent"
                          />
                        </div>
                      </div>
                      <div className="mt-8 flex items-center gap-3">
                        <Loader2 className="w-3 h-3 animate-spin opacity-20" />
                        <p className="text-[10px] uppercase tracking-[0.1em] font-bold opacity-20">Transcoding Vision...</p>
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
                        <span className="text-2xl font-serif italic" style={{ fontFamily: 'Georgia, serif' }}>by {details.artist}</span>
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
                          <div>
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Movement</span>
                            <span className="text-xs font-semibold">{details.movement}</span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Medium</span>
                            <span className="text-xs font-semibold">{details.medium}</span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Type</span>
                            <span className="text-xs font-semibold">{details.type}</span>
                          </div>
                          {details.museum && (
                            <div>
                              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Collection</span>
                              <span className="text-xs font-semibold">{details.museum}</span>
                            </div>
                          )}
                          {details.location && (
                            <div className="col-span-2">
                              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-2">Location</span>
                              <span className="text-xs font-semibold">{details.location}</span>
                            </div>
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
                        onClick={reset}
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
