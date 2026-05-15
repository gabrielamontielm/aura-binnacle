import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Plus, Search, ExternalLink } from 'lucide-react';

interface ImageOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (imageUrl: string) => void;
  title: string;
  subtitle?: string;
  searchQuery?: string;
}

export const ImageOverrideModal: React.FC<ImageOverrideModalProps> = ({ 
  isOpen, 
  onClose, 
  onUpdate, 
  title, 
  subtitle,
  searchQuery
}) => {
  const [imageUrlInput, setImageUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onUpdate(base64String);
      onClose();
    };
    reader.readAsDataURL(file);
  };

  const handleUrlSubmit = () => {
    if (imageUrlInput) {
      onUpdate(imageUrlInput);
      setImageUrlInput('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-artistic-ink/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white p-8 rounded-3xl max-w-sm w-full shadow-2xl relative overflow-hidden text-artistic-ink"
          >
            {/* Artistic accents */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-artistic-accent/5 rounded-bl-full" />
            
            <h3 className="font-serif text-2xl italic mb-1">Add Visual Reference</h3>
            {subtitle && (
              <p className="text-[10px] uppercase font-bold tracking-widest text-artistic-ink/40 mb-8">
                {subtitle}
              </p>
            )}
            <p className="text-[10px] uppercase font-bold tracking-widest text-artistic-ink/40 mb-8">
              {title}
            </p>

            <div className="space-y-6">
              {searchQuery && (
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-[0.2em] mb-3 block">Step 1: Find Reference</span>
                  <a 
                    href={`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-artistic-shadow/20 border border-artistic-ink/5 rounded-2xl flex items-center justify-center gap-3 hover:bg-artistic-accent hover:text-white group transition-all"
                  >
                    <Search className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-all text-artistic-ink group-hover:text-white" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-artistic-ink group-hover:text-white">Search Google Images</span>
                    <ExternalLink className="w-3 h-3 opacity-20 group-hover:opacity-60 transition-all text-artistic-ink group-hover:text-white" />
                  </a>
                  <p className="text-[8px] opacity-40 mt-2 text-center">Open search, right-click an image, and "Copy Image Address"</p>
                </div>
              )}

              <div>
                <span className="text-[9px] uppercase font-bold tracking-[0.2em] mb-3 block">{searchQuery ? 'Step 2: Social Mirroring' : 'Option 1: Social Mirroring'}</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter Image URL..."
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    className="flex-1 bg-artistic-shadow/30 border border-artistic-ink/5 rounded-full px-4 py-2 text-xs outline-none focus:border-artistic-accent transition-colors"
                  />
                  <button 
                    onClick={handleUrlSubmit}
                    className="bg-artistic-ink text-artistic-bg rounded-full p-2 hover:bg-artistic-accent transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-artistic-ink/5"></div>
                </div>
                <div className="relative flex justify-center text-[8px] uppercase tracking-widest font-bold">
                  <span className="bg-white px-2 opacity-20 text-artistic-ink">or</span>
                </div>
              </div>

              <div>
                <span className="text-[9px] uppercase font-bold tracking-[0.2em] mb-3 block">Option 2: Physical Deposit</span>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 border-2 border-dashed border-artistic-ink/10 rounded-2xl flex flex-col items-center gap-2 hover:border-artistic-accent/40 group transition-all"
                >
                  <Plus className="w-5 h-5 opacity-20 group-hover:opacity-100 group-hover:text-artistic-accent transition-all text-artistic-ink" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-artistic-ink/40 text-artistic-ink">Select File</span>
                </button>
              </div>

              <button 
                onClick={onClose}
                className="w-full text-center text-[9px] font-bold uppercase tracking-widest py-2 opacity-40 hover:opacity-100 hover:text-red-500 transition-all mt-4"
              >
                Abort Operation
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
