import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, MapPin, Calendar, ArrowRight, Star, Plus, Check, Search, Globe, Palette, Box, Building, Brush } from 'lucide-react';
import { ValidatedImage } from './ValidatedImage';
import { EntityDetails, ArtDetails } from '../services/artService';

const getTypeIcon = (type: string) => {
  const normalizedType = type.toLowerCase();
  
  if (normalizedType.includes('sculpt')) return Box;
  if (normalizedType.includes('paint')) return Palette;
  if (normalizedType.includes('architect')) return Building;
  if (normalizedType.includes('brush') || normalizedType.includes('draw') || normalizedType.includes('sketch')) return Brush;
  
  return BookOpen; // Default icon
};

interface EntityViewerProps {
  details: EntityDetails;
  relatedArtworks: { id: string, image: string, details: ArtDetails }[];
  history: { id: string, image: string, details: ArtDetails }[];
  onArtworkClick: (id: string) => void;
  onEntityClick: (name: string, type: 'artist' | 'movement' | 'museum' | 'type' | 'location') => void;
  onAddToBucketList: (work: any) => void;
  bucketListWorks: any[];
  relatedBucketList: { id: string, image: string, details: ArtDetails }[];
  onBack: () => void;
  onUpdateFamousWorkImage: (workTitle: string, imageUrl: string) => void;
}

import { ImageOverrideModal } from './ImageOverrideModal';

export const EntityViewer: React.FC<EntityViewerProps> = ({ details, relatedArtworks, history, onArtworkClick, onEntityClick, onAddToBucketList, bucketListWorks, relatedBucketList, onBack, onUpdateFamousWorkImage }) => {
  const [editingWorkIndex, setEditingWorkIndex] = React.useState<number | null>(null);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col lg:flex-row h-full min-h-screen bg-artistic-bg w-full"
    >
      {/* Visual / Introduction Side */}
      <div className="w-full lg:w-1/2 p-10 lg:p-20 flex flex-col justify-center bg-white border-r border-artistic-ink/5 relative lg:sticky lg:top-0 lg:h-screen overflow-y-auto">
        <button 
          onClick={onBack}
          className="absolute top-8 left-8 flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest opacity-40 hover:opacity-100 hover:text-artistic-accent transition-all group"
        >
          <ArrowRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" />
          <span>Back to previous</span>
        </button>
        <div className="max-w-xl mx-auto">
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-8"
          >
            Curatorial Report: {
              details.type === 'artist' ? 'The Master' : 
              details.type === 'movement' ? 'The Movement' : 
              details.type === 'museum' ? 'The Institution' : 
              details.type === 'location' ? 'The Destination' : 'The Category'
            }
          </motion.span>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl lg:text-8xl font-serif leading-[1.0] mb-8 tracking-tighter italic"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {details.name}
          </motion.h1>

          <div className="flex flex-wrap gap-8 items-center opacity-40 uppercase text-[9px] font-bold tracking-[0.2em] mb-12">
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              <span>{details.yearsOrPeriod}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              <span>{details.originOrRegion}</span>
            </div>
          </div>

          <div className="space-y-6">
            <p className="text-xl font-serif text-artistic-ink/80 leading-relaxed italic">
              "{details.significance}"
            </p>
            <div className="h-px w-24 bg-artistic-accent" />
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-12 left-12 flex space-x-1 opacity-20">
          <div className="w-2 h-2 bg-artistic-ink" />
          <div className="w-2 h-2 bg-artistic-ink" />
          <div className="w-2 h-2 bg-artistic-ink" />
        </div>
      </div>

      {/* Analysis Side */}
      <div className="w-full lg:w-1/2 p-10 lg:p-20 flex flex-col bg-artistic-bg overflow-y-auto">
        <div className="max-w-xl mx-auto space-y-16 py-10 lg:py-20">
          
          <section>
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6 px-1">
              Curatorial Analysis
            </span>
            <div className="prose prose-sm prose-slate max-w-none">
              {details.detailedDescription.split('\n').map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-artistic-ink/80 text-justify mb-4">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          <section>
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6">Key Characteristics</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {details.keyCharacteristics.map((trait, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-white/50 backdrop-blur-sm rounded-xl border border-artistic-ink/5">
                  <Star className="w-3 h-3 text-artistic-accent mt-0.5 flex-shrink-0" />
                  <span className="text-xs font-semibold leading-tight">{trait}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6">Historical Impact & Legacy</span>
            <div className="relative">
              <div className="absolute -left-6 top-0 bottom-0 w-px bg-artistic-accent/20" />
              <p className="text-sm leading-relaxed text-artistic-ink/80 text-justify">
                {details.historicalImpact}
              </p>
            </div>
          </section>

          <section>
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6 px-1">
              Missing Masterpieces
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {details.famousWorks
                .filter(work => !history.some(art => 
                  art.details.title.toLowerCase().includes(work.title.toLowerCase()) || 
                  work.title.toLowerCase().includes(art.details.title.toLowerCase())
                ))
                .map((work, i) => (
                  <div key={i} className="group flex flex-col gap-3 p-3 bg-white/30 border border-dashed border-artistic-ink/10 rounded-2xl transition-all hover:border-artistic-accent/30 relative">
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-artistic-shadow relative">
                      {work.imageUrl ? (
                        <ValidatedImage 
                          src={work.imageUrl} 
                          alt={work.title} 
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
                        />
                      ) : (
                        <button 
                          onClick={() => setEditingWorkIndex(i)}
                          className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-artistic-accent/5 transition-colors"
                          title="Upload artwork image"
                        >
                          <Plus className="w-6 h-6 text-artistic-ink/20" />
                          <span className="text-[8px] uppercase tracking-[0.2em] font-bold opacity-20">No Visual Found</span>
                        </button>
                      )}
                      
                      <div className="absolute top-3 right-3 flex flex-col gap-2">
                        <button 
                          onClick={() => onAddToBucketList(work)}
                          disabled={bucketListWorks.some(item => item.details.title === work.title && item.details.year === work.year) || history.some(item => item.details.title === work.title)}
                          className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-artistic-accent hover:text-white disabled:opacity-30"
                        >
                          {bucketListWorks.some(item => item.details.title === work.title && item.details.year === work.year) || history.some(item => item.details.title === work.title) ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold truncate leading-tight mb-1">{work.title}</p>
                      <div className="flex items-center gap-1.5 opacity-40 uppercase text-[8px] tracking-widest font-bold">
                        <span>{work.year}</span>
                        {work.museum && (
                          <>
                            <span>•</span>
                            <button 
                              onClick={() => onEntityClick(work.museum!, 'museum')}
                              className="hover:text-artistic-accent transition-colors truncate text-left"
                            >
                              {work.museum}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            
            <ImageOverrideModal 
              isOpen={editingWorkIndex !== null}
              onClose={() => setEditingWorkIndex(null)}
              title={editingWorkIndex !== null ? details.famousWorks[editingWorkIndex].title : ''}
              subtitle="Curatorial Archive Sync"
              onUpdate={(url) => {
                if (editingWorkIndex !== null) {
                  onUpdateFamousWorkImage(details.famousWorks[editingWorkIndex].title, url);
                }
              }}
            />

            <div className="mt-6">
              {details.famousWorks.filter(work => !history.some(art => 
                art.details.title.toLowerCase().includes(work.title.toLowerCase()) || 
                work.title.toLowerCase().includes(art.details.title.toLowerCase())
              )).length === 0 && (
                <p className="text-[10px] italic opacity-40 px-1">You have captured all primary recognized works by this artist in your binnacle!</p>
              )}
            </div>
          </section>

          {relatedBucketList.length > 0 && (
            <section>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6 px-1">
                In Your Bucket List ({relatedBucketList.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {relatedBucketList.map(art => (
                  <div 
                    key={art.id}
                    onClick={() => onArtworkClick(art.id)}
                    className="group flex flex-col gap-3 p-3 bg-white/40 hover:bg-white/80 rounded-2xl cursor-pointer transition-all border border-artistic-ink/5"
                  >
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-artistic-shadow">
                      <ValidatedImage 
                        src={art.image} 
                        alt={art.details.title} 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold truncate flex items-center gap-1">
                        {React.createElement(getTypeIcon(art.details.type), { className: 'w-3 h-3 text-artistic-accent' })}
                        {art.details.title}
                      </p>
                      <p className="text-[9px] opacity-40 uppercase tracking-widest mt-1">{art.details.year} • {art.details.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {relatedArtworks.length > 0 && (
            <section>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6 px-1">
                Represented in Your Collection ({relatedArtworks.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {relatedArtworks.map(art => (
                  <div 
                    key={art.id}
                    onClick={() => onArtworkClick(art.id)}
                    className="group flex flex-col gap-3 p-3 bg-white/40 hover:bg-white/80 rounded-2xl cursor-pointer transition-all border border-artistic-ink/5"
                  >
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-artistic-shadow">
                      <ValidatedImage 
                        src={art.image} 
                        alt={art.details.title} 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold truncate flex items-center gap-1">
                        {React.createElement(getTypeIcon(art.details.type), { className: 'w-3 h-3 text-artistic-accent' })}
                        {art.details.title}
                      </p>
                      <p className="text-[9px] opacity-40 uppercase tracking-widest mt-1">{art.details.year} • {art.details.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="pt-8 flex justify-between items-end border-t border-artistic-ink/10">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-2">Digital Archivist</span>
              <span className="text-[10px] font-bold tracking-widest">AURA_REPORT_KB_2026</span>
            </div>
            <button 
              onClick={onBack}
              className="w-14 h-14 rounded-full bg-artistic-ink text-artistic-bg flex items-center justify-center hover:scale-105 transition-transform shadow-lg group"
            >
              <ArrowRight className="w-6 h-6 group-hover:-translate-x-1 rotate-180 transition-transform" />
            </button>
          </footer>
        </div>
      </div>
    </motion.div>
  );
};
