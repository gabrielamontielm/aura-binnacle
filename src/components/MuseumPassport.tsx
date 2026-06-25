import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, CheckCircle, Navigation, Globe, Info, Loader2 } from 'lucide-react';
import { MuseumStamp, HistoryItem } from '../types';

import { MUSEUMS } from '../constants';

interface MuseumPassportProps {
  stamps: MuseumStamp[];
  history: HistoryItem[];
  onCheckIn: (stamp: MuseumStamp) => void;
  isViewOnly?: boolean;
}


export const MuseumPassport: React.FC<MuseumPassportProps> = ({ stamps, history, onCheckIn, isViewOnly }) => {
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getArtworksForMuseum = (museumId: string) => {
    const museum = MUSEUMS.find(m => m.id === museumId);
    if (!museum) return [];
    return history.filter(item => 
      item.details.museum && 
      museum.keywords.some(keyword => item.details.museum?.toLowerCase().includes(keyword.toLowerCase()))
    );
  };

  // Get all unique museums from history that aren't in MUSEUMS
  const getOtherMuseums = () => {
    const otherMuseums: { name: string, count: number }[] = [];
    history.forEach(item => {
      const museumName = item.details.museum;
      if (!museumName || museumName.toLowerCase() === 'unknown') return;

      const isMajor = MUSEUMS.some(m => m.keywords.some(k => museumName.toLowerCase().includes(k.toLowerCase())));
      if (isMajor) return;

      const existing = otherMuseums.find(om => om.name.toLowerCase() === museumName.toLowerCase());
      if (existing) {
        existing.count++;
      } else {
        otherMuseums.push({ name: museumName, count: 1 });
      }
    });
    return otherMuseums.sort((a, b) => b.count - a.count);
  };

  const handleDigitalClaim = (museumId: string) => {
    const artworks = getArtworksForMuseum(museumId);
    const museum = MUSEUMS.find(m => m.id === museumId);
    if (artworks.length > 0 && museum) {
      onCheckIn({
        id: `scan-${museum.id}-${Date.now()}`,
        museumId: museum.id,
        museumName: museum.name,
        timestamp: Date.now(),
        location: { lat: 0, lng: 0 } // Marked as 0,0 to denote scan-based
      });
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleCheckIn = () => {
    setIsCheckingIn(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setIsCheckingIn(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        let found = false;

        for (const museum of MUSEUMS) {
          const distance = calculateDistance(latitude, longitude, museum.lat, museum.lng);
          // Standard check-in radius: 1km
          if (distance < 1) {
            const alreadyStamped = stamps.some(s => s.museumId === museum.id);
            if (alreadyStamped) {
                setError(`You already have a stamp from ${museum.name}!`);
            } else {
                onCheckIn({
                  id: Date.now().toString(),
                  museumId: museum.id,
                  museumName: museum.name,
                  timestamp: Date.now(),
                  location: { lat: latitude, lng: longitude }
                });
            }
            found = true;
            break;
          }
        }

        if (!found) {
          setError("You don't seem to be near a major museum. Try checking in when you visit!");
        }
        setIsCheckingIn(false);
      },
      (err) => {
        setError("Unable to retrieve your location. Please check permissions.");
        setIsCheckingIn(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <span className="text-xs uppercase tracking-[0.4em] font-bold text-artistic-accent block mb-2">Heritage Proof</span>
          <h2 className="text-3xl md:text-5xl font-serif tracking-tighter italic">Museum Passport</h2>
          <p className="text-xs text-artistic-ink/40 mt-4 max-w-md italic">
            Check into physical museum locations to unlock exclusive digital stamps, or claim them by identifying artworks from their prestigious collections in your gallery.
          </p>
        </div>
        
        {!isViewOnly && (
          <button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            className="flex items-center gap-3 px-8 py-4 bg-artistic-ink text-artistic-bg rounded-2xl text-[11px] uppercase font-bold tracking-[0.3em] hover:bg-artistic-accent transition-all shadow-xl shadow-artistic-ink/10 disabled:opacity-50"
          >
            {isCheckingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            <span>{isCheckingIn ? 'Locating...' : 'Stamp My Passport'}</span>
          </button>
        )}
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-xs italic"
        >
          <Info className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
        {MUSEUMS.map((museum) => {
          const stamp = stamps.find(s => s.museumId === museum.id);
          const isStamped = !!stamp;
          const museumArtworks = getArtworksForMuseum(museum.id);
          const artworkCount = museumArtworks.length;

          return (
            <motion.div
              key={museum.id}
              whileHover={isStamped ? { y: -10, rotate: 1 } : {}}
              className="aspect-square relative group"
            >
              <div className={`w-full h-full rounded-full border-2 flex flex-col items-center justify-center p-6 text-center transition-all duration-700 ${isStamped ? (stamp.location.lat === 0 ? 'bg-artistic-accent/10 border-artistic-accent/30' : 'bg-artistic-shadow/30 border-artistic-ink/10 shadow-inner') : 'bg-transparent border-dashed border-artistic-ink/5 opacity-20'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isStamped ? 'bg-white shadow-sm' : 'bg-artistic-shadow'}`}>
                  {isStamped ? <CheckCircle className={`w-6 h-6 ${stamp.location.lat === 0 ? 'text-artistic-accent' : 'text-green-500'}`} /> : <Navigation className="w-6 h-6" />}
                </div>
                <span className="text-xs font-black uppercase tracking-widest leading-tight mb-1">{museum.name}</span>
                <span className="text-[11px] opacity-40 uppercase tracking-widest mb-2">{museum.city}</span>
                
                {artworkCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-artistic-ink/5 rounded-full mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-60">{artworkCount} {artworkCount === 1 ? 'Piece' : 'Pieces'}</span>
                  </div>
                )}

                {isStamped && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 group-hover:opacity-20 transition-opacity">
                    <Globe className="w-24 h-24" />
                  </div>
                )}
                
                {isStamped && (
                    <span className="absolute bottom-4 text-[11px] font-mono opacity-20">
                        {stamp.location.lat === 0 ? 'DIGITAL SCAN' : new Date(stamp.timestamp).toLocaleDateString()}
                    </span>
                )}

                {!isStamped && artworkCount > 0 && !isViewOnly && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => handleDigitalClaim(museum.id)}
                    className="absolute -bottom-2 px-3 py-1 bg-artistic-accent text-white text-[11px] font-bold uppercase tracking-widest rounded-full shadow-lg"
                  >
                    Claim via Scan
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="pt-12 border-t border-artistic-ink/5">
        <div className="flex flex-col lg:flex-row justify-between gap-12">
            <div className="flex items-center gap-10">
                <div className="flex -space-x-4">
                    {[...Array(Math.min(4, stamps.length + 1))].map((_, i) => (
                        <div key={i} className="w-12 h-12 rounded-full border-4 border-artistic-bg bg-artistic-shadow overflow-hidden flex items-center justify-center">
                            <MapPin className={`w-4 h-4 ${i < stamps.length ? 'text-artistic-accent' : 'opacity-10'}`} />
                        </div>
                    ))}
                </div>
                <div>
                    <span className="text-[11px] uppercase tracking-widest font-black opacity-40 block mb-1">Passport Status</span>
                    <p className="text-xl font-serif italic text-artistic-ink">
                        {stamps.length} of {MUSEUMS.length} Major Galleries Visited
                    </p>
                </div>
            </div>

            {getOtherMuseums().length > 0 && (
              <div className="flex-1 max-w-xl">
                 <span className="text-[11px] uppercase tracking-widest font-black opacity-40 block mb-4">Field Discoveries — Local & Independent Records</span>
                 <div className="flex flex-wrap gap-2">
                    {getOtherMuseums().map((m, i) => (
                      <div key={i} className="px-3 py-2 bg-artistic-shadow/30 rounded-xl border border-artistic-ink/5 flex items-center gap-3">
                        <Globe className="w-3 h-3 opacity-30" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">{m.name}</span>
                        <span className="text-[11px] font-mono opacity-40">[{m.count}]</span>
                      </div>
                    ))}
                 </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
