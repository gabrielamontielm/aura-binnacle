import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ImageOverrideModal } from './components/ImageOverrideModal';
import { ArtGalleryViewer } from './components/ArtGalleryViewer';
import { GooglePhotosPicker } from './components/GooglePhotosPicker';
import { APIProvider } from '@vis.gl/react-google-maps';
import { MuseumAutocomplete } from './components/MuseumAutocomplete';
import { Camera, Upload, Loader2, Info, Palette, History as HistoryIcon, ArrowRight, Trash2, LayoutGrid, Clock, Share2, Network, LogIn, LogOut, User as UserIcon, Check, Compass, Plus, Filter, SlidersHorizontal, ChevronDown, ChevronRight, MapPin, Menu, X, Globe, PlusCircle, Image as ImageIcon, Copy, RefreshCw, MoreVertical, Edit3, Save, Search, Sparkles, Maximize2, Star, TrendingUp, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as heic2anyModule from 'heic2any';
import { identifyArtwork, identifyArtworkFromUrl, ArtDetails, EntityDetails, getEntityDetails, sanitizeId, getRecommendations, Recommendation, identifyArtworkByText, searchArtwork, getMuseumMasterpieces, MuseumMasterpiece, MuseumMasterpiecesResult } from './services/artService';
import { MuseumMap } from './components/MuseumMap';
import { HistoryItem, UserProfile, MuseumStamp, QuizHistory } from './types';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { AchievementSystem } from './components/AchievementSystem';
import { ArtQuiz } from './components/ArtQuiz';
import { MuseumPassport } from './components/MuseumPassport';
import { EntityViewer } from './components/EntityViewer';
import { ItineraryPlanner } from './components/ItineraryPlanner';
import { CuratorInsights } from './components/CuratorInsights';
import { SkeletonGalleryGrid, SkeletonInsights } from './components/SkeletonCard';
import { MUSEUMS } from './constants';
import { auth, googleProvider, db, handleFirestoreError, OperationType, sanitizeForFirestore, hasValidConfig } from './services/firebase';
import { ValidatedImage } from './components/ValidatedImage';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';

// Handle potential default import differences
const heic2any = (heic2anyModule as any).default || heic2anyModule;

const API_KEY = 
  process.env.GOOGLE_MAPS_PLATFORM_KEY || 
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY || 
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY || 
  '';

import { useUserStats } from './hooks/useUserStats';

interface MuseumSuggestionCardProps {
  key?: React.Key | null;
  piece: MuseumMasterpiece;
  museum: string;
  isInGallery: boolean;
  isInWishlist: boolean;
  onAddToGallery: () => void;
  onAddToWishlist: () => void;
}

function MuseumSuggestionCard({ piece, isInGallery, isInWishlist, onAddToGallery, onAddToWishlist }: MuseumSuggestionCardProps): React.JSX.Element {
  const [added, setAdded] = useState<'gallery' | 'wishlist' | null>(
    isInGallery ? 'gallery' : isInWishlist ? 'wishlist' : null
  );
  const [imgFailed, setImgFailed] = useState(false);

  const handleGallery = () => { if (added) return; onAddToGallery(); setAdded('gallery'); };
  const handleWishlist = () => { if (added) return; onAddToWishlist(); setAdded('wishlist'); };

  return (
    <div className="flex gap-3 p-3 rounded-2xl bg-artistic-shadow/30 hover:bg-artistic-shadow/50 transition-colors">
      <div className="w-14 h-14 rounded-xl bg-artistic-shadow flex-shrink-0 overflow-hidden border border-artistic-ink/5">
        {piece.imageUrl && !imgFailed ? (
          <img src={piece.imageUrl} alt={piece.title} className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-artistic-ink/20 text-xl font-serif italic">{piece.title[0]}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{piece.title}</p>
        <p className="text-[11px] text-artistic-ink/50 truncate">{piece.artist} · {piece.year}</p>
        <p className="text-[10px] text-artistic-ink/40 uppercase tracking-wide mt-0.5">{piece.movement}</p>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0 justify-center">
        {added ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-artistic-accent flex items-center gap-1">
            <Check className="w-3 h-3" /> {added === 'gallery' ? 'Gallery' : 'Wishlist'}
          </span>
        ) : (
          <>
            <button onClick={handleGallery} title="Add to Gallery" className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider bg-artistic-ink text-white rounded-lg hover:bg-artistic-accent transition-colors">+ Gallery</button>
            <button onClick={handleWishlist} title="Add to Wishlist" className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-artistic-ink/20 text-artistic-ink/60 rounded-lg hover:border-artistic-accent hover:text-artistic-accent transition-colors">+ Wishlist</button>
          </>
        )}
      </div>
    </div>
  );
}

export default /**
 * Main Application Component for AURA.
 * Handles authentication, image processing, gallery management, and routing.
 */
function App() {
  // User & Profile State
  const [user, setUser] = useState<User | null>(null);
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const { userProfile, setUserProfile, museumStamps, setMuseumStamps, handleMuseumCheckIn, fetchUserPassport, addXP, updateLevelingOnScan } = useUserStats(user, initialProfile);
  
  // Artwork Discovery State
  const [image, setImage] = useState<string | null>(null);
  const [details, setDetails] = useState<ArtDetails | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isRecsLoading, setIsRecsLoading] = useState(false);
  
  // UI & Navigation State
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isBucketListLoading, setIsBucketListLoading] = useState(false);
  const [view, setView] = useState<'home' | 'galleries' | 'entity-viewer' | 'bucketlist' | 'passport' | 'achievements' | 'itinerary' | 'insights'>('home');
  const hasNavigated = useRef(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState('');
  const [isEditingMuseum, setIsEditingMuseum] = useState(false);
  const [tempMuseum, setTempMuseum] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchMode, setSearchMode] = useState<'artwork' | 'museum'>('artwork');
  const [museumResults, setMuseumResults] = useState<MuseumMasterpiecesResult | null>(null);
  const [isMuseumLoading, setIsMuseumLoading] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<{ title: string; subtitle: string; emoji: string } | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
  
  // Collection State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [bucketList, setBucketList] = useState<HistoryItem[]>([]);
  const [isGalleryPublic, setIsGalleryPublic] = useState(false);
  const [isBucketListPublic, setIsBucketListPublic] = useState(false);

  /**
   * Deduplicates gallery items to prevent identical artworks from cluttering the UI.
   */
  const deduplicateItems = (items: HistoryItem[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
      if (!item?.details?.title) return false;
      // Use Title + Artist (or Year if artist missing) as unique key
      const key = `${item.details.title.trim()}-${(item.details.artist || item.details.year || '').trim()}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  
  const [sharedGalleryOwnerName, setSharedGalleryOwnerName] = useState<string | null>(null);
  const userInterests = useMemo(() => {
    const interests = new Set<string>();
    history.forEach(item => {
      if (item.details.movement) interests.add(item.details.movement);
      if (item.details.artist) interests.add(item.details.artist);
    });
    return Array.from(interests).slice(0, 10);
  }, [history]);

  const addToBucketList = async (title: string, artist: string, museum: string, imageUrl?: string) => {
    if (!user) {
      setError("Please sign in to add masterpieces to your Bucket List.");
      return;
    }

    const newItem: HistoryItem = {
      id: `suggested-${sanitizeId(title)}-${Date.now()}`,
      image: imageUrl || "https://images.unsplash.com/photo-1544923246-77307dd654ca?q=80&w=600&auto=format&fit=crop",
      details: {
        title,
        artist,
        year: "Unknown",
        movement: "Unknown",
        medium: "Unknown",
        museum,
        type: "Masterpiece",
        description: `Suggested masterpiece from your Masterpiece Route curation. Located at ${museum}.`,
        historicalContext: "Identified as a high-value piece for your curated art journey."
      },
      timestamp: Date.now()
    };

    setBucketList(prev => [newItem, ...prev]);

    const path = `users/${user.uid}/bucketlist`;
    try {
      await setDoc(doc(db, path, newItem.id), sanitizeForFirestore({
        ...newItem,
        userId: user.uid
      }), { merge: true });
      if (isBucketListPublic) {
        await setDoc(doc(db, `public_bucketlist/${user.uid}/items`, newItem.id), sanitizeForFirestore({
          ...newItem,
          userId: user.uid
        }), { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };
  const [overrideTarget, setOverrideTarget] = useState<{ id: string, type: 'history' | 'bucketlist' } | null>(null);

  // Pending-delete queue for undo toasts
  type PendingDelete = { id: string; type: 'history' | 'bucketlist'; item: HistoryItem; timerId: ReturnType<typeof setTimeout> };
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([]);

  const commitDelete = async (pd: PendingDelete) => {
    if (pd.type === 'history') {
      if (user) {
        const path = `users/${user.uid}/items`;
        try {
          await deleteDoc(doc(db, path, pd.id));
          if (isGalleryPublic) await deleteDoc(doc(db, `public_items/${user.uid}/items`, pd.id));
        } catch (err) { handleFirestoreError(err, OperationType.DELETE, path); }
      } else {
        const saved = localStorage.getItem('art_curator_history');
        if (saved) localStorage.setItem('art_curator_history', JSON.stringify(JSON.parse(saved).filter((i: any) => i.id !== pd.id)));
      }
    } else {
      if (user) {
        const path = `users/${user.uid}/bucketlist`;
        try {
          await deleteDoc(doc(db, path, pd.id));
          if (isBucketListPublic) await deleteDoc(doc(db, `public_bucketlist/${user.uid}/items`, pd.id));
        } catch (err) { handleFirestoreError(err, OperationType.DELETE, path); }
      }
    }
  };

  const undoDelete = (id: string) => {
    setPendingDeletes(prev => {
      const pd = prev.find(p => p.id === id);
      if (!pd) return prev;
      clearTimeout(pd.timerId);
      // Restore the item to its collection
      if (pd.type === 'history') setHistory(h => [pd.item, ...h].sort((a, b) => b.timestamp - a.timestamp));
      else setBucketList(b => [pd.item, ...b].sort((a, b) => b.timestamp - a.timestamp));
      return prev.filter(p => p.id !== id);
    });
  };
  const bulkDelete = (ids: Set<string>, type: 'history' | 'bucketlist') => {
    ids.forEach(id => {
      const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
      if (type === 'history') deleteHistoryItem(id, fakeEvent);
      else deleteBucketListItem(id, fakeEvent);
    });
    setSelectedIds(new Set());
    setIsBulkMode(false);
  };

  const [isReidentifying, setIsReidentifying] = useState(false);
  const [reidentifyProgress, setReidentifyProgress] = useState(0);

  const checkMilestones = (newHistory: HistoryItem[], result: ArtDetails) => {
    const count = newHistory.length;
    const milestoneMap: Record<number, { title: string; emoji: string }> = {
      1:   { title: 'First Scan!', emoji: '🎉' },
      5:   { title: '5 Masterpieces', emoji: '🖼️' },
      10:  { title: '10 Masterpieces', emoji: '🏛️' },
      25:  { title: '25 Masterpieces', emoji: '✨' },
      50:  { title: '50 Masterpieces', emoji: '🏆' },
      100: { title: 'Centurion Curator', emoji: '👑' },
    };
    if (milestoneMap[count]) {
      setMilestone({ ...milestoneMap[count], subtitle: `You just cataloged "${result.title}"` });
      return;
    }
    // First of a movement
    const movementCount = newHistory.filter(i => i.details.movement === result.movement).length;
    if (movementCount === 1 && result.movement && result.movement !== 'Unknown') {
      setMilestone({ title: `First ${result.movement} work!`, subtitle: `"${result.title}" is a new movement in your collection`, emoji: '🎨' });
    }
  };

  const batchReidentifyPlaceholders = async () => {
    if (!user || isReidentifying) return;
    const placeholders = history.filter(
      i => i.details.description?.startsWith('Suggested masterpiece') || i.details.medium === 'Unknown'
    );
    if (placeholders.length === 0) return;
    setIsReidentifying(true);
    setReidentifyProgress(0);
    for (let i = 0; i < placeholders.length; i++) {
      const item = placeholders[i];
      try {
        const newDetails = await identifyArtworkFromUrl(item.image, item.details.title, item.details.artist);
        const updated = { ...item, details: newDetails };
        setHistory(prev => prev.map(h => h.id === item.id ? updated : h));
        await setDoc(doc(db, `users/${user.uid}/items`, item.id), sanitizeForFirestore({ details: newDetails }), { merge: true });
      } catch (e) { /* skip failures silently */ }
      setReidentifyProgress(Math.round(((i + 1) / placeholders.length) * 100));
    }
    setIsReidentifying(false);
  };

  const bulkMoveToBucketList = async (ids: Set<string>) => {
    if (!user) return;
    const items = history.filter(i => ids.has(i.id));
    setHistory(prev => prev.filter(i => !ids.has(i.id)));
    setBucketList(prev => [...items, ...prev]);
    const batch = writeBatch(db);
    items.forEach(item => {
      batch.delete(doc(db, `users/${user.uid}/items`, item.id));
      batch.set(doc(db, `users/${user.uid}/bucketlist`, item.id), sanitizeForFirestore({ ...item, userId: user.uid }));
    });
    await batch.commit();
    setSelectedIds(new Set());
    setIsBulkMode(false);
  };

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
        await setDoc(doc(db, path, id), sanitizeForFirestore(updateData), { merge: true });
        
        if (isGalleryPublic) {
          await setDoc(doc(db, `public_items/${user.uid}/items`, id), sanitizeForFirestore(updateData), { merge: true });
        }
      } else {
        const path = `users/${user.uid}/bucketlist`;
        setBucketList(prev => prev.map(item => item.id === id ? { ...item, image: imageUrl, details: updatedDetails || item.details } : item));
        await setDoc(doc(db, path, id), sanitizeForFirestore(updateData), { merge: true });
        
        if (isBucketListPublic) {
          await setDoc(doc(db, `public_bucketlist/${user.uid}/items`, id), sanitizeForFirestore(updateData), { merge: true });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, type === 'history' ? `users/${user.uid}/items/${id}` : `users/${user.uid}/bucketlist/${id}`);
    }
  };

  useEffect(() => {
    if (details && view === 'home') {
      const fetchRecs = async () => {
        setIsRecsLoading(true);
        try {
          const recs = await getRecommendations(details);
          setRecommendations(recs);
        } catch (err) {
          console.error("Failed to load recommendations:", err);
          setRecommendations([]);
        } finally {
          setIsRecsLoading(false);
        }
      };
      fetchRecs();
    } else {
      setRecommendations([]);
    }
  }, [details, view]);

  const handleRecommendationClick = async (rec: Recommendation) => {
    setIsLoading(true);
    setProgress(20);
    setError(null);
    setDetails(null);
    setImage(null);
    setRecommendations([]);

    try {
      // Check if it's already in our "database" (history or bucketList)
      const existingItem = history.find(h => 
        h.details.title.toLowerCase() === rec.title.toLowerCase() && 
        h.details.artist.toLowerCase() === rec.artist.toLowerCase()
      ) || bucketList.find(b => 
        b.details.title.toLowerCase() === rec.title.toLowerCase() && 
        b.details.artist.toLowerCase() === rec.artist.toLowerCase()
      );

      if (existingItem) {
        setDetails(existingItem.details);
        setImage(existingItem.image);
        setProgress(100);
        setView('home');
        setIsLoading(false);
        return;
      }

      // If we have an image URL, use it
      if (rec.imageUrl) {
        setImage(rec.imageUrl);
        setProgress(50);
        const result = await identifyArtworkFromUrl(rec.imageUrl, rec.title, rec.artist);
        setDetails(result);
        setProgress(100);
      } else {
        // Fallback to text identification based on title/artist
        const result = await identifyArtworkByText(rec.title, rec.artist);
        setDetails(result);
        setImage((result as any).imageUrl || null);
        setProgress(100);
      }
      setView('home');
    } catch (err) {
      console.error(err);
      setError("I had trouble summoning details for this recommendation.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshDetails = async () => {
    if (!details) return;
    
    setIsLoading(true);
    setProgress(30);
    setError(null);

    try {
      const refreshedDetails = await identifyArtworkByText(details.title, details.artist);
      setDetails(refreshedDetails);
      setProgress(100);
      
      // Also refresh recommendations since details changed
      setIsRecsLoading(true);
      const recs = await getRecommendations(refreshedDetails);
      setRecommendations(recs);
      setIsRecsLoading(false);
    } catch (err) {
      console.error(err);
      setError("I failed to refresh the masterpiece data.");
    } finally {
      setIsLoading(false);
    }
  };


  const handleSaveLocation = async () => {
    if (details) {
      const updatedDetails = { ...details, location: tempLocation };
      setDetails(updatedDetails);
      
      const itemToUpdate = history.find(h => h.details.title === details.title && h.details.artist === details.artist);
      if (itemToUpdate) {
        setHistory(prev => prev.map(h => h.id === itemToUpdate.id ? { ...h, details: updatedDetails } : h));
        if (user) {
          try {
            const path = `users/${user.uid}/items`;
            await setDoc(doc(db, path, itemToUpdate.id), sanitizeForFirestore({ details: updatedDetails }), { merge: true });
            
            // Sync to public gallery if sharing is ON
            if (isGalleryPublic) {
              await setDoc(doc(db, `public_items/${user.uid}/items`, itemToUpdate.id), sanitizeForFirestore({ details: updatedDetails }), { merge: true });
            }
          } catch (e) {
            console.error("Failed to update location in database", e);
          }
        }
      }
    }
    setIsEditingLocation(false);
  };

  const handleSaveMuseum = async () => {
    if (details) {
      const updatedDetails = { ...details, museum: tempMuseum };
      setDetails(updatedDetails);
      
      const itemToUpdate = history.find(h => h.details.title === details.title && h.details.artist === details.artist);
      if (itemToUpdate) {
        setHistory(prev => prev.map(h => h.id === itemToUpdate.id ? { ...h, details: updatedDetails } : h));
        if (user) {
          try {
            const path = `users/${user.uid}/items`;
            await setDoc(doc(db, path, itemToUpdate.id), sanitizeForFirestore({ details: updatedDetails }), { merge: true });
            
            // Sync to public gallery if sharing is ON
            if (isGalleryPublic) {
              await setDoc(doc(db, `public_items/${user.uid}/items`, itemToUpdate.id), sanitizeForFirestore({ details: updatedDetails }), { merge: true });
            }
          } catch (e) {
            console.error("Failed to update museum in database", e);
          }
        }
      }
    }
    setIsEditingMuseum(false);
  };

  const handleAddToGallery = async () => {
    if (!details || !image) return;
    
    const isDuplicate = history.some(item => 
      item.details.title === details.title && 
      (item.details.artist === details.artist)
    );

    if (isDuplicate) {
      setError("This masterpiece is already illuminating your gallery.");
      return;
    }

    const newItem: HistoryItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      image: image,
      details: details,
      timestamp: Date.now()
    };

    setHistory(prev => [newItem, ...prev].slice(0, 50));
    
    if (user) {
      const path = `users/${user.uid}/items`;
      try {
        await setDoc(doc(db, path, newItem.id), sanitizeForFirestore({ ...newItem, userId: user.uid }), { merge: true });
        
        // Sync to public gallery if sharing is ON
        if (isGalleryPublic) {
          await setDoc(doc(db, `public_items/${user.uid}/items`, newItem.id), sanitizeForFirestore({ ...newItem, userId: user.uid }), { merge: true });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const [navStack, setNavStack] = useState<{ view: typeof view, entity: EntityDetails | null, details: ArtDetails | null }[]>([]);

  const navigateTo = (newView: typeof view, entity: EntityDetails | null = null) => {
    hasNavigated.current = true;
    setNavStack(prev => [...prev, { view, entity: selectedEntity, details }]);
    if (newView !== 'home') {
      setDetails(null);
    }
    setView(newView);
    setSelectedEntity(entity);

    // Persist entity for refresh via sessionStorage (survives F5, not new tabs)
    if (newView === 'entity-viewer' && entity) {
      sessionStorage.setItem('aura_entity', JSON.stringify({ name: entity.name, type: entity.type }));
    } else {
      sessionStorage.removeItem('aura_entity');
    }
  };

  const navigateBack = () => {
    if (navStack.length === 0) {
      setView('home');
      setSelectedEntity(null);
      setDetails(null);
      sessionStorage.removeItem('aura_entity');
      return;
    }
    const previous = navStack[navStack.length - 1];
    setNavStack(prev => prev.slice(0, -1));
    setView(previous.view);
    setSelectedEntity(previous.entity);
    if (previous.view === 'entity-viewer' && previous.entity) {
      sessionStorage.setItem('aura_entity', JSON.stringify({ name: previous.entity.name, type: previous.entity.type }));
    } else {
      sessionStorage.removeItem('aura_entity');
    }
    setDetails(previous.details || null);
  };
  const [galleryMode, setGalleryMode] = useState<'grid' | 'graph' | 'map'>('grid');
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
              <label className="text-[11px] uppercase tracking-widest font-bold opacity-40 block">Filter by Medium</label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                {allMediums.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleFilter(setMediumFilters, m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${mediumFilters.includes(m) ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink/30'}`}
                  >
                    {m}
                  </button>
                ))}
                {allMediums.length === 0 && <span className="text-xs italic opacity-30">No mediums found</span>}
              </div>
            </div>

            {/* Museum Filter */}
            <div className="space-y-4">
              <label className="text-[11px] uppercase tracking-widest font-bold opacity-40 block">Filter by Museum</label>
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                {allMuseums.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleFilter(setMuseumFilters, m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${museumFilters.includes(m) ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink/30'}`}
                  >
                    {m}
                  </button>
                ))}
                {allMuseums.length === 0 && <span className="text-xs italic opacity-30">No museums found</span>}
              </div>
            </div>

            {/* Year Range Filter */}
            <div className="space-y-4">
              <div className="flex justify-between">
                <label className="text-[11px] uppercase tracking-widest font-bold opacity-40 block">Year Range</label>
                <span className="text-[11px] font-mono opacity-60">
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
                className="text-[11px] uppercase font-bold tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex items-center gap-2"
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

  // Restore entity viewer on refresh via sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('aura_entity');
    if (!saved) return;
    try {
      const { name, type } = JSON.parse(saved) as { name: string; type: EntityDetails['type'] };
      if (!name || !type) return;
      getEntityDetails(name, type)
        .then(entity => {
          if (!hasNavigated.current) {
            setView('entity-viewer');
            setSelectedEntity(entity);
          }
        })
        .catch(err => console.warn('Could not restore entity view:', err));
    } catch {
      sessionStorage.removeItem('aura_entity');
    }
  }, []);

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isHeaderCaptureMenuOpen, setIsHeaderCaptureMenuOpen] = useState(false);
  const [isHeroCaptureMenuOpen, setIsHeroCaptureMenuOpen] = useState(false);
  const [isUrlCaptureOpen, setIsUrlCaptureOpen] = useState(false);
  const [isGalleryViewerOpen, setIsGalleryViewerOpen] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<{ id: string, type: 'history' | 'bucketlist' } | null>(null);
  const [isGooglePhotosOpen, setIsGooglePhotosOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [captureUrl, setCaptureUrl] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Log basic profile
        const userDoc = doc(db, 'users', currentUser.uid);
        const userSnapshot = await getDoc(userDoc);
        const baseDefaults = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          lastLogin: Date.now(),
          isGalleryPublic: false,
          isBucketListPublic: false,
          level: 1,
          totalXP: 0,
          scansByMovement: {},
          badges: [],
          streak: 0,
          lastScanDate: null as string | null,
        };

        let userData = userSnapshot.exists() 
          ? { ...baseDefaults, ...userSnapshot.data() } 
          : baseDefaults;
        
        setUserProfile(userData as UserProfile);
        setInitialProfile(userData as UserProfile);
        setIsGalleryPublic(userData.isGalleryPublic || false);
        setIsBucketListPublic(userData.isBucketListPublic || false);
        
        await setDoc(doc(db, 'public_profiles', currentUser.uid), {
          uid: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          photoURL: currentUser.photoURL,
          email: currentUser.email,
          level: userData.level || 1,
          totalXP: userData.totalXP || 0,
          badges: userData.badges || [],
          isGalleryPublic: userData.isGalleryPublic || false,
          isBucketListPublic: userData.isBucketListPublic || false
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
      fetchUserPassport(user.uid);
    }
  }, [user, isViewOnly]);

  const fetchUserHistory = async (uid: string) => {
    const path = `users/${uid}/items`;
    setIsGalleryLoading(true);
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
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setIsGalleryLoading(false);
    }
  };

  const fetchUserBucketList = async (uid: string) => {
    const path = `users/${uid}/bucketlist`;
    setIsBucketListLoading(true);
    try {
      const q = query(collection(db, path));
      const querySnapshot = await getDocs(q);
      const items: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      const sorted = items.sort((a, b) => b.timestamp - a.timestamp);
      setBucketList(deduplicateItems(sorted));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setIsBucketListLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!hasValidConfig) {
      setError("Firebase is not fully configured. Please use the platform tools to set up Firebase (Database + Auth).");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return; // User closed the popup, not a real error
      }
      console.error("Login failed", err);
      if (err?.code === 'auth/auth-domain-config-required') {
        setError("Firebase Auth configuration is missing 'authDomain'. Check your configuration.");
      } else {
        setError(`Login failed: ${err.message || 'Please try again.'}`);
      }
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
        if (!ctx) { resolve(base64Str); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str); // Fallback to original
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setView('home');
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
      setView('home');
      updateLevelingOnScan(result, history.length);
      
      // Duplicate Check: Stop if already in history
      const isDuplicate = history.some(item => 
        item.details.title === result.title && 
        item.details.artist === result.artist
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
      
      const nextHistory = [newItem, ...history].slice(0, 50);
      setHistory(nextHistory);
      checkMilestones(nextHistory, result);

      // Persist to Firebase if logged in
      if (user) {
        const path = `users/${user.uid}/items`;
        try {
          await setDoc(doc(db, path, newItem.id), sanitizeForFirestore({
            ...newItem,
            userId: user.uid
          }), { merge: true });

          // Also update public gallery if sharing is ON
          if (isGalleryPublic) {
            const publicPath = `public_items/${user.uid}/items`;
            await setDoc(doc(db, publicPath, newItem.id), sanitizeForFirestore({
              ...newItem,
              userId: user.uid
            }), { merge: true });
          }

          // Update streak
          const today = new Date().toDateString();
          const lastScanDate = userProfile?.lastScanDate;
          const yesterday = new Date(Date.now() - 86400000).toDateString();
          const newStreak = lastScanDate === today
            ? (userProfile?.streak ?? 0)
            : lastScanDate === yesterday
              ? (userProfile?.streak ?? 0) + 1
              : 1;
          if (newStreak !== (userProfile?.streak ?? 0) || lastScanDate !== today) {
            await updateDoc(doc(db, 'users', user.uid), sanitizeForFirestore({ streak: newStreak, lastScanDate: today }));
            setUserProfile(prev => prev ? { ...prev, streak: newStreak, lastScanDate: today } : prev);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        // Save to local storage for guest
        const saved = localStorage.getItem('art_curator_history');
        const local = saved ? JSON.parse(saved) : [];
        // Secondary safety check for local storage
        if (!local.some((item: HistoryItem) => item.details.title === newItem.details.title && item.details.artist === newItem.details.artist)) {
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

  const handleUpdateGalleryImages = async (newImages: string[]) => {
    if (!galleryTarget) return;
    const { id, type } = galleryTarget;
    
    if (type === 'history') {
      setHistory(prev => prev.map(item => item.id === id ? { ...item, additionalImages: newImages } : item));
    } else {
      setBucketList(prev => prev.map(item => item.id === id ? { ...item, additionalImages: newImages } : item));
    }

    if (user) {
      const path = type === 'history' ? `users/${user.uid}/items` : `users/${user.uid}/bucketlist`;
      const publicPath = type === 'history' ? `public_items/${user.uid}/items` : `public_bucketlist/${user.uid}/items`;
      const isPublic = type === 'history' ? isGalleryPublic : isBucketListPublic;

      try {
        await updateDoc(doc(db, path, id), { additionalImages: newImages });
        if (isPublic) {
          await updateDoc(doc(db, publicPath, id), { additionalImages: newImages });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    } else {
      // Local storage for guests
      const key = type === 'history' ? 'art_curator_history' : 'art_curator_bucketlist';
      const saved = localStorage.getItem(key);
      if (saved) {
        const local = JSON.parse(saved);
        const updated = local.map((item: any) => item.id === id ? { ...item, additionalImages: newImages } : item);
        localStorage.setItem(key, JSON.stringify(updated));
      }
    }
  };

  const handleUrlCapture = async (url: string) => {
    if (!url.trim()) return;
    if (!user) {
      handleLogin();
      return;
    }
    setView('home');
    setIsLoading(true);
    setProgress(20);
    setError(null);
    setDetails(null);
    setImage(null);
    setIsUrlCaptureOpen(false);

    try {
      setProgress(50);
      const result = await identifyArtworkFromUrl(url);
      setImage(url);
      setProgress(100);
      setDetails(result);
      updateLevelingOnScan(result, history.length);
      
      const isDuplicate = history.some(item => 
        item.details.title === result.title && 
        item.details.artist === result.artist
      );

      if (isDuplicate) {
        setIsLoading(false);
        return;
      }

      const newItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        image: url,
        details: result,
        timestamp: Date.now()
      };

      setHistory(prev => [newItem, ...prev].slice(0, 50));

      if (user) {
        const path = `users/${user.uid}/items`;
        await setDoc(doc(db, path, newItem.id), sanitizeForFirestore({
          ...newItem,
          userId: user.uid
        }), { merge: true });
        if (isGalleryPublic) {
          await setDoc(doc(db, `public_items/${user.uid}/items`, newItem.id), sanitizeForFirestore({
            ...newItem,
            userId: user.uid
          }), { merge: true });
        }
      } else {
        const saved = localStorage.getItem('art_curator_history');
        const local = saved ? JSON.parse(saved) : [];
        localStorage.setItem('art_curator_history', JSON.stringify([newItem, ...local].slice(0, 50)));
      }
    } catch (err) {
      console.error(err);
      setError("I couldn't identify this artwork URL. Please ensure it's a direct link to an image.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchUnified = async (force = false) => {
    if (searchMode === 'museum') {
      if (!searchQuery.trim()) return;
      setMuseumResults(null);
      setIsMuseumLoading(true);
      setError(null);
      try {
        const result = await getMuseumMasterpieces(searchQuery.trim(), force);
        setMuseumResults(result);
      } catch {
        setError("Couldn't load masterpieces for that museum. Try a different name.");
      } finally {
        setIsMuseumLoading(false);
      }
    } else {
      await handleSearchMasterpiece();
    }
  };

  const handleSearchMasterpiece = async () => {
    if (!searchQuery.trim()) return;
    if (!user) {
      handleLogin();
      return;
    }
    setIsLoading(true);
    setProgress(20);
    setError(null);
    setDetails(null);
    setImage(null);

    try {
      // Check if it's already in our "database" (history or bucketList)
      const existingItem = history.find(h => 
        h.details.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        searchQuery.toLowerCase().includes(h.details.title.toLowerCase())
      ) || bucketList.find(b => 
        b.details.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        searchQuery.toLowerCase().includes(b.details.title.toLowerCase())
      );

      if (existingItem) {
        setDetails(existingItem.details);
        setImage(existingItem.image);
        setProgress(100);
        setView('home');
        setIsSearchVisible(false);
        setSearchQuery('');
        setIsLoading(false);
        return;
      }

      setProgress(40);
      const result = await searchArtwork(searchQuery);
      setProgress(70);
      
      // Try to find an image automatically or use a descriptive placeholder
      // For now, let's search for an image using the Search functionality we have
      setDetails(result);
      setImage((result as any).imageUrl || null);
      setView('home');
      updateLevelingOnScan(result, history.length);
      
      // Duplicate Check
      const isDuplicate = history.some(item => 
        item.details.title === result.title && 
        item.details.artist === result.artist
      );

      if (isDuplicate) {
        setIsSearchVisible(false);
        setSearchQuery('');
        setIsLoading(false);
        return;
      }

      // Use imageUrl from result if provided, otherwise empty
      const newItem: HistoryItem = {
        id: `search-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        image: (result as any).imageUrl || "", 
        details: result,
        timestamp: Date.now()
      };

      setHistory(prev => [newItem, ...prev].slice(0, 50));

      if (user) {
        const path = `users/${user.uid}/items`;
        try {
          await setDoc(doc(db, path, newItem.id), sanitizeForFirestore({ ...newItem, userId: user.uid }), { merge: true });
          
          // Sync to public gallery if sharing is ON
          if (isGalleryPublic) {
            await setDoc(doc(db, `public_items/${user.uid}/items`, newItem.id), sanitizeForFirestore({ ...newItem, userId: user.uid }), { merge: true });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
      
      setIsSearchVisible(false);
      setSearchQuery('');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError("The neural engine couldn't find a masterpiece matching your query.");
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
                    const userData = userDoc.data() as UserProfile;
                    const name = userData.displayName || userData.email?.split('@')[0] || 'User';
                    setSharedGalleryOwnerName(name);
                    
                    // Set the user stats for display (view only mode)
                    setUserProfile(userData);
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
                  fetchPublicBucketList(sharedProfileUid, false),
                  fetchPublicPassport(sharedProfileUid, false)
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

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = history.find(i => i.id === id);
    if (!item) return;
    setHistory(prev => prev.filter(i => i.id !== id));
    const timerId = setTimeout(() => {
      commitDelete({ id, type: 'history', item, timerId });
      setPendingDeletes(prev => prev.filter(p => p.id !== id));
    }, 5000);
    setPendingDeletes(prev => [...prev, { id, type: 'history', item, timerId }]);
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
  
  const deleteBucketListItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = bucketList.find(i => i.id === itemId);
    if (!item) return;
    setBucketList(prev => prev.filter(i => i.id !== itemId));
    const timerId = setTimeout(() => {
      commitDelete({ id: itemId, type: 'bucketlist', item, timerId });
      setPendingDeletes(prev => prev.filter(p => p.id !== itemId));
    }, 5000);
    setPendingDeletes(prev => [...prev, { id: itemId, type: 'bucketlist', item, timerId }]);
  };

  const moveBucketToGallery = async (item: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isViewOnly) return;

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
          setDoc(doc(db, historyPath, item.id), sanitizeForFirestore({ ...newItem, userId: user.uid }))
        ]);

        if (isBucketListPublic) {
          await deleteDoc(doc(db, `public_bucketlist/${user.uid}/items`, item.id));
        }
        if (isGalleryPublic) {
          await setDoc(doc(db, `public_items/${user.uid}/items`, item.id), sanitizeForFirestore({ ...newItem, userId: user.uid }));
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
      if (autoLoading) setIsBucketListLoading(true);
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
        if (autoLoading) setIsBucketListLoading(false);
      }
  };

  const isSharingRef = useRef(false);

  const handleShare = async (url: string) => {
    if (isSharingRef.current) return;
    isSharingRef.current = true;

    const copyToClipboard = async (text: string) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        throw new Error("Clipboard API unavailable");
      } catch (err) {
        // Fallback for non-secure contexts or when focus is an issue
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          // Ensure it's not visible but part of the DOM
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "0";
          textArea.setAttribute('readonly', ''); // Prevent keyboard on mobile
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          textArea.setSelectionRange(0, 99999); // For mobile devices
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          return successful;
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);
          return false;
        }
      }
    };

    try {
      const success = await copyToClipboard(url);
      if (success) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } else {
        throw new Error("Copy failed");
      }
      
      // Still try to use native share if available as secondary option
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'AURA - Art Binnacle',
            text: 'Check out my curated art collection on AURA!',
            url: url,
          });
        } catch (err) {
          if ((err as Error).name !== 'AbortError' && !(err instanceof Error && err.message.includes('share has not yet completed'))) {
            console.error('Error sharing:', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      setError("Failed to copy link to clipboard.");
    } finally {
      isSharingRef.current = false;
    }
  };

  const toggleProfilePublic = async () => {
    if (!user) return;
    setIsLoading(true);
    const nextPublic = !(isGalleryPublic || isBucketListPublic);

    try {
        // Phase 1: write profile flags atomically before touching public collections
        await Promise.all([
          setDoc(doc(db, 'users', user.uid), sanitizeForFirestore({
            isGalleryPublic: nextPublic,
            isBucketListPublic: nextPublic
          }), { merge: true }),
          setDoc(doc(db, 'public_profiles', user.uid), sanitizeForFirestore({
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            photoURL: user.photoURL,
            email: user.email,
            level: userProfile?.level || 1,
            totalXP: userProfile?.totalXP || 0,
            badges: userProfile?.badges || [],
            isGalleryPublic: nextPublic,
            isBucketListPublic: nextPublic
          }), { merge: true })
        ]);

        // Phase 2: sync public collections using batched writes (max 500 ops per batch)
        const BATCH_SIZE = 490;

        const syncWrite = async (items: { id: string; [k: string]: any }[], collPath: string) => {
          for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            items.slice(i, i + BATCH_SIZE).forEach(item => {
              batch.set(doc(db, collPath, item.id), sanitizeForFirestore({ ...item, userId: user.uid }), { merge: true });
            });
            await batch.commit();
          }
        };

        const syncDelete = async (collPath: string) => {
          const snapshot = await getDocs(query(collection(db, collPath)));
          for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            snapshot.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        };

        if (nextPublic) {
          await syncWrite(history, `public_items/${user.uid}/items`);
          await syncWrite(bucketList, `public_bucketlist/${user.uid}/items`);
          await syncWrite(museumStamps, `public_passports/${user.uid}/stamps`);
        } else {
          await syncDelete(`public_items/${user.uid}/items`);
          await syncDelete(`public_bucketlist/${user.uid}/items`);
          await syncDelete(`public_passports/${user.uid}/stamps`);
        }

        // Only update local state after all writes succeed
        setIsGalleryPublic(nextPublic);
        setIsBucketListPublic(nextPublic);
    } catch (err) {
        console.error("Profile sync failed", err);
        setError("Failed to update profile sharing settings.");
    } finally {
        setIsLoading(false);
    }
  };

  const fetchPublicPassport = async (uid: string, autoLoading = true) => {
      if (autoLoading) setIsLoading(true);
      const path = `public_passports/${uid}/stamps`;
      try {
        const q = query(collection(db, path));
        const querySnapshot = await getDocs(q);
        const stamps: MuseumStamp[] = [];
        querySnapshot.forEach((doc) => {
          stamps.push({ id: doc.id, ...doc.data() } as MuseumStamp);
        });
        setMuseumStamps(stamps);
      } catch (err) {
        console.error("Failed to load shared passport:", err);
      } finally {
        if (autoLoading) setIsLoading(false);
      }
  };

  const fetchPublicGallery = async (uid: string, autoLoading = true) => {
      if (autoLoading) setIsGalleryLoading(true);
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
        if (autoLoading) setIsGalleryLoading(false);
      }
  };

  const loadFromHistory = async (item: HistoryItem) => {
    setImage(item.image);
    
    // Check if details look like placeholder
    if (item.details.description.startsWith('Suggested masterpiece from your Masterpiece Route') || item.details.medium === 'Unknown') {
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
    const yearMatch = item.details.year?.match(/-?\d+/);
    if (yearMatch) {
      const y = parseInt(yearMatch[0]);
      if (y < yearMin || y > yearMax) return false;
    }
    if (gallerySearch.trim()) {
      const q = gallerySearch.toLowerCase();
      const { title, artist, year, movement, museum } = item.details;
      if (![title, artist, year, movement, museum].some(f => f?.toLowerCase().includes(q))) return false;
    }
    return true;
  };

  const filteredHistory = useMemo(() => history.filter(filterItem), [history, mediumFilters, museumFilters, yearMin, yearMax, gallerySearch]);
  const filteredBucketList = useMemo(() => bucketList.filter(filterItem), [bucketList, mediumFilters, museumFilters, yearMin, yearMax, gallerySearch]);

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
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className="min-h-screen border-8 border-white box-border flex flex-col">
      {/* Shared Profile Banner */}
      {isViewOnly && sharedGalleryOwnerName && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-artistic-ink text-artistic-bg py-3 px-10 text-[11px] uppercase font-bold tracking-[0.3em] flex items-center justify-between z-[60]"
        >
          <div className="flex items-center gap-4">
            <span className="w-2 h-2 bg-artistic-accent rounded-full animate-pulse" />
            <span>Viewing {sharedGalleryOwnerName}'s Curated Heritage Binnacle</span>
            <button
              onClick={() => handleShare(window.location.href)}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full transition-all ml-4"
            >
              {isCopied ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
              <span>{isCopied ? 'Copied' : 'Share Link'}</span>
            </button>
            {user && (
              <button
                onClick={() => setShowComparison(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-artistic-accent/80 hover:bg-artistic-accent rounded-full transition-all"
              >
                <TrendingUp className="w-3 h-3" />
                <span>Compare</span>
              </button>
            )}
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

      {/* Global Search Overlay */}
      <AnimatePresence>
        {isSearchVisible && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 md:px-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsSearchVisible(false); setMuseumResults(null); }}
              className="fixed inset-0 bg-artistic-ink/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl p-4 md:p-6 relative z-10 border border-artistic-ink/5"
            >
              <div className="flex flex-col gap-5">
                <div className="flex justify-between items-center px-4">
                  <div>
                    <span className="uppercase text-[11px] tracking-[0.3em] font-bold text-artistic-accent block mb-1">Neural Search</span>
                    <h3 className="font-serif italic text-2xl">
                      {searchMode === 'museum' ? 'Explore Museum' : 'Summon Masterpiece'}
                    </h3>
                  </div>
                  <button
                    onClick={() => { setIsSearchVisible(false); setMuseumResults(null); }}
                    className="p-2 hover:bg-artistic-shadow rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 opacity-40" />
                  </button>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 px-4">
                  <button
                    onClick={() => { setSearchMode('artwork'); setMuseumResults(null); setSearchQuery(''); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] uppercase font-bold tracking-widest transition-all ${searchMode === 'artwork' ? 'bg-artistic-ink text-artistic-bg' : 'bg-artistic-shadow/40 text-artistic-ink/50 hover:text-artistic-ink'}`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Artwork
                  </button>
                  <button
                    onClick={() => { setSearchMode('museum'); setMuseumResults(null); setSearchQuery(''); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-[11px] uppercase font-bold tracking-widest transition-all ${searchMode === 'museum' ? 'bg-artistic-ink text-artistic-bg' : 'bg-artistic-shadow/40 text-artistic-ink/50 hover:text-artistic-ink'}`}
                  >
                    <MapPin className="w-3 h-3" />
                    Museum
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-artistic-shadow/20 border border-artistic-ink/5 rounded-2xl p-2 pl-6 focus-within:border-artistic-accent/40 focus-within:bg-white transition-all shadow-sm">
                  <Search className="w-4 h-4 opacity-20" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchMode === 'museum' ? 'Enter museum name, e.g. The Louvre…' : 'Enter title, artist, or description…'}
                    className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-artistic-ink placeholder:text-artistic-ink/20 py-3"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchUnified()}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSearchUnified()}
                    disabled={!searchQuery.trim() || isLoading}
                    className="bg-artistic-ink text-artistic-bg px-6 py-3 rounded-xl text-[11px] uppercase font-bold tracking-widest hover:bg-artistic-accent transition-all disabled:opacity-20 flex items-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>{isLoading ? 'Loading…' : 'Search'}</span>
                  </button>
                </div>

                {!user && (
                  <div className="px-4 py-3 bg-artistic-accent/10 rounded-2xl flex items-center gap-3">
                    <LogIn className="w-4 h-4 text-artistic-accent flex-shrink-0" />
                    <p className="text-xs text-artistic-accent font-bold">
                      Sign in to search and catalog masterpieces.{' '}
                      <button onClick={handleLogin} className="underline hover:no-underline">Sign in now</button>
                    </p>
                  </div>
                )}

                {error && (
                  <div className="px-4 py-3 bg-red-50 rounded-2xl flex items-center gap-3">
                    <Info className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700 font-bold">{error}</p>
                  </div>
                )}

                {!isMuseumLoading && !museumResults && (
                  <div className="px-4">
                    <p className="text-xs text-artistic-ink/40 leading-relaxed italic">
                      {searchMode === 'museum'
                        ? "Enter a museum name and we'll suggest its most iconic masterpieces to add to your collection."
                        : "The curator's engine will research and identify the masterpiece. You can assign a visual once it's cataloged in your gallery."}
                    </p>
                  </div>
                )}

                {isMuseumLoading && (
                  <div className="flex items-center justify-center py-10 gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-artistic-accent" />
                    <span className="text-sm text-artistic-ink/40 italic">Consulting the collection…</span>
                  </div>
                )}

                {museumResults && (
                  <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto px-1">
                    <div className="flex items-center justify-between px-3">
                      <p className="text-[11px] uppercase tracking-widest font-bold text-artistic-ink/40">
                        {museumResults.masterpieces.length} highlights · {museumResults.museum}{museumResults.city ? `, ${museumResults.city}` : ''}
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSearchUnified(true)}
                          title="Refresh masterpieces"
                          className="flex items-center gap-1 text-[11px] text-artistic-ink/30 hover:text-artistic-accent transition-colors font-bold uppercase tracking-wider"
                        >
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                        <button onClick={() => { setMuseumResults(null); setSearchQuery(''); }} className="text-[11px] text-artistic-ink/30 hover:text-artistic-ink transition-colors underline">Clear</button>
                      </div>
                    </div>
                    {museumResults.masterpieces.map((piece, i) => (
                      <MuseumSuggestionCard
                        key={i}
                        piece={piece}
                        museum={museumResults.museum}
                        isInGallery={history.some(h => h.details.title === piece.title)}
                        isInWishlist={bucketList.some(b => b.details.title === piece.title)}
                        onAddToGallery={() => {
                          const item: HistoryItem = {
                            id: `museum-${Date.now()}-${i}`,
                            image: piece.imageUrl || '',
                            details: { title: piece.title, artist: piece.artist, year: piece.year, movement: piece.movement, medium: piece.medium, museum: museumResults.museum, description: piece.description, type: 'Painting', location: museumResults.city || '', historicalContext: '' },
                            timestamp: Date.now(),
                          };
                          setHistory(prev => [item, ...prev].slice(0, 50));
                          if (user) setDoc(doc(db, `users/${user.uid}/items`, item.id), sanitizeForFirestore({ ...item, userId: user.uid }), { merge: true }).catch(() => {});
                        }}
                        onAddToWishlist={() => {
                          const item: HistoryItem = {
                            id: `museum-wish-${Date.now()}-${i}`,
                            image: piece.imageUrl || '',
                            details: { title: piece.title, artist: piece.artist, year: piece.year, movement: piece.movement, medium: piece.medium, museum: museumResults.museum, description: piece.description, type: 'Painting', location: museumResults.city || '', historicalContext: '' },
                            timestamp: Date.now(),
                          };
                          setBucketList(prev => [item, ...prev].slice(0, 50));
                          if (user) setDoc(doc(db, `users/${user.uid}/bucketList`, item.id), sanitizeForFirestore({ ...item, userId: user.uid }), { merge: true }).catch(() => {});
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation / Header */}
      <header className="h-16 md:h-20 flex justify-between items-center px-4 md:px-10 border-b border-artistic-ink/10 bg-artistic-bg/80 backdrop-blur-md z-50">
        <div 
          className="flex items-center space-x-2 md:space-x-4 cursor-pointer group"
          onClick={() => { setView('home'); reset(); setIsMobileMenuOpen(false); }}
          title="Return to home screen and clear current scan"
        >
          <div className="w-8 h-8 md:w-12 md:h-12 bg-white/50 backdrop-blur rounded-full flex items-center justify-center p-1.5 border border-artistic-ink/5 overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-500">
            <img 
              src="/images/logo.png" 
              alt="Aura Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="uppercase tracking-[0.2em] md:tracking-[0.4em] font-black text-[11px] md:text-[11px] text-artistic-ink hover:text-artistic-accent transition-colors">Aura</span>
        </div>
        
        <nav className="hidden lg:flex space-x-12 uppercase text-[11px] tracking-[0.2em] font-bold">
          <button 
            onClick={() => navigateTo('galleries')} 
            className={`${view === 'galleries' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Gallery
          </button>
          <button 
            onClick={() => navigateTo('insights')} 
            className={`${view === 'insights' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Insights
          </button>
          <button 
            onClick={() => navigateTo('bucketlist')} 
            className={`${view === 'bucketlist' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Bucket List
          </button>
          <button 
            onClick={() => navigateTo('passport')} 
            className={`${view === 'passport' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Passport
          </button>
          <button 
            onClick={() => navigateTo('achievements')} 
            className={`${view === 'achievements' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Achievements
          </button>
          <button 
            onClick={() => navigateTo('itinerary')} 
            className={`${view === 'itinerary' ? 'text-artistic-accent' : 'hover:text-artistic-accent'} transition-colors`}
          >
            Routes
          </button>
        </nav>

        <div className="flex items-center gap-2 md:gap-6">
          {/* Mobile Menu Toggle — only for secondary/overflow items */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 lg:hidden text-artistic-ink hover:bg-artistic-shadow rounded-full transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {user ? (
            <div className="hidden sm:flex items-center gap-4 border-l border-artistic-ink/10 pl-6">
              <div className="flex flex-col items-end mr-2">
                <span className="text-[11px] uppercase tracking-widest font-bold opacity-40">Collector</span>
                <span className="text-[11px] font-bold truncate max-w-[80px]">{user.displayName || user.email?.split('@')[0]}</span>
              </div>
              
              <div className="flex items-center gap-2 border-x border-artistic-ink/5 px-2 md:px-4 h-10">
                <button 
                  onClick={() => {
                    const profileUrl = new URL(window.location.href);
                    profileUrl.search = ''; // Clear existing params
                    profileUrl.searchParams.set('sharedProfile', user.uid);
                    const finalUrl = profileUrl.toString();
                    
                    if (!isGalleryPublic && !isBucketListPublic) {
                      toggleProfilePublic().then(() => handleShare(finalUrl));
                    } else {
                      handleShare(finalUrl);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase font-bold tracking-widest transition-all ${isCopied ? 'bg-green-500 text-white' : (isGalleryPublic || isBucketListPublic ? 'bg-artistic-accent text-white shadow-lg shadow-artistic-accent/20' : 'bg-artistic-shadow text-artistic-ink/40 hover:text-artistic-ink')}`}
                >
                  {isCopied ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                  <span className="hidden md:inline">{isCopied ? 'Copied' : (isGalleryPublic || isBucketListPublic ? 'Copy Link' : 'Share Profile')}</span>
                </button>
                
                {(isGalleryPublic || isBucketListPublic) && (
                  <button 
                    onClick={toggleProfilePublic}
                    className="p-2 hover:bg-artistic-shadow rounded-full text-artistic-ink transition-colors group relative"
                    title="Stop Sharing"
                  >
                    <X className="w-3.5 h-3.5" />
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-artistic-ink text-artistic-bg text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Stop Sharing</div>
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
              className="hidden sm:flex items-center gap-3 px-4 py-2 bg-artistic-ink text-artistic-bg rounded-full text-[11px] uppercase font-bold tracking-widest hover:bg-artistic-accent transition-all"
            >
              <LogIn className="w-3 h-3" />
              <span>Sign In</span>
            </button>
          )}

          {image && (
            <button 
              onClick={reset}
              className="hidden md:block text-[11px] font-bold uppercase tracking-[0.2em] text-artistic-ink/40 hover:text-artistic-ink transition-colors"
              title="Clear current scan results and upload a new masterpiece"
            >
              Reset
            </button>
          )}
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (!user) {
                  handleLogin();
                } else {
                  setIsSearchVisible(true); setError(null);
                }
              }}
              className="p-2 hover:bg-artistic-shadow rounded-full text-artistic-ink transition-colors"
              title={user ? "Search Masterpieces" : "Sign in to Search"}
            >
              <Search className="w-4 h-4" />
            </button>

            <div className="relative">
              <button 
                disabled={isViewOnly}
                onClick={() => {
                  if (!user) {
                    handleLogin();
                  } else {
                    setIsHeaderCaptureMenuOpen(!isHeaderCaptureMenuOpen);
                  }
                }}
                className={`px-3 md:px-5 py-2 border border-artistic-ink rounded-full text-[11px] md:text-xs uppercase font-bold tracking-tight hover:bg-artistic-ink hover:text-artistic-bg transition-all ${isViewOnly ? 'opacity-50 cursor-not-allowed' : ''} ${isHeaderCaptureMenuOpen ? 'bg-artistic-ink text-artistic-bg' : ''}`}
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : (!user ? 'Sign in to Capture' : 'Capture')}
              </button>

            <AnimatePresence>
              {isHeaderCaptureMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsHeaderCaptureMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-xl border border-artistic-ink/5 p-2 z-20"
                  >
                    <button 
                      onClick={() => { setIsSearchVisible(!isSearchVisible); setIsHeaderCaptureMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group border-b border-artistic-ink/5 mb-1"
                    >
                      <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                        <Search className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Search Art</span>
                    </button>
                    <button 
                      onClick={() => { cameraInputRef.current?.click(); setIsHeaderCaptureMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                    >
                      <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                        <Camera className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Take Picture</span>
                    </button>
                    <button 
                      onClick={() => { fileInputRef.current?.click(); setIsHeaderCaptureMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                    >
                      <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Filesystem</span>
                    </button>
                    <button 
                      onClick={() => { setIsGooglePhotosOpen(true); setIsHeaderCaptureMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                    >
                      <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                        <Globe className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Google Photos</span>
                    </button>
                    <button 
                      onClick={() => { setIsUrlCaptureOpen(true); setIsHeaderCaptureMenuOpen(false); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group border-t border-artistic-ink/5 pt-3 mt-1"
                    >
                      <div className="w-8 h-8 bg-artistic-shadow rounded-full flex items-center justify-center text-artistic-ink/40 group-hover:bg-artistic-ink group-hover:text-white transition-all">
                        <PlusCircle className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase font-bold tracking-widest opacity-40 group-hover:opacity-100">Other Link</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
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
                <span className="uppercase tracking-[0.4em] font-black text-[11px] text-artistic-ink/40">Navigator</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 transition-colors hover:bg-artistic-shadow rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex flex-col space-y-8 uppercase text-lg tracking-[0.2em] font-serif italic">
                <button 
                  onClick={() => { navigateTo('galleries'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'galleries' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Gallery</span>
                  {view === 'galleries' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('insights'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'insights' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Insights</span>
                  {view === 'insights' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('bucketlist'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'bucketlist' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Bucket List</span>
                  {view === 'bucketlist' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('passport'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'passport' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Passport</span>
                  {view === 'passport' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('achievements'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'achievements' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Achievements</span>
                  {view === 'achievements' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                <button 
                  onClick={() => { navigateTo('itinerary'); setIsMobileMenuOpen(false); }} 
                  className={`${view === 'itinerary' ? 'text-artistic-accent' : 'text-artistic-ink/60'} text-left flex items-center justify-between group`}
                >
                  <span>Routes</span>
                  {view === 'itinerary' && <div className="w-1.5 h-1.5 bg-artistic-accent rounded-full" />}
                </button>
                
                <div className="pt-4 border-t border-artistic-ink/5">
                  <span className="text-[11px] uppercase tracking-widest font-bold opacity-30 block mb-6 px-1">Quick Capture</span>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => { 
                        if (!user) {
                          handleLogin();
                        } else {
                          setIsSearchVisible(!isSearchVisible); 
                          setIsMobileMenuOpen(false); 
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-artistic-shadow rounded-2xl transition-all active:scale-95 border-b-4 border-artistic-accent/20"
                    >
                      <Search className="w-5 h-5 text-artistic-accent" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-artistic-accent">{user ? 'Search Art' : 'Sign In'}</span>
                    </button>
                    <button 
                      onClick={() => { 
                        if (!user) {
                          handleLogin();
                        } else {
                          cameraInputRef.current?.click(); 
                          setIsMobileMenuOpen(false); 
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-artistic-shadow rounded-2xl transition-all active:scale-95"
                    >
                      <Camera className="w-5 h-5 opacity-40" />
                      <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Camera</span>
                    </button>
                    <button 
                      onClick={() => { 
                        if (!user) {
                          handleLogin();
                        } else {
                          fileInputRef.current?.click(); 
                          setIsMobileMenuOpen(false); 
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-artistic-shadow rounded-2xl transition-all active:scale-95"
                    >
                      <ImageIcon className="w-5 h-5 opacity-40" />
                      <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Files</span>
                    </button>
                    <button 
                      onClick={() => { 
                        if (!user) {
                          handleLogin();
                        } else {
                          setIsGooglePhotosOpen(true); 
                          setIsMobileMenuOpen(false); 
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-artistic-shadow rounded-2xl transition-all active:scale-95"
                    >
                      <Globe className="w-5 h-5 opacity-40" />
                      <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Photos</span>
                    </button>
                    <button 
                      onClick={() => { 
                        if (!user) {
                          handleLogin();
                        } else {
                          setIsUrlCaptureOpen(true); 
                          setIsMobileMenuOpen(false); 
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 bg-artistic-shadow rounded-2xl transition-all active:scale-95"
                    >
                      <PlusCircle className="w-5 h-5 opacity-40" />
                      <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">Link</span>
                    </button>
                  </div>
                </div>
              </nav>

              <div className="mt-auto border-t border-artistic-ink/10 pt-8 space-y-6">
                {user ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col">
                      <span className="text-[11px] uppercase tracking-widest font-bold opacity-30 italic">Identified as</span>
                      <span className="text-[11px] font-bold truncate">{user.displayName || user.email}</span>
                    </div>
                    
                    <button 
                      onClick={() => { 
                        const url = new URL(window.location.href);
                        url.search = '';
                        url.searchParams.set('sharedProfile', user.uid);
                        const profileUrl = url.toString();

                        if (!isGalleryPublic && !isBucketListPublic) {
                          toggleProfilePublic().then(() => handleShare(profileUrl));
                        } else {
                          handleShare(profileUrl);
                        }
                        setIsMobileMenuOpen(false); 
                      }}
                      className={`flex items-center justify-between w-full p-3 rounded-xl transition-all ${isGalleryPublic || isBucketListPublic ? 'bg-artistic-accent text-white shadow-lg shadow-artistic-accent/20' : 'bg-artistic-shadow text-artistic-ink/60'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        <span className="text-[11px] uppercase font-bold tracking-widest">Visibility</span>
                      </div>
                      <div className={`w-7 h-3.5 rounded-full relative ${isGalleryPublic || isBucketListPublic ? 'bg-white/30' : 'bg-artistic-ink/10'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${isGalleryPublic || isBucketListPublic ? 'right-0.5 bg-white' : 'left-0.5 bg-artistic-ink/40'}`} />
                      </div>
                    </button>

                    <button 
                      onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                      className="flex items-center gap-2 text-red-500/60 hover:text-red-500 transition-colors font-bold uppercase tracking-widest text-[11px]"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => { handleLogin(); setIsMobileMenuOpen(false); }}
                    className="w-full py-3.5 bg-artistic-ink text-artistic-bg rounded-xl text-[11px] uppercase font-bold tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-artistic-ink/20"
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

      {/* Mobile Bottom Navigation Bar */}
      {!isViewOnly && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-artistic-bg/95 backdrop-blur-md border-t border-artistic-ink/10 safe-area-inset-bottom">
          <div className="flex items-stretch h-16">
            {/* Scan — center action */}
            <button
              onClick={() => { setView('home'); reset(); setIsMobileMenuOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${view === 'home' ? 'text-artistic-accent' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
            >
              <Camera className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Scan</span>
            </button>

            <button
              onClick={() => { navigateTo('galleries'); setIsMobileMenuOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${view === 'galleries' ? 'text-artistic-accent' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Gallery</span>
            </button>

            <button
              onClick={() => { navigateTo('insights'); setIsMobileMenuOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${view === 'insights' ? 'text-artistic-accent' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
            >
              <TrendingUp className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Insights</span>
            </button>

            <button
              onClick={() => { navigateTo('bucketlist'); setIsMobileMenuOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${view === 'bucketlist' ? 'text-artistic-accent' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
            >
              <Star className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Wishlist</span>
            </button>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${isMobileMenuOpen ? 'text-artistic-accent' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-widest">More</span>
            </button>
          </div>
        </nav>
      )}

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
            isViewOnly={isViewOnly}
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
            onOpenGallery={(id, type) => {
              setGalleryTarget({ id, type });
              setIsGalleryViewerOpen(true);
            }}
          />
        ) : view === 'achievements' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-4xl mx-auto">
              <header className="mb-16">
                <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block mb-4">Intellectual Growth</span>
                <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic mb-8">Connoisseur Status</h2>
              </header>
              
              {userProfile ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className={isViewOnly ? "md:col-span-3" : "md:col-span-2"}>
                      {(userProfile.streak ?? 0) > 0 && (
                        <div className="flex items-center gap-3 mb-6 p-4 bg-artistic-shadow/30 rounded-2xl border border-artistic-ink/5">
                          <span className="text-2xl">🔥</span>
                          <div>
                            <p className="text-sm font-bold">{userProfile.streak}-day scan streak</p>
                            <p className="text-[11px] uppercase tracking-widest opacity-40">Keep scanning daily to grow it</p>
                          </div>
                          {(userProfile.streak ?? 0) >= 7 && <span className="ml-auto text-[11px] font-bold uppercase tracking-widest text-artistic-accent">Week streak! +2× XP</span>}
                        </div>
                      )}
                       <AchievementSystem profile={userProfile} />
                    </div>
                    {!isViewOnly && (
                      <div className="space-y-8">
                         <ArtQuiz 
                          history={history} 
                          bucketList={bucketList}
                          onCorrect={(xp) => addXP(xp)} 
                         />
                         
                         <div className="p-8 bg-artistic-ink text-artistic-bg rounded-3xl">
                            <Compass className="w-8 h-8 mb-4 text-artistic-accent" />
                            <h4 className="font-bold uppercase tracking-widest text-xs mb-2">Growth Tip</h4>
                            <p className="text-xs opacity-60 leading-relaxed italic">
                              Scanning artworks from movements you haven't explored yet yields double XP. Expand your aesthetic horizons to reach the status of "Grand Historian".
                            </p>
                         </div>
                      </div>
                    )}
                 </div>
              ) : (
                <div className="p-20 bg-artistic-shadow/10 rounded-3xl border border-dashed border-artistic-ink/10 text-center">
                   <LogIn className="w-8 h-8 mx-auto mb-4 opacity-20" />
                   <h4 className="font-serif italic text-xl mb-4">Achievements are for members</h4>
                   <p className="text-sm text-artistic-ink/40 max-w-sm mx-auto mb-8">Sign in with your Google account to track your progress, earn badges, and complete daily art challenges.</p>
                   <button onClick={handleLogin} className="px-8 py-3 bg-artistic-ink text-artistic-bg rounded-full text-xs uppercase font-bold tracking-widest">Sign In to Start</button>
                </div>
              )}
            </div>
          </section>
        ) : view === 'itinerary' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-6xl mx-auto">
              <ItineraryPlanner 
                bucketList={bucketList}
                onArtworkClick={findAndLoadFromHistoryId}
                userInterests={userInterests}
                onAddToBucketList={addToBucketList}
              />
            </div>
          </section>
        ) : view === 'passport' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-6xl mx-auto">
              {user || isViewOnly ? (
                 <MuseumPassport 
                  stamps={museumStamps} 
                  history={history}
                  onCheckIn={handleMuseumCheckIn} 
                  isViewOnly={isViewOnly}
                 />
              ) : (
                <div className="p-20 bg-artistic-shadow/10 rounded-3xl border border-dashed border-artistic-ink/10 text-center">
                   <MapPin className="w-8 h-8 mx-auto mb-4 opacity-20" />
                   <h4 className="font-serif italic text-xl mb-4">Your passport awaits</h4>
                   <p className="text-sm text-artistic-ink/40 max-w-sm mx-auto mb-8">Sign in to check into museums physical locations and collect stamps for your digital passport.</p>
                   <button onClick={handleLogin} className="px-8 py-3 bg-artistic-ink text-artistic-bg rounded-full text-xs uppercase font-bold tracking-widest">Sign In to Start</button>
                </div>
              )}
            </div>
          </section>
        ) : view === 'bucketlist' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-10 md:mb-16">
                <div className="flex justify-between items-end gap-6 flex-wrap">
                  <div>
                    <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block mb-2 md:mb-4">Curated Selections</span>
                    <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">
                      {isViewOnly 
                        ? (sharedGalleryOwnerName ? `${sharedGalleryOwnerName}'s` : 'User\'s') 
                        : (user ? (user.displayName || user.email?.split('@')[0] || 'My') : 'Guest')} Bucket List
                    </h2>
                  </div>
                  <div className="flex items-center gap-4 md:gap-6 flex-wrap">
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border text-[11px] md:text-xs uppercase font-bold tracking-widest transition-all ${showFilters ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink'}`}
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
                      className="text-[11px] uppercase font-bold tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All Filters
                    </button>
                  </div>
                </div>
              </header>

              <FilterSection />

              {isBucketListLoading ? (
                <SkeletonGalleryGrid count={6} />
              ) : filteredBucketList.length === 0 ? (
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
                    {filteredBucketList.map((item) => {
                      const isInHistory = history.some(h => 
                        (h.details.title.toLowerCase() === item.details.title.toLowerCase() || h.details.title.toLowerCase().includes(item.details.title.toLowerCase())) && 
                        (h.details.artist.toLowerCase() === item.details.artist.toLowerCase() || h.details.artist.toLowerCase().includes(item.details.artist.toLowerCase()))
                      );
                      
                      return (
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
                                className={`w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-700 ${isInHistory ? 'opacity-40' : ''}`} 
                                fallback={
                                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                    <Palette className="w-8 h-8 opacity-10 mb-2" />
                                    <div className="flex gap-4">
                                      {!isViewOnly && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOverrideTarget({ id: item.id, type: 'bucketlist' });
                                          }}
                                          className="text-xs uppercase font-bold tracking-widest text-artistic-accent hover:underline"
                                        >
                                          Assign Visual
                                        </button>
                                      )}
                                      <a 
                                        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.details.title + ' ' + (item.details.artist || ''))}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs uppercase font-bold tracking-widest text-artistic-ink/40 hover:text-artistic-accent hover:underline flex items-center gap-1"
                                      >
                                        Search Visual
                                      </a>
                                    </div>
                                  </div>
                                }
                              />
                              {isInHistory && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="bg-artistic-ink text-artistic-bg backdrop-blur-sm px-4 py-2 rounded-full border border-artistic-ink/10 flex items-center gap-2 shadow-2xl">
                                    <HistoryIcon className="w-3 h-3" />
                                    <span className="text-xs font-bold uppercase tracking-widest">In Gallery</span>
                                  </div>
                                </div>
                              )}
                              {!isViewOnly && (
                                <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGalleryTarget({ id: item.id, type: 'bucketlist' });
                                      setIsGalleryViewerOpen(true);
                                    }}
                                    className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-artistic-ink hover:bg-artistic-accent hover:text-white transition-all shadow-lg"
                                    title="View/Update Visuals"
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                  </button>
                                  {!isInHistory && (
                                    <button 
                                      onClick={(e) => moveBucketToGallery(item, e)}
                                      className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-artistic-accent hover:bg-artistic-accent/10 shadow-lg"
                                      title="Move to Gallery"
                                    >
                                      <HistoryIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button 
                                    onClick={(e) => deleteBucketListItem(item.id, e)}
                                    className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 shadow-lg"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-serif text-xl italic group-hover:text-artistic-accent transition-colors truncate">{item.details.title}</h3>
                            {isInHistory && <Check className="w-4 h-4 text-artistic-accent" />}
                          </div>
                          <div className="flex items-center gap-3 text-xs uppercase font-bold tracking-widest opacity-40">
                            <span>{item.details.artist}</span>
                            <span className="w-1 h-px bg-artistic-ink" />
                            <span>{item.details.year}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        ) : view === 'insights' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-16">
                <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block mb-4">Gallery Intelligence</span>
                <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">Curator Analytics</h2>
              </header>
              {isGalleryLoading ? <SkeletonInsights /> : <CuratorInsights history={history} />}
            </div>
          </section>
        ) : view === 'galleries' ? (
          <section className="w-full h-full overflow-y-auto bg-white p-6 pb-24 md:pb-20 md:p-20">
            <div className="max-w-6xl mx-auto">
              <header className="mb-10 md:mb-16 flex justify-between items-end gap-6 flex-wrap">
                <div>
                  <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block mb-2 md:mb-4">Curated Collection</span>
                  <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">
                    {isViewOnly 
                      ? (sharedGalleryOwnerName ? `${sharedGalleryOwnerName}'s` : 'User\'s') 
                      : (user ? (user.displayName || user.email?.split('@')[0] || 'My') : 'Guest')} Gallery
                  </h2>
                </div>
                <div className="flex gap-4 md:gap-8 items-center flex-wrap">
                  <div className="flex items-center gap-2 md:gap-4">
                    <button 
                      onClick={() => navigateTo('insights')}
                      className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border border-artistic-ink/10 text-[11px] md:text-xs uppercase font-bold tracking-widest hover:border-artistic-accent hover:text-artistic-accent transition-all bg-white"
                    >
                      <TrendingUp className="w-3 h-3 text-artistic-accent" />
                      <span className="hidden sm:inline">Insights</span>
                    </button>
                    
                    {!isViewOnly && history.some(i => i.details.description?.startsWith('Suggested masterpiece') || i.details.medium === 'Unknown') && (
                      <button
                        onClick={batchReidentifyPlaceholders}
                        disabled={isReidentifying}
                        title="Re-analyze placeholder artworks"
                        className="flex items-center gap-2 px-3 py-2 rounded-full border border-artistic-accent/30 text-[11px] uppercase font-bold tracking-widest text-artistic-accent hover:bg-artistic-accent hover:text-white transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isReidentifying ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">{isReidentifying ? `${reidentifyProgress}%` : 'Re-analyze'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border text-[11px] md:text-xs uppercase font-bold tracking-widest transition-all ${showFilters ? 'bg-artistic-ink text-artistic-bg border-artistic-ink' : 'bg-white text-artistic-ink border-artistic-ink/10 hover:border-artistic-ink'}`}
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

                  <div className="hidden sm:flex gap-4 items-center opacity-40 text-[11px] uppercase font-bold tracking-widest border-l border-artistic-ink/10 pl-8">
                    <span>{filteredHistory.length} cataloged</span>
                  </div>
                  {!isViewOnly && (
                    <button
                      onClick={() => { setIsBulkMode(m => !m); setSelectedIds(new Set()); }}
                      className={`ml-2 p-1.5 md:p-2 rounded-full transition-all text-[11px] font-bold uppercase tracking-widest ${isBulkMode ? 'bg-artistic-accent text-white' : 'text-artistic-ink/40 hover:text-artistic-ink'}`}
                      title="Bulk select"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </header>

              {/* Gallery inline search */}
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-artistic-ink/30 pointer-events-none" />
                <input
                  type="text"
                  value={gallerySearch}
                  onChange={e => setGallerySearch(e.target.value)}
                  placeholder="Search title, artist, movement, year…"
                  className="w-full pl-11 pr-10 py-3 bg-artistic-shadow/40 border border-artistic-ink/8 rounded-full text-sm placeholder:text-artistic-ink/30 focus:outline-none focus:border-artistic-ink/30 transition-colors"
                />
                {gallerySearch && (
                  <button onClick={() => setGallerySearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-artistic-ink/30 hover:text-artistic-ink transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <FilterSection />

              {/* Bulk action toolbar */}
              <AnimatePresence>
                {isBulkMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 mb-6 p-3 bg-artistic-ink text-artistic-bg rounded-2xl"
                  >
                    <button
                      onClick={() => setSelectedIds(new Set(filteredHistory.map(i => i.id)))}
                      className="text-[11px] uppercase font-bold tracking-widest opacity-60 hover:opacity-100 transition-opacity"
                    >
                      Select All
                    </button>
                    <span className="text-artistic-bg/20">|</span>
                    <span className="text-[11px] uppercase font-bold tracking-widest opacity-60">{selectedIds.size} selected</span>
                    <div className="ml-auto flex gap-2">
                      <button
                        disabled={selectedIds.size === 0}
                        onClick={() => bulkMoveToBucketList(selectedIds)}
                        className="px-3 py-1.5 text-[11px] uppercase font-bold tracking-widest bg-artistic-bg/10 hover:bg-artistic-bg/20 rounded-full transition-colors disabled:opacity-30"
                      >
                        Move to Wishlist
                      </button>
                      <button
                        disabled={selectedIds.size === 0}
                        onClick={() => bulkDelete(selectedIds, 'history')}
                        className="px-3 py-1.5 text-[11px] uppercase font-bold tracking-widest bg-red-500/80 hover:bg-red-500 rounded-full transition-colors disabled:opacity-30"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {isGalleryLoading ? (
                <SkeletonGalleryGrid count={6} />
              ) : (history.length === 0 && bucketList.length === 0) ? (
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
                  <p className="mt-4 md:mt-8 p-4 md:p-0 text-xs uppercase tracking-[0.2em] font-bold opacity-30 flex items-center gap-3">
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
                  <p className="mt-4 md:mt-8 p-4 md:p-0 text-xs uppercase tracking-[0.2em] font-bold opacity-30 flex items-center gap-3">
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
                        whileHover={{ y: isBulkMode ? 0 : -5 }}
                        onClick={() => {
                          if (isBulkMode) {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                              return next;
                            });
                          } else {
                            loadFromHistory(item);
                          }
                        }}
                        className={`group cursor-pointer relative ${isBulkMode && selectedIds.has(item.id) ? 'ring-2 ring-artistic-accent rounded-sm' : ''}`}
                      >
                        {isBulkMode && (
                          <div className="absolute top-2 left-2 z-10 pointer-events-none">
                            {selectedIds.has(item.id)
                              ? <CheckSquare className="w-5 h-5 text-artistic-accent drop-shadow" />
                              : <Square className="w-5 h-5 text-artistic-ink/40 drop-shadow" />}
                          </div>
                        )}
                        <div className="aspect-[4/5] bg-artistic-shadow p-4 mb-6 art-shadow transition-all group-hover:shadow-[40px_40px_0px_#E5E0D5]">
                          <div className="w-full h-full bg-gray-100 gallery-frame overflow-hidden relative group/img">
                            <ValidatedImage 
                              src={item.image} 
                              alt={item.details.title} 
                              className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-700" 
                              fallback={
                                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                  <Palette className="w-8 h-8 opacity-10 mb-2" />
                                  <div className="flex gap-4">
                                    {!isViewOnly && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOverrideTarget({ id: item.id, type: 'history' });
                                        }}
                                        className="text-xs uppercase font-bold tracking-widest text-artistic-accent hover:underline"
                                      >
                                        Assign Visual
                                      </button>
                                    )}
                                    <a 
                                      href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(item.details.title + ' ' + (item.details.artist || ''))}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs uppercase font-bold tracking-widest text-artistic-ink/40 hover:text-artistic-accent hover:underline flex items-center gap-1"
                                    >
                                      Search Visual
                                    </a>
                                  </div>
                                </div>
                              }
                            />
                            {!isViewOnly && (
                              <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.details.museum && (
                                  (() => {
                                    const museum = MUSEUMS.find(m => m.keywords.some(k => item.details.museum?.toLowerCase().includes(k.toLowerCase())));
                                    const isStamped = museum && museumStamps.some(s => s.museumId === museum.id);
                                    if (museum && !isStamped) {
                                      return (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMuseumCheckIn({
                                              id: `scan-${museum.id}-${Date.now()}`,
                                              museumId: museum.id,
                                              museumName: museum.name,
                                              timestamp: Date.now(),
                                              location: { lat: 0, lng: 0 }
                                            });
                                          }}
                                          className="w-8 h-8 bg-artistic-accent text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                          title={`Check-in to ${museum.name}`}
                                        >
                                          <MapPin className="w-4 h-4" />
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()
                                )}
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGalleryTarget({ id: item.id, type: 'history' });
                                    setIsGalleryViewerOpen(true);
                                  }}
                                  className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-artistic-ink hover:bg-artistic-accent hover:text-white transition-all shadow-lg"
                                  title="View/Update Visuals"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => deleteHistoryItem(item.id, e)}
                                  className="w-8 h-8 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <h3 className="font-serif text-xl italic mb-1 group-hover:text-artistic-accent transition-colors">{item.details.title}</h3>
                        <div className="flex items-center gap-3 text-xs uppercase font-bold tracking-widest opacity-40">
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
        ) : (!image && !details && !isLoading && isViewOnly && sharedGalleryOwnerName) ? (
          /* Public profile hero landing */
          <section className="w-full flex flex-col items-center justify-center p-8 md:p-16 text-center bg-white overflow-y-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl">
              <div className="w-20 h-20 rounded-full bg-artistic-shadow flex items-center justify-center mx-auto mb-6 text-3xl border border-artistic-ink/10">🎨</div>
              <h1 className="text-4xl md:text-6xl font-serif italic mb-3">{sharedGalleryOwnerName}</h1>
              <p className="text-xs uppercase tracking-[0.3em] font-bold text-artistic-accent mb-8">Curated Heritage Binnacle</p>
              <div className="flex justify-center gap-8 mb-10">
                <div className="text-center"><p className="text-3xl font-serif font-bold">{history.length}</p><p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Works</p></div>
                <div className="text-center"><p className="text-3xl font-serif font-bold">{new Set(history.map(i => i.details.movement).filter(Boolean)).size}</p><p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Movements</p></div>
                <div className="text-center"><p className="text-3xl font-serif font-bold">{new Set(history.map(i => i.details.museum).filter(Boolean)).size}</p><p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Museums</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-10">
                {history.slice(0, 6).map(item => (
                  <div key={item.id} onClick={() => loadFromHistory(item)} className="aspect-square bg-artistic-shadow rounded-lg overflow-hidden cursor-pointer group">
                    <img src={item.image} alt={item.details.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                ))}
              </div>
              <button onClick={() => setView('galleries')} className="px-8 py-3 bg-artistic-ink text-white text-xs uppercase font-bold tracking-widest rounded-full hover:bg-artistic-accent transition-colors">
                Browse Full Gallery
              </button>
            </motion.div>
          </section>
        ) : (!image && !details && !isLoading) ? (
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
                    src="/images/logo.png" 
                    alt="Aura Logo" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <span className="uppercase text-[11px] md:text-xs tracking-[0.3em] md:tracking-[0.4em] font-bold text-artistic-accent block mb-4 md:mb-8 text-nowrap">Intelligence meets Aesthetics</span>
              <h1 className="font-serif text-4xl md:text-8xl mb-8 md:mb-12 leading-[1.1] tracking-tighter" style={{ fontFamily: 'Georgia, serif' }}>
                AURA - The <br /> <span className="italic">Art Binnacle</span>
              </h1>
              <p className="text-artistic-ink/60 max-w-lg mx-auto mb-10 md:mb-16 text-xs md:text-sm leading-relaxed px-4 md:px-0">
                Connect your vision to the history of human creativity. Our neural engine identifies, catalogs, and contextualizes any masterpiece in seconds.
              </p>

              <div className="flex gap-10 justify-center items-center">
                <div className="flex flex-col items-center relative">
                  <button
                    disabled={isViewOnly || isLoading}
                    onClick={() => setIsHeroCaptureMenuOpen(!isHeroCaptureMenuOpen)}
                    className={`w-14 h-14 md:w-16 md:h-16 bg-artistic-ink text-artistic-bg rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl mb-2 ${isViewOnly || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <PlusCircle className="w-6 h-6" />}
                  </button>
                  <span className="text-[11px] uppercase font-bold tracking-widest opacity-40">Capture</span>

                  <AnimatePresence>
                    {isHeroCaptureMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsHeroCaptureMenuOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-full mb-4 w-48 bg-white rounded-2xl shadow-2xl border border-artistic-ink/5 p-2 z-20 left-1/2 -translate-x-1/2"
                        >
                          <button 
                            onClick={() => { setIsSearchVisible(true); setIsHeroCaptureMenuOpen(false); setError(null); }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group border-b border-artistic-ink/5 mb-1"
                          >
                            <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                              <Search className="w-4 h-4" />
                            </div>
                            <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Search Art</span>
                          </button>
                          <button 
                            onClick={() => { cameraInputRef.current?.click(); setIsHeroCaptureMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                              <Camera className="w-4 h-4" />
                            </div>
                            <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Take Picture</span>
                          </button>
                          <button 
                            onClick={() => { fileInputRef.current?.click(); setIsHeroCaptureMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                            <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Filesystem</span>
                          </button>
                          <button 
                            onClick={() => { setIsGooglePhotosOpen(true); setIsHeroCaptureMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                          >
                            <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                              <Globe className="w-4 h-4" />
                            </div>
                            <span className="text-xs uppercase font-bold tracking-widest opacity-60 group-hover:opacity-100">Google Photos</span>
                          </button>
                          <button 
                            onClick={() => { setIsUrlCaptureOpen(true); setIsHeroCaptureMenuOpen(false); }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group border-t border-artistic-ink/5 pt-3 mt-1"
                          >
                            <div className="w-8 h-8 bg-artistic-shadow rounded-full flex items-center justify-center text-artistic-ink/40 group-hover:bg-artistic-ink group-hover:text-white transition-all">
                              <PlusCircle className="w-4 h-4" />
                            </div>
                            <span className="text-xs uppercase font-bold tracking-widest opacity-40 group-hover:opacity-100">Other Link</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col items-center">
                  <button
                    disabled={isViewOnly || isLoading}
                    onClick={() => { setIsSearchVisible(true); setError(null); }}
                    className={`w-14 h-14 md:w-16 md:h-16 border border-artistic-ink rounded-full flex items-center justify-center hover:bg-artistic-ink hover:text-artistic-bg transition-all shadow-lg mb-2 ${isViewOnly || isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${isSearchVisible ? 'bg-artistic-ink text-artistic-bg' : ''}`}
                  >
                    <Search className="w-6 h-6" />
                  </button>
                  <span className="text-[11px] uppercase font-bold tracking-widest opacity-40">Search Art</span>
                </div>

                <div onClick={() => !isLoading && setView('galleries')} className={`cursor-pointer group flex flex-col items-center ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                   <div className="w-14 h-14 md:w-16 md:h-16 border border-artistic-ink rounded-full flex items-center justify-center group-hover:bg-artistic-ink group-hover:text-artistic-bg transition-all mb-2">
                     <HistoryIcon className="w-6 h-6" />
                   </div>
                   <span className="text-[11px] uppercase font-bold tracking-widest opacity-40">Your Gallery</span>
                </div>
              </div>

              {/* Daily Artwork of the Day */}
              {bucketList.length > 0 && (() => {
                // Pick a deterministic item for today based on date
                const todayIndex = Math.floor(Date.now() / 86400000) % bucketList.length;
                const daily = bucketList[todayIndex];
                return (
                  <div className="mt-12 md:mt-16 w-full max-w-sm mx-auto">
                    <p className="text-[11px] uppercase tracking-[0.3em] font-bold opacity-30 mb-4 text-center">Today's Masterpiece from your Wishlist</p>
                    <div
                      onClick={() => { loadFromHistory(daily); }}
                      className="group flex items-center gap-4 p-4 bg-artistic-shadow/40 hover:bg-artistic-shadow border border-artistic-ink/5 rounded-2xl cursor-pointer transition-all"
                    >
                      <div className="w-16 h-16 flex-shrink-0 overflow-hidden rounded-lg bg-white">
                        <img src={daily.image} alt={daily.details.title} className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold truncate">{daily.details.title}</p>
                        <p className="text-[11px] opacity-40 uppercase tracking-widest truncate">{daily.details.artist}</p>
                        <p className="text-[11px] opacity-30 mt-0.5">{daily.details.museum || daily.details.location}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 opacity-20 group-hover:opacity-60 group-hover:translate-x-1 transition-all flex-shrink-0" />
                    </div>
                  </div>
                );
              })()}

            </motion.div>
          </section>
        ) : (
          <div className="w-full flex flex-col lg:flex-row overflow-hidden">
            {/* Image Preview Side (55%) */}
            <div className="w-full lg:w-[55%] p-6 md:p-10 lg:p-20 flex flex-col justify-center items-center bg-white overflow-y-auto relative">
              <button 
                onClick={navigateBack}
                className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-2 text-xs uppercase font-bold tracking-widest opacity-40 hover:opacity-100 hover:text-artistic-accent transition-all group"
              >
                <ArrowRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" />
                <span>Back to previous</span>
              </button>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative aspect-[4/5] w-full max-w-[480px] bg-artistic-shadow p-8 art-shadow"
              >
                <div className="w-full h-full bg-gray-100 gallery-frame flex items-center justify-center overflow-hidden relative group/img cursor-zoom-in" onClick={() => image && setLightboxSrc(image)}>
                  <ValidatedImage
                    src={image}
                    alt="Artwork Preview"
                    className="w-full h-full object-contain"
                    fallback={
                      <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                        <Palette className="w-12 h-12 opacity-10 mb-4" />
                        <span className="text-xs uppercase font-bold tracking-widest opacity-20 mb-6">Visual Stream Disrupted</span>
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => {
                               // Find the current active artwork ID if possible
                               const currentItem = history.find(h => h.image === image) || bucketList.find(b => b.image === image);
                               if (currentItem) {
                                 setOverrideTarget({ id: currentItem.id, type: history.find(h => h.image === image) ? 'history' : 'bucketlist' });
                               }
                            }}
                            className="px-6 py-2 border border-artistic-ink/20 rounded-full text-xs uppercase font-bold hover:bg-artistic-ink hover:text-artistic-bg transition-all"
                          >
                            Manual Verification
                          </button>
                        </div>
                      </div>
                    }
                  />

                  {/* Update Photo Overlay */}
                  {!isLoading && details && (
                    <div className="absolute inset-x-0 bottom-0 py-8 bg-gradient-to-t from-artistic-ink/60 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none group-hover/img:pointer-events-auto z-10 backdrop-blur-sm gap-4">
                      <button 
                        onClick={() => {
                           const currentItem = history.find(h => h.details.title === details.title) || bucketList.find(b => b.details.title === details.title);
                           if (currentItem) {
                             setGalleryTarget({ id: currentItem.id, type: history.find(h => h.id === currentItem.id) ? 'history' : 'bucketlist' });
                             setIsGalleryViewerOpen(true);
                           }
                        }}
                        className="px-6 py-3 bg-white text-artistic-ink rounded-full text-xs uppercase tracking-widest font-bold hover:bg-artistic-accent hover:text-white transition-all transform translate-y-4 group-hover/img:translate-y-0 duration-300 flex items-center gap-2 shadow-2xl"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>View Visuals</span>
                      </button>
                      {!isViewOnly && (
                        <button 
                          onClick={() => {
                             const currentItem = history.find(h => h.details.title === details.title) || bucketList.find(b => b.details.title === details.title);
                             setOverrideTarget({ id: currentItem?.id || 'new', type: history.find(h => h.details.title === details.title) ? 'history' : 'bucketlist' });
                          }}
                          className="px-6 py-3 bg-white/20 text-white border border-white/40 backdrop-blur-md rounded-full text-xs uppercase tracking-widest font-bold hover:bg-white hover:text-artistic-ink transition-all transform translate-y-4 group-hover/img:translate-y-0 duration-300 flex items-center gap-2 shadow-2xl"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Update</span>
                        </button>
                      )}
                    </div>
                  )}
                  
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
                            <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-artistic-ink/60">Neural Analysis</p>
                            <span className="text-xs font-mono font-bold text-artistic-accent">{progress}%</span>
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
                                 className="text-[11px] uppercase tracking-[0.1em] font-bold text-artistic-ink/40"
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
                            <p className="text-red-800 text-xs leading-relaxed">
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
                                className="px-6 py-2 bg-artistic-ink text-artistic-bg rounded-full text-xs uppercase font-bold text-center hover:bg-artistic-accent transition-colors"
                              >
                                Manage Billing
                              </a>
                            )}
                            <button 
                              onClick={reset}
                              className="px-6 py-2 border border-red-900 text-red-900 rounded-full text-xs uppercase font-bold hover:bg-red-900 hover:text-white transition-colors"
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
                <div className="absolute bottom-12 right-12 text-[11px] font-mono opacity-30 tracking-widest">ART_REF: 882-QX</div>
              </motion.div>
              
              <div className="mt-16 flex justify-center space-x-12 lg:space-x-24 opacity-30 uppercase text-[11px] font-bold tracking-[0.2em]">
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
                      <div className="flex items-center justify-between mb-8">
                        <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block">Identified Masterpiece</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleRefreshDetails}
                            disabled={isLoading}
                            className="p-2 hover:bg-artistic-shadow/10 rounded-full transition-all group/refresh"
                            title="Refresh masterpiece data"
                          >
                            <RefreshCw className={`w-4 h-4 text-artistic-accent ${isLoading ? 'animate-spin' : 'group-hover/refresh:rotate-180 transition-transform duration-500'}`} />
                          </button>

                          {!isViewOnly && (
                            <div className="relative">
                              <button 
                                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                                className="p-2 hover:bg-artistic-shadow/10 rounded-full transition-all"
                                title="Curator Actions"
                              >
                                <MoreVertical className="w-4 h-4 text-artistic-accent" />
                              </button>
                              
                              <AnimatePresence>
                                {isActionMenuOpen && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsActionMenuOpen(false)} />
                                    <motion.div
                                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                      className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-artistic-ink/5 p-2 z-20 overflow-hidden"
                                    >
                                      <button 
                                        onClick={() => { addToBucketList(details.title, details.artist, details.museum || details.location || '', image || ''); setIsActionMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                                      >
                                        <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                                          <Clock className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs uppercase font-bold tracking-widest opacity-60">Bucket List</span>
                                      </button>
                                      <button 
                                        onClick={() => { handleAddToGallery(); setIsActionMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-artistic-shadow rounded-xl transition-colors text-left group"
                                      >
                                        <div className="w-8 h-8 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent group-hover:bg-artistic-accent group-hover:text-white transition-all">
                                          <LayoutGrid className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs uppercase font-bold tracking-widest opacity-60">Add to Gallery</span>
                                      </button>
                                    </motion.div>
                                  </>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 group/title mb-6">
                        <h1 className="text-5xl lg:text-7xl font-serif leading-[1.1] tracking-tighter" style={{ fontFamily: 'Georgia, serif' }}>
                          {details.title}
                        </h1>
                        {(() => {
                          const isInHistory = history.some(h => 
                            (h.details.title.toLowerCase() === details.title.toLowerCase() || h.details.title.toLowerCase().includes(details.title.toLowerCase())) && 
                            (h.details.artist.toLowerCase() === details.artist.toLowerCase() || h.details.artist.toLowerCase().includes(details.artist.toLowerCase()))
                          );
                          const isInBucketList = bucketList.some(b => 
                            (b.details.title.toLowerCase() === details.title.toLowerCase() || b.details.title.toLowerCase().includes(details.title.toLowerCase())) && 
                            (b.details.artist.toLowerCase() === details.artist.toLowerCase() || b.details.artist.toLowerCase().includes(details.artist.toLowerCase()))
                          );
                          if (isInHistory) return (
                            <div className="flex items-center gap-2 bg-artistic-ink text-artistic-bg px-4 py-1.5 rounded-full shadow-xl border border-artistic-ink">
                              <HistoryIcon className="w-4 h-4" />
                              <span className="text-xs font-bold uppercase tracking-widest leading-none">In Gallery</span>
                            </div>
                          );
                          if (isInBucketList) return (
                            <div className="flex items-center gap-2 bg-white text-artistic-accent px-4 py-1.5 rounded-full shadow-xl border border-artistic-accent/20">
                              <Star className="w-4 h-4" />
                              <span className="text-xs font-bold uppercase tracking-widest leading-none">In Bucket List</span>
                            </div>
                          );
                          return null;
                        })()}
                      </div>
                      
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
                            <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Movement</span>
                            <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.movement}</span>
                          </button>
                          <div>
                            <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-2">Medium</span>
                            <span className="text-xs font-semibold">{details.medium}</span>
                          </div>
                          <button 
                            onClick={() => openEntity(details.type, 'type')}
                            className="text-left group"
                          >
                            <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Type</span>
                            <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.type}</span>
                          </button>
                          {details.museum && (
                            <div className="text-left group/museum">
                              <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Collection</span>
                              {isEditingMuseum ? (
                                <MuseumAutocomplete 
                                  value={tempMuseum}
                                  onPlaceSelect={(name) => {
                                    setTempMuseum(name);
                                    // Save immediately on selection for better UX
                                    const updatedDetails = { ...details!, museum: name };
                                    setDetails(updatedDetails);
                                    const itemToUpdate = history.find(h => h.details.title === details!.title && h.details.artist === details!.artist);
                                    if (itemToUpdate) {
                                      setHistory(prev => prev.map(h => h.id === itemToUpdate.id ? { ...h, details: updatedDetails } : h));
                                      if (user) {
                                        setDoc(doc(db, `users/${user.uid}/items`, itemToUpdate.id), { details: updatedDetails }, { merge: true });
                                        if (isGalleryPublic) {
                                          setDoc(doc(db, `public_items/${user.uid}/items`, itemToUpdate.id), { details: updatedDetails }, { merge: true });
                                        }
                                      }
                                    }
                                    setIsEditingMuseum(false);
                                  }}
                                  onCancel={() => setIsEditingMuseum(false)}
                                  className="mt-2"
                                />
                              ) : (
                                <div className="flex items-center gap-2 group/mi">
                                  <button 
                                    onClick={() => openEntity(details.museum || '', 'museum')}
                                    className="text-xs font-semibold hover:text-artistic-accent transition-colors text-left"
                                  >
                                    {details.museum}
                                  </button>
                                  {!isViewOnly && (
                                    <button 
                                      onClick={() => { setTempMuseum(details.museum || ''); setIsEditingMuseum(true); }}
                                      className="opacity-0 group-hover/mi:opacity-100 p-1 text-artistic-accent hover:scale-110 transition-all"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {details.location && (
                            <div className="col-span-2 text-left group">
                              <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-2 group-hover:text-artistic-accent group-hover:opacity-100 transition-all">Location</span>
                              {isEditingLocation ? (
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text"
                                    value={tempLocation}
                                    onChange={(e) => setTempLocation(e.target.value)}
                                    className="text-xs font-semibold bg-white border border-artistic-ink/20 rounded px-2 py-1 flex-1 outline-none focus:border-artistic-accent"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLocation()}
                                  />
                                  <button onClick={handleSaveLocation} className="p-1 text-artistic-accent hover:scale-110 transition-transform" title="Save">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setIsEditingLocation(false)} className="p-1 text-red-500 hover:scale-110 transition-transform" title="Cancel">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group/loc">
                                  <span className="text-xs font-semibold group-hover:text-artistic-accent transition-colors">{details.location}</span>
                                  {!isViewOnly && (
                                    <button 
                                      onClick={() => { setTempLocation(details.location || ''); setIsEditingLocation(true); }}
                                      className="opacity-0 group-hover/loc:opacity-100 p-1 text-artistic-accent hover:scale-110 transition-all"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div>
                          <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 block mb-4">Historical Narrative</span>
                          <p className="text-xs leading-[1.8] text-artistic-ink/80 text-justify">
                            {details.historicalContext}
                          </p>
                        </div>

                        {/* Artist Graph Connections */}
                        <div className="pt-12 border-t border-artistic-ink/5">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex flex-col">
                              <span className="text-[11px] uppercase tracking-widest font-bold opacity-40">Artist Graph Connections</span>
                              <span className="text-[11px] opacity-20 uppercase tracking-[0.2em]">Tracing the web of influence</span>
                            </div>
                            {isRecsLoading && <Loader2 className="w-3 h-3 animate-spin opacity-20" />}
                          </div>
                          
                          <div className="space-y-4">
                            {isRecsLoading ? (
                              <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                  <div key={i} className="h-16 w-full bg-artistic-shadow animate-pulse rounded-2xl" />
                                ))}
                              </div>
                            ) : recommendations.length > 0 ? (
                              <div className="grid grid-cols-1 gap-3">
                                {recommendations.slice(0, 5).map((rec, i) => {
                                  const isInHistory = history.some(h => 
                                    (h.details.title.toLowerCase() === rec.title.toLowerCase() || h.details.title.toLowerCase().includes(rec.title.toLowerCase())) && 
                                    (h.details.artist.toLowerCase() === rec.artist.toLowerCase() || h.details.artist.toLowerCase().includes(rec.artist.toLowerCase()))
                                  );
                                  const isInBucketList = bucketList.some(b => 
                                    (b.details.title.toLowerCase() === rec.title.toLowerCase() || b.details.title.toLowerCase().includes(rec.title.toLowerCase())) && 
                                    (b.details.artist.toLowerCase() === rec.artist.toLowerCase() || b.details.artist.toLowerCase().includes(rec.artist.toLowerCase()))
                                  );
                                  const isSaved = isInHistory || isInBucketList;

                                  return (
                                    <motion.button
                                      key={i}
                                      initial={{ opacity: 0, x: 10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.1 }}
                                      onClick={() => handleRecommendationClick(rec)}
                                      className="p-4 bg-white border border-artistic-ink/5 rounded-2xl hover:shadow-lg transition-all text-left flex items-center gap-4 group relative overflow-hidden"
                                    >
                                      {/* Connection Line Visual */}
                                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-artistic-accent/20 group-hover:w-1.5 transition-all" />
                                      
                                      <div className="w-12 h-12 bg-artistic-shadow rounded-xl flex-shrink-0 overflow-hidden relative">
                                        {rec.imageUrl ? (
                                          <img src={rec.imageUrl} className={`w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all ${isSaved ? 'opacity-40' : ''}`} alt={rec.title} />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center opacity-10">
                                            <Compass className="w-6 h-6" />
                                          </div>
                                        )}
                                        {isSaved && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-artistic-ink/10">
                                            {isInHistory ? <HistoryIcon className="w-5 h-5 text-artistic-bg" /> : <Star className="w-5 h-5 text-artistic-accent" />}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          {rec.relationshipType && (
                                            <span className="text-[6px] bg-artistic-accent text-white px-1.5 py-0.5 rounded uppercase font-black tracking-widest">
                                              {rec.relationshipType}
                                            </span>
                                          )}
                                          {rec.relationshipDetail && (
                                            <span className="text-[11px] text-artistic-ink/60 uppercase font-bold tracking-widest truncate">
                                              {rec.relationshipDetail}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-xs font-bold truncate group-hover:text-artistic-accent mb-0.5">{rec.title}</h4>
                                          {isSaved && (
                                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full uppercase tracking-tighter font-black ${isInHistory ? 'bg-artistic-ink text-artistic-bg' : 'bg-artistic-accent text-white'}`}>
                                              {isInHistory ? 'Saved' : 'Bucket'}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[11px] opacity-40 truncate">{rec.artist}</p>
                                      </div>
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        {isSaved ? (
                                          <Check className="w-4 h-4 text-artistic-accent" />
                                        ) : isViewOnly ? (
                                          <ChevronRight className="w-4 h-4 text-artistic-accent" />
                                        ) : (
                                          <PlusCircle className="w-4 h-4 text-artistic-accent" />
                                        )}
                                      </div>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            ) : !isRecsLoading && details && (
                              <p className="text-[11px] italic opacity-30 text-center py-4">No connections found in current archives.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-20 flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-[11px] uppercase tracking-widest font-bold opacity-40 mb-2">Registry Reference</span>
                        <span className="text-xs font-bold">DIGITAL_ARCHIVE_{details.title.toUpperCase().replace(/\s/g, '_')}</span>
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
            if (overrideTarget.id !== 'new') {
              updateArtworkImage(overrideTarget.id, url, overrideTarget.type);
            }
            // Always update the visible image and details if we are in analysis view
            setImage(url);
            
            // If it's a new identification from a recommendation and we updated the image,
            // we should probably trigger a fresh identification if we want to be thorough,
            // but for now updating the URL is what the user asked for.
          }
        }}
        title={overrideTarget ? (
          overrideTarget.id === 'new' ? (details?.title || 'Artwork') :
          overrideTarget.type === 'history' 
            ? history.find(h => h.id === overrideTarget.id)?.details.title || 'Artwork'
            : bucketList.find(b => b.id === overrideTarget.id)?.details.title || 'Artwork'
        ) : 'Artwork'}
        subtitle="Spectral Alignment Required"
        searchQuery={overrideTarget ? (
          overrideTarget.id === 'new' ? `${details?.title} ${details?.artist}` :
          overrideTarget.type === 'history' 
            ? `${history.find(h => h.id === overrideTarget.id)?.details.title} ${history.find(h => h.id === overrideTarget.id)?.details.artist}`
            : `${bucketList.find(b => b.id === overrideTarget.id)?.details.title} ${bucketList.find(b => b.id === overrideTarget.id)?.details.artist}`
        ) : undefined}
      />

      {/* URL Capture Modal */}
      <AnimatePresence>
        {isUrlCaptureOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUrlCaptureOpen(false)}
              className="absolute inset-0 bg-artistic-ink/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full relative shadow-2xl border border-artistic-ink/5"
            >
              <button 
                onClick={() => setIsUrlCaptureOpen(false)}
                className="absolute top-8 right-8 p-2 hover:bg-artistic-shadow rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-10">
                <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent block mb-4">Neural Fetch</span>
                <h2 className="text-3xl font-serif italic tracking-tighter">Remote Capture</h2>
                <p className="mt-4 text-artistic-ink/60 text-xs leading-relaxed">
                  Provide a direct link from Google Photos or any web source to initiate deep analysis.
                </p>
              </div>

              <div className="space-y-6">
                <div className="relative group">
                  <input 
                    type="url"
                    value={captureUrl}
                    onChange={(e) => setCaptureUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-artistic-shadow/30 border border-artistic-ink/5 rounded-2xl px-6 py-4 text-xs outline-none focus:border-artistic-accent transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlCapture(captureUrl)}
                  />
                  <Globe className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20 group-focus-within:opacity-100 group-focus-within:text-artistic-accent transition-all" />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => handleUrlCapture(captureUrl)}
                    className="flex-1 bg-artistic-ink text-artistic-bg py-4 rounded-full text-xs uppercase font-bold tracking-[0.2em] hover:bg-artistic-accent transition-all shadow-lg"
                  >
                    Analyze Link
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <GooglePhotosPicker 
        isOpen={isGooglePhotosOpen}
        onClose={() => setIsGooglePhotosOpen(false)}
        onSelect={(url) => {
          setIsGooglePhotosOpen(false);
          handleUrlCapture(url);
        }}
      />
      <ArtGalleryViewer 
        isOpen={isGalleryViewerOpen}
        isViewOnly={isViewOnly}
        onClose={() => {
          setIsGalleryViewerOpen(false);
          setGalleryTarget(null);
        }}
        images={ galleryTarget ? (
          galleryTarget.type === 'history' 
            ? [
                history.find(h => h.id === galleryTarget.id)?.image || '',
                ...(history.find(h => h.id === galleryTarget.id)?.additionalImages || [])
              ].filter(img => img !== '')
            : [
                bucketList.find(b => b.id === galleryTarget.id)?.image || '',
                ...(bucketList.find(b => b.id === galleryTarget.id)?.additionalImages || [])
              ].filter(img => img !== '')
        ) : [] }
        onUpdateImages={(newImages) => {
          if (!galleryTarget) return;
          // The first image is the main one, others are additional
          const mainImage = newImages[0];
          const additional = newImages.slice(1);
          
          // Update main image if it changed
          const { id, type } = galleryTarget;
          const currentItem = type === 'history' 
            ? history.find(h => h.id === id)
            : bucketList.find(b => b.id === id);
            
          if (currentItem && currentItem.image !== mainImage) {
            updateArtworkImage(id, mainImage, type);
          }
          
          handleUpdateGalleryImages(additional);
        }}
        title={galleryTarget ? (
          galleryTarget.type === 'history' 
            ? history.find(h => h.id === galleryTarget.id)?.details.title || 'Artwork'
            : bucketList.find(b => b.id === galleryTarget.id)?.details.title || 'Artwork'
        ) : 'Artwork'}
        artist={galleryTarget ? (
          galleryTarget.type === 'history' 
            ? history.find(h => h.id === galleryTarget.id)?.details.artist || 'Artist'
            : bucketList.find(b => b.id === galleryTarget.id)?.details.artist || 'Artist'
        ) : 'Artist'}
      />
      <footer className="h-12 bg-artistic-ink text-artistic-bg flex items-center justify-between px-10 text-[11px] uppercase tracking-[0.2em] font-medium shrink-0">
        <div className="flex items-center gap-6">
          <span>Art Curator Engine: Neural V4.2</span>
        </div>
        <div className="hidden sm:block">© 2026 Aura Art Binnacle</div>
        <div className="flex space-x-8">
          <a href="#" className="hover:opacity-60 transition-opacity">Terms</a>
          <a href="#" className="hover:opacity-60 transition-opacity">Privacy</a>
        </div>
      </footer>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*,.heic,.heif" 
        className="hidden" 
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Collection comparison modal */}
      <AnimatePresence>
        {showComparison && isViewOnly && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowComparison(false)}
            className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
            >
              {(() => {
                // history here is the shared gallery; we need to compare with a locally-stored "my" collection
                // We compare movements, artists, years
                const sharedMovements = new Set(history.map(i => i.details.movement).filter(Boolean));
                const sharedArtists = new Set(history.map(i => i.details.artist).filter(Boolean));
                const sharedTitles = new Set(history.map(i => i.details.title));

                // We don't have the user's own collection in view-only mode (history is the shared one)
                // So pull from localStorage as a fallback
                let myItems: HistoryItem[] = [];
                try { myItems = JSON.parse(localStorage.getItem('art_curator_history') || '[]'); } catch {}

                const myMovements = new Set(myItems.map((i: HistoryItem) => i.details.movement).filter(Boolean));
                const myArtists = new Set(myItems.map((i: HistoryItem) => i.details.artist).filter(Boolean));

                const sharedMovArr = Array.from(sharedMovements) as string[];
                const myMovArr = Array.from(myMovements) as string[];
                const commonMovements = sharedMovArr.filter(m => myMovements.has(m));
                const commonArtists = (Array.from(sharedArtists) as string[]).filter(a => myArtists.has(a));
                const overlapPct = sharedTitles.size > 0
                  ? Math.round((myItems.filter(i => sharedTitles.has(i.details.title)).length / sharedTitles.size) * 100)
                  : 0;

                return (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-serif italic">Collection Comparison</h3>
                      <button onClick={() => setShowComparison(false)} className="p-1 hover:bg-artistic-shadow rounded-full transition-colors"><X className="w-4 h-4" /></button>
                    </div>

                    {myItems.length === 0 ? (
                      <p className="text-sm text-artistic-ink/50 text-center py-8">Sign in and scan artworks to compare your collection.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-4 mb-8">
                          <div className="text-center p-4 bg-artistic-shadow/30 rounded-2xl">
                            <p className="text-3xl font-serif font-bold text-artistic-accent">{overlapPct}%</p>
                            <p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Overlap</p>
                          </div>
                          <div className="text-center p-4 bg-artistic-shadow/30 rounded-2xl">
                            <p className="text-3xl font-serif font-bold">{commonMovements.length}</p>
                            <p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Shared Movements</p>
                          </div>
                          <div className="text-center p-4 bg-artistic-shadow/30 rounded-2xl">
                            <p className="text-3xl font-serif font-bold">{commonArtists.length}</p>
                            <p className="text-[11px] uppercase tracking-widest opacity-40 mt-1">Shared Artists</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-[11px] uppercase tracking-widest font-bold opacity-40 mb-3">Their movements</p>
                            <div className="space-y-1">
                              {sharedMovArr.slice(0, 6).map(m => (
                                <div key={m} className={`text-xs py-1 px-3 rounded-full font-bold ${commonMovements.includes(m) ? 'bg-artistic-accent/10 text-artistic-accent' : 'bg-artistic-shadow/50 text-artistic-ink/60'}`}>
                                  {m} {commonMovements.includes(m) && '✓'}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-widest font-bold opacity-40 mb-3">Your movements</p>
                            <div className="space-y-1">
                              {myMovArr.slice(0, 6).map(m => (
                                <div key={m} className={`text-xs py-1 px-3 rounded-full font-bold ${commonMovements.includes(m) ? 'bg-artistic-accent/10 text-artistic-accent' : 'bg-artistic-shadow/50 text-artistic-ink/60'}`}>
                                  {m} {commonMovements.includes(m) && '✓'}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {commonMovements.length > 0 && (
                          <p className="text-xs text-center mt-6 opacity-40 italic">
                            You both appreciate: {commonMovements.slice(0, 3).join(', ')}{commonMovements.length > 3 ? ` and ${commonMovements.length - 3} more` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Milestone celebration modal */}
      <AnimatePresence>
        {milestone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMilestone(null)}
            className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="text-5xl mb-4">{milestone.emoji}</div>
              <h3 className="text-2xl font-serif italic mb-2">{milestone.title}</h3>
              <p className="text-sm text-artistic-ink/50 mb-8">{milestone.subtitle}</p>
              <button
                onClick={() => {
                  const canvas = document.createElement('canvas');
                  canvas.width = 800; canvas.height = 800;
                  const ctx = canvas.getContext('2d')!;
                  ctx.fillStyle = '#F5F0E8';
                  ctx.fillRect(0, 0, 800, 800);
                  ctx.fillStyle = '#1A1A1A';
                  ctx.font = 'bold 48px serif';
                  ctx.textAlign = 'center';
                  ctx.fillText(milestone.emoji, 400, 280);
                  ctx.font = 'bold 52px serif';
                  ctx.fillText(milestone.title, 400, 380);
                  ctx.font = '24px serif';
                  ctx.fillStyle = '#888';
                  ctx.fillText('AURA – The Art Binnacle', 400, 520);
                  canvas.toBlob(blob => {
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'aura-milestone.png'; a.click();
                    URL.revokeObjectURL(url);
                  });
                }}
                className="w-full py-3 bg-artistic-ink text-white text-xs uppercase font-bold tracking-widest rounded-full hover:bg-artistic-accent transition-colors mb-3"
              >
                Share Card
              </button>
              <button onClick={() => setMilestone(null)} className="text-xs uppercase font-bold tracking-widest opacity-30 hover:opacity-60 transition-opacity">
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxSrc(null)}
            className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center cursor-zoom-out p-4"
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightboxSrc}
              alt="Full size artwork"
              className="max-w-full max-h-full object-contain select-none"
              onClick={e => e.stopPropagation()}
            />
            <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Undo-delete toasts */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
        <AnimatePresence>
          {pendingDeletes.map(pd => (
            <motion.div
              key={pd.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="pointer-events-auto flex items-center gap-4 bg-artistic-ink text-artistic-bg px-5 py-3 rounded-full shadow-2xl text-xs font-bold uppercase tracking-widest"
            >
              <span className="opacity-70">"{pd.item.details.title.substring(0, 28)}{pd.item.details.title.length > 28 ? '…' : ''}" deleted</span>
              <button
                onClick={() => undoDelete(pd.id)}
                className="text-artistic-accent hover:text-white transition-colors tracking-widest"
              >
                Undo
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
    </APIProvider>
  );
}
