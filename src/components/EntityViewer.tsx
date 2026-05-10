import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, MapPin, Calendar, ArrowRight, Star } from 'lucide-react';
import { EntityDetails, ArtDetails } from '../services/artService';

interface EntityViewerProps {
  details: EntityDetails;
  relatedArtworks: { id: string, image: string, details: ArtDetails }[];
  onArtworkClick: (id: string) => void;
  onBack: () => void;
}

export const EntityViewer: React.FC<EntityViewerProps> = ({ details, relatedArtworks, onArtworkClick, onBack }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col lg:flex-row h-full min-h-screen bg-artistic-bg w-full"
    >
      {/* Visual / Introduction Side */}
      <div className="w-full lg:w-1/2 p-10 lg:p-20 flex flex-col justify-center bg-white border-r border-artistic-ink/5 relative lg:sticky lg:top-0 lg:h-screen overflow-y-auto">
        <div className="max-w-xl mx-auto">
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="uppercase text-[10px] tracking-[0.4em] font-bold text-artistic-accent block mb-8"
          >
            Curatorial Report: {details.type === 'artist' ? 'The Master' : 'The Movement'}
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

          {/* Missing Masterpieces Section */}
          <section>
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-40 block mb-6 px-1">
              Missing Masterpieces
            </span>
            <div className="space-y-3">
              {details.famousWorks
                .filter(work => !relatedArtworks.some(art => 
                  art.details.title.toLowerCase().includes(work.title.toLowerCase()) || 
                  work.title.toLowerCase().includes(art.details.title.toLowerCase())
                ))
                .map((work, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/30 border border-dashed border-artistic-ink/10 rounded-xl group hover:border-artistic-accent/30 transition-colors">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold tracking-tight">{work.title}</span>
                      <span className="text-[8px] uppercase tracking-widest opacity-40 mt-1">{work.year}</span>
                    </div>
                    <div className="w-8 h-8 rounded-full border border-artistic-ink/10 flex items-center justify-center opacity-20 group-hover:opacity-100 transition-opacity">
                      <Star className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              {details.famousWorks.filter(work => !relatedArtworks.some(art => 
                art.details.title.toLowerCase().includes(work.title.toLowerCase()) || 
                work.title.toLowerCase().includes(art.details.title.toLowerCase())
              )).length === 0 && (
                <p className="text-[10px] italic opacity-40 px-1">You have captured all primary recognized works by this artist in your binnacle!</p>
              )}
            </div>
          </section>

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
                      <img 
                        src={art.image} 
                        alt={art.details.title} 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold truncate">{art.details.title}</p>
                      <p className="text-[9px] opacity-40 uppercase tracking-widest mt-1">{art.details.year}</p>
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
