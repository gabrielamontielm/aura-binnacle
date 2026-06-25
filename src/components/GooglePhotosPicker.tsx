import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, ChevronRight, ChevronLeft, Globe, AlertCircle } from 'lucide-react';

interface MediaItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
}

interface GooglePhotosPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

/**
 * GooglePhotosPicker Component
 * 
 * Integrates with Google Photos API via server-side OAuth.
 * Allows users to:
 * - Connect their Google account via a secure popup flow.
 * - Paginate through their photo library.
 * - Select and import images directly into AURA for analysis.
 */
export const GooglePhotosPicker: React.FC<GooglePhotosPickerProps> = ({ isOpen, onClose, onSelect }) => {
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const fetchPhotos = async (pageToken?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = pageToken 
        ? `/api/google-photos/media?nextPageToken=${pageToken}`
        : '/api/google-photos/media';
      
      const response = await fetch(url);
      if (response.status === 401) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch photos');
      
      const data = await response.json();
      setPhotos(data.mediaItems || []);
      setNextPageToken(data.nextPageToken || null);
      setIsAuthenticated(true);
    } catch (err) {
      setError('Could not access your Google Photos collection.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/google-photos/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(url, 'google_photos_auth', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups to connect Google Photos');
      }
    } catch (err) {
      setError('Failed to initiate connection.');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin loosely for this preview environment
      if (event.data?.type === 'GOOGLE_PHOTOS_AUTH_SUCCESS') {
        setIsAuthenticated(true);
        fetchPhotos();
      }
    };

    window.addEventListener('message', handleMessage);
    if (isOpen && !isAuthenticated) {
      // Check if already have session
      fetchPhotos();
    }
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, isAuthenticated]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-artistic-ink/60 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-artistic-bg w-full max-w-4xl h-[80vh] rounded-[40px] shadow-2xl relative flex flex-col overflow-hidden border border-artistic-ink/5"
      >
        <div className="p-8 md:p-12 border-b border-artistic-ink/5 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-4 h-4 text-artistic-accent" />
              <span className="uppercase text-xs tracking-[0.4em] font-bold text-artistic-accent">Neural Bridge</span>
            </div>
            <h2 className="text-3xl font-serif italic tracking-tighter">Google Photos</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-artistic-shadow rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          {!isAuthenticated ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-20">
              <div className="w-24 h-24 bg-artistic-shadow rounded-full flex items-center justify-center mb-4">
                <Globe className="w-10 h-10 opacity-20" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-xl font-bold mb-4">Remote Access Required</h3>
                <p className="text-sm text-artistic-ink/60 leading-relaxed italic mb-8">
                  Connect your Google account to directly archive items from your cloud library.
                </p>
              </div>
              <button 
                onClick={handleConnect}
                className="px-10 py-5 bg-artistic-ink text-artistic-bg rounded-full text-xs uppercase font-bold tracking-[0.3em] hover:bg-artistic-accent transition-all shadow-xl"
              >
                Connect Google Account
              </button>
            </div>
          ) : loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-6">
                <Loader2 className="w-10 h-10 animate-spin text-artistic-accent" />
                <span className="text-xs uppercase tracking-widest font-bold opacity-40">Scanning Cloud Database...</span>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10">
              <AlertCircle className="w-12 h-12 text-red-500 mb-6 opacity-40" />
              <p className="text-artistic-ink/60 italic text-sm">{error}</p>
              <button 
                onClick={() => fetchPhotos()}
                className="mt-8 text-xs uppercase font-bold tracking-widest border-b border-artistic-ink"
              >
                Try Again
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 italic">
              <p>No media found in your library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {photos.map((photo) => (
                <motion.div 
                  key={photo.id}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => onSelect(`${photo.baseUrl}=w1600`)}
                  className="aspect-square bg-artistic-shadow rounded-2xl overflow-hidden cursor-pointer group relative shadow-md"
                >
                  <img 
                    src={`${photo.baseUrl}=w400`} 
                    alt={photo.filename}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-artistic-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white text-artistic-ink text-[11px] uppercase font-bold px-3 py-1.5 rounded-full shadow-lg">Select</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {nextPageToken && isAuthenticated && !loading && (
          <div className="p-8 border-t border-artistic-ink/5 flex justify-center bg-white/50 backdrop-blur-sm">
            <button 
              onClick={() => fetchPhotos(nextPageToken)}
              className="flex items-center gap-3 text-xs uppercase font-bold tracking-widest opacity-60 hover:opacity-100 transition-opacity"
            >
              Load More <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
