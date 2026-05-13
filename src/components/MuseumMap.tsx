/// <reference types="google.maps" />
import React, { useEffect, useState, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { HistoryItem } from '../types';
import { Loader2, MapPin, Navigation, Info, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MuseumMapProps {
  items: HistoryItem[];
  onArtworkClick: (id: string) => void;
  className?: string;
}

/**
 * Renders a marker for a specific artwork or group of artworks at a location.
 */
interface ArtworkMarkerProps {
  locationName: string;
  artworks: HistoryItem[];
  onArtworkClick: (id: string) => void;
}

const ArtworkMarker: React.FC<ArtworkMarkerProps> = ({ 
  locationName, 
  artworks, 
  onArtworkClick 
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoWindowShown, setInfoWindowShown] = useState(false);

  useEffect(() => {
    if (!placesLib || !locationName || !map) return;

    // Use Text Search to find the location coordinates
    placesLib.Place.searchByText({
      textQuery: locationName,
      fields: ['location', 'displayName', 'formattedAddress'],
      maxResultCount: 1
    }).then(({ places }) => {
      if (places && places.length > 0 && places[0].location) {
        setPosition({
          lat: places[0].location.lat(),
          lng: places[0].location.lng()
        });
      }
    }).catch(err => console.error(`Error finding location ${locationName}:`, err));
  }, [placesLib, locationName, map]);

  if (!position) return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        onClick={() => setInfoWindowShown(true)}
      >
        <div className="relative group">
          <div className="w-10 h-10 bg-white shadow-xl rounded-full border-2 border-artistic-accent flex items-center justify-center overflow-hidden hover:scale-110 transition-transform">
            {artworks[0].image ? (
              <img src={artworks[0].image} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" alt={locationName} />
            ) : (
              <MapPin className="w-5 h-5 text-artistic-accent" />
            )}
          </div>
          {artworks.length > 1 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-artistic-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {artworks.length}
            </div>
          )}
        </div>
      </AdvancedMarker>

      {infoWindowShown && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => setInfoWindowShown(false)}
        >
          <div className="p-2 min-w-[200px] max-w-[300px]">
            <h4 className="text-xs font-bold uppercase tracking-widest text-artistic-accent mb-2">{locationName}</h4>
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {artworks.map((art) => (
                <div 
                  key={art.id} 
                  onClick={() => onArtworkClick(art.id)}
                  className="flex gap-3 cursor-pointer group hover:bg-gray-50 p-1 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                    <img src={art.image} className="w-full h-full object-cover" alt={art.details.title} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold truncate group-hover:text-artistic-accent">{art.details.title}</p>
                    <p className="text-[9px] opacity-60 italic">{art.details.year}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const MuseumMap: React.FC<MuseumMapProps> = ({ items, onArtworkClick, className = "h-full w-full" }) => {
  const groupedArtworks = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};
    items.forEach(item => {
      const loc = item.details.museum || item.details.location || 'Unknown Location';
      if (loc === 'Unknown Location') return;
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(item);
    });
    return groups;
  }, [items]);

  if (!hasValidKey) {
    return (
      <div className={`${className} bg-artistic-shadow/30 rounded-3xl flex flex-col items-center justify-center p-12 text-center border border-dashed border-artistic-ink/10`}>
        <div className="max-w-md space-y-6">
          <MapPin className="w-12 h-12 text-artistic-ink/20 mx-auto" />
          <h2 className="text-xl font-serif italic">Global Heritage Mapping Requires Access</h2>
          <p className="text-xs text-artistic-ink/60 leading-relaxed">
            To visualize the geographical footprint of your collection, please provide a Google Maps Platform API Key in your project secrets.
          </p>
          <div className="bg-white/50 backdrop-blur p-6 rounded-2xl text-left border border-artistic-ink/5 space-y-4">
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-40 italic">Configuration Steps:</p>
            <ul className="text-[10px] font-bold space-y-2">
              <li className="flex gap-2">
                <span className="text-artistic-accent">1.</span>
                <span>Open <span className="p-1 bg-gray-100 rounded">Settings</span> (Gear icon, top-right)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-artistic-accent">2.</span>
                <span>Go to <span className="p-1 bg-gray-100 rounded">Secrets</span></span>
              </li>
              <li className="flex gap-2">
                <span className="text-artistic-accent">3.</span>
                <span>Add <span className="p-1 bg-gray-100 rounded">GOOGLE_MAPS_PLATFORM_KEY</span></span>
              </li>
            </ul>
          </div>
          <a 
            href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block px-8 py-3 bg-artistic-ink text-artistic-bg rounded-full text-[10px] uppercase font-bold tracking-widest hover:bg-artistic-accent transition-all"
          >
            Create API Key
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative rounded-3xl overflow-hidden shadow-2xl border border-artistic-ink/5`}>
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={{ lat: 20, lng: 0 }}
          defaultZoom={2.5}
          mapId="e5d233633e68065" // Generic Light Theme ID
          disableDefaultUI={false}
          gestureHandling="greedy"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {(Object.entries(groupedArtworks) as [string, HistoryItem[]][]).map(([location, arts]) => (
            <ArtworkMarker 
              key={location} 
              locationName={location} 
              artworks={arts} 
              onArtworkClick={onArtworkClick} 
            />
          ))}
        </Map>
      </APIProvider>
      
      {/* Decorative Overlay */}
      <div className="absolute top-6 left-6 p-4 bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-artistic-ink/5 pointer-events-none z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-artistic-accent flex items-center justify-center">
            <Navigation className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-black">Heritage Navigator</h3>
            <p className="text-[9px] opacity-40 font-bold">Spatial Distribution of Masterpieces</p>
          </div>
        </div>
      </div>
    </div>
  );
};
