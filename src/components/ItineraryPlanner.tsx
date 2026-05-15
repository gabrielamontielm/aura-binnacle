import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Navigation, Clock, Sparkles, Map as MapIcon, ChevronRight, Info, Loader2, ArrowLeft, Ticket, PlusCircle, CheckCircle2 } from 'lucide-react';
import { HistoryItem } from '../types';
import { generateItinerary, ItineraryRoute } from '../services/artService';
import { MUSEUMS } from '../constants';

interface ItineraryPlannerProps {
  bucketList: HistoryItem[];
  userInterests: string[];
  onArtworkClick: (id: string) => void;
  onAddToBucketList: (title: string, artist: string, museum: string, imageUrl?: string) => void;
}

export const ItineraryPlanner: React.FC<ItineraryPlannerProps> = ({ bucketList, userInterests, onArtworkClick, onAddToBucketList }) => {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cityGroups = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};
    
    bucketList.forEach(item => {
      let city = 'Unknown';
      
      // Try to find city from MUSEUMS constant first
      const museumMatch = item.details.museum ? MUSEUMS.find(m => 
        m.keywords.some(k => item.details.museum?.toLowerCase().includes(k.toLowerCase()))
      ) : null;

      if (museumMatch) {
        city = museumMatch.city;
      } else if (item.details.location) {
        // Location format is usually "City, Country"
        const parts = item.details.location.split(',');
        city = parts[0].trim();
      }

      if (city === 'Unknown') return;

      if (!groups[city]) groups[city] = [];
      groups[city].push(item);
    });

    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length);
  }, [bucketList]);

  const handlePlanRoute = async (city: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedCity(city);
    
    try {
      const cityWorks = cityGroups.find(g => g[0] === city)?.[1] || [];
      const artworks = cityWorks.map(w => ({
        title: w.details.title,
        museum: w.details.museum || 'Local Collection'
      }));

      const result = await generateItinerary(city, artworks, userInterests);
      setItinerary(result);
    } catch (err) {
      console.error(err);
      setError("Failed to curate your Masterpiece Route. High demand at the archive, please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const currentWorksInItinerary = useMemo(() => {
    if (!selectedCity) return [];
    return cityGroups.find(g => g[0] === selectedCity)?.[1] || [];
  }, [selectedCity, cityGroups]);

  if (!selectedCity) {
    return (
      <div className="p-10 max-w-4xl mx-auto">
        <div className="mb-12">
            <h2 className="text-3xl font-serif italic text-artistic-ink mb-2">Masterpiece Routes</h2>
            <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-30">Strategic Discovery Planner</p>
        </div>

        {cityGroups.length === 0 ? (
          <div className="p-12 bg-artistic-shadow/20 rounded-3xl border border-dashed border-artistic-ink/10 text-center">
            <MapIcon className="w-10 h-10 opacity-10 mx-auto mb-4" />
            <p className="text-xs italic opacity-40">Add artworks with known locations to your Bucket List to unlock route planning.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cityGroups.map(([city, items]) => (
              <motion.button
                key={city}
                whileHover={{ y: -4 }}
                onClick={() => handlePlanRoute(city)}
                className="p-6 bg-white rounded-2xl border border-artistic-ink/5 shadow-sm hover:shadow-xl transition-all text-left flex items-center justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-3 h-3 text-artistic-accent" />
                    <span className="text-xs font-black uppercase tracking-widest">{city}</span>
                  </div>
                  <p className="text-xl font-serif italic text-artistic-ink">
                    {items.length} {items.length === 1 ? 'Masterpiece' : 'Masterpieces'} Awaiting
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-artistic-shadow flex items-center justify-center opacity-40 group-hover:opacity-100 group-hover:bg-artistic-accent group-hover:text-white transition-all">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <button 
        onClick={() => { setSelectedCity(null); setItinerary(null); }}
        className="flex items-center gap-2 text-[9px] uppercase font-bold tracking-widest opacity-40 hover:opacity-100 mb-8 transition-opacity"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to Regions
      </button>

      {isLoading ? (
        <div className="p-20 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-artistic-accent mb-6" />
          <p className="font-serif italic text-xl text-artistic-ink">Curating your path through {selectedCity}...</p>
          <p className="text-[9px] uppercase tracking-widest opacity-30 mt-2 text-center">Optimizing route, grouping collections, and synthesizing insights.</p>
        </div>
      ) : error ? (
        <div className="p-20 text-center">
            <p className="text-red-500 text-sm mb-6">{error}</p>
            <button 
                onClick={() => handlePlanRoute(selectedCity)}
                className="px-6 py-2 bg-artistic-ink text-artistic-bg rounded-full text-[10px] uppercase font-black"
            >
                Retry Curation
            </button>
        </div>
      ) : itinerary && (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
        >
          <div className="relative p-10 bg-artistic-ink text-artistic-bg rounded-[2.5rem] overflow-hidden">
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                    <span className="px-3 py-1 bg-artistic-accent text-[8px] font-black uppercase tracking-[0.2em] rounded-full">Active Itinerary</span>
                    <span className="text-[10px] font-mono opacity-40">Ref: {selectedCity.substring(0, 3).toUpperCase()}-{Date.now().toString().slice(-6)}</span>
                </div>
                <h2 className="text-4xl font-serif italic mb-4">The {selectedCity} Expedition</h2>
                <p className="text-lg opacity-80 font-serif leading-relaxed max-w-2xl">{itinerary.summary}</p>
            </div>
            <div className="absolute top-0 right-0 p-12 opacity-10">
                <MapIcon className="w-48 h-48" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-[1px] flex-1 bg-artistic-ink/10" />
                <span className="text-[9px] uppercase tracking-[0.4em] font-black opacity-30">Sequence of Discovery</span>
                <div className="h-[1px] flex-1 bg-artistic-ink/10" />
              </div>

              {itinerary.route.sort((a, b) => a.order - b.order).map((step, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex gap-8 group"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full border-2 border-artistic-accent flex items-center justify-center text-artistic-accent font-serif italic text-xl group-hover:bg-artistic-accent group-hover:text-white transition-all">
                      {step.order}
                    </div>
                    {idx < itinerary.route.length - 1 && (
                      <div className="w-[2px] flex-1 bg-gradient-to-b from-artistic-accent/40 to-transparent mt-4" />
                    )}
                  </div>
                  
                  <div className="flex-1 pb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-serif italic text-artistic-ink">{step.museum}</h3>
                      <div className="px-3 py-1 bg-artistic-shadow rounded-full text-[8px] font-black uppercase tracking-widest opacity-40">
                         {step.works.length} {step.works.length === 1 ? 'Work' : 'Works'}
                      </div>
                    </div>

                    <div className="p-6 bg-white rounded-2xl border border-artistic-ink/5 shadow-sm hover:shadow-md transition-shadow mb-4">
                      <div className="flex flex-wrap gap-2 mb-6">
                        {step.works.map((work, wIdx) => {
                          const workData = currentWorksInItinerary.find(w => w.details.title.toLowerCase() === work.toLowerCase());
                          return (
                            <button
                              key={wIdx}
                              onClick={() => workData && onArtworkClick(workData.id)}
                              className="px-4 py-2 bg-artistic-shadow/40 rounded-xl text-[10px] font-bold tracking-tight hover:bg-artistic-accent hover:text-white transition-all flex items-center gap-2 group/work"
                            >
                              <Sparkles className="w-3 h-3 opacity-30 group-hover/work:opacity-100" />
                              {work}
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="flex gap-4">
                        <div className="mt-1">
                          <Info className="w-4 h-4 text-artistic-accent opacity-40" />
                        </div>
                        <p className="text-xs leading-relaxed text-artistic-ink/70 italic">
                          {step.insight}
                        </p>
                      </div>
                    </div>
                    
                    <button className="flex items-center gap-2 text-[8px] uppercase font-black tracking-widest text-artistic-accent hover:underline">
                      <Ticket className="w-3 h-3" />
                      Check Opening Hours
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="space-y-8">
              <div className="p-8 bg-artistic-shadow/20 rounded-[2rem] border border-artistic-ink/5">
                <div className="flex items-center gap-2 mb-6">
                  <Navigation className="w-4 h-4 text-artistic-accent" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Travel Strategy</h4>
                </div>
                <div className="space-y-6">
                    <p className="text-xs leading-relaxed text-artistic-ink font-serif italic">
                        {itinerary.travelTips}
                    </p>
                    <div className="pt-6 border-t border-artistic-ink/10">
                        <div className="flex items-center gap-4 mb-4">
                            <Clock className="w-4 h-4 opacity-20" />
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Estimated Duration: 1 Day</span>
                        </div>
                        <button className="w-full py-4 bg-artistic-ink text-artistic-bg rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-artistic-accent transition-colors flex items-center justify-center gap-3 shadow-xl shadow-artistic-ink/10">
                            <MapIcon className="w-4 h-4" />
                            Open in Google Maps
                        </button>
                    </div>
                </div>
              </div>

              <div className="p-8 bg-artistic-accent/5 rounded-[2rem] border border-artistic-accent/10">
                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-4 opacity-40">Discovery Progress</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-2xl font-serif italic">{(itinerary.route.length / MUSEUMS.length * 100).toFixed(0)}%</span>
                    <span className="text-[8px] font-bold uppercase opacity-30">City Coverage</span>
                  </div>
                  <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(itinerary.route.length / MUSEUMS.length * 100)}%` }}
                        className="h-full bg-artistic-accent" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {itinerary.suggestions && itinerary.suggestions.length > 0 && (
            <div className="pt-20">
              <div className="flex items-center gap-4 mb-10">
                <div className="h-[1px] flex-1 bg-artistic-ink/10" />
                <span className="text-[9px] uppercase tracking-[0.4em] font-black opacity-30">Expert Recommendations</span>
                <div className="h-[1px] flex-1 bg-artistic-ink/10" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {itinerary.suggestions.map((suggestion, sIdx) => {
                  const isInBucketList = bucketList.some(b => b.details.title.toLowerCase() === suggestion.title.toLowerCase());
                  
                  return (
                    <motion.div 
                      key={sIdx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + (sIdx * 0.1) }}
                      className="p-6 bg-artistic-shadow/10 rounded-[2rem] border border-artistic-ink/5 flex flex-col group relative overflow-hidden"
                    >
                      <div className="mb-4">
                          <span className="text-[7px] font-black uppercase tracking-widest px-2 py-1 bg-artistic-accent/10 text-artistic-accent rounded-full mb-3 inline-block">Curator's Choice</span>
                          <h5 className="font-serif italic text-lg leading-tight mb-1">{suggestion.title}</h5>
                          <p className="text-[9px] font-bold uppercase opacity-40">{suggestion.artist} • {suggestion.museum}</p>
                      </div>
                      <p className="text-[10px] leading-relaxed text-artistic-ink/60 mb-6 flex-1 italic">
                          "{suggestion.reason}"
                      </p>
                      <button 
                        disabled={isInBucketList}
                        onClick={() => !isInBucketList && onAddToBucketList(suggestion.title, suggestion.artist, suggestion.museum, suggestion.imageUrl)}
                        className={`w-full py-3 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group/btn ${isInBucketList ? 'bg-green-50 text-green-600 border border-green-100 cursor-default' : 'bg-white border border-artistic-ink/5 hover:bg-artistic-ink hover:text-white'}`}
                      >
                        {isInBucketList ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            In Bucket List
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3 text-artistic-accent group-hover/btn:text-white" />
                            Add to Bucket List
                          </>
                        )}
                      </button>
                      
                      <div className="absolute -top-2 -right-2 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Sparkles className="w-12 h-12" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};
