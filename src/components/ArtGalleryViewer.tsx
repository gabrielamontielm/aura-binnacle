import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  Play, 
  Pause,
  Image as ImageIcon
} from 'lucide-react';

interface ArtGalleryViewerProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  onUpdateImages: (newImages: string[]) => void;
  title: string;
  artist: string;
  isViewOnly?: boolean;
}

export const ArtGalleryViewer: React.FC<ArtGalleryViewerProps> = ({
  isOpen,
  onClose,
  images,
  onUpdateImages,
  title,
  artist,
  isViewOnly = false
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSlideshowRunning, setIsSlideshowRunning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const allImages = React.useMemo(() => images, [images]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % allImages.length);
    setZoomLevel(1);
    setDragPosition({ x: 0, y: 0 });
  }, [allImages.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    setZoomLevel(1);
    setDragPosition({ x: 0, y: 0 });
  }, [allImages.length]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSlideshowRunning && allImages.length > 1) {
      interval = setInterval(handleNext, 3000);
    }
    return () => clearInterval(interval);
  }, [isSlideshowRunning, handleNext, allImages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, isFullscreen, onClose]);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onUpdateImages([...allImages, base64String]);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteImage = (index: number) => {
    if (allImages.length <= 1) return;
    const newImages = allImages.filter((_, i) => i !== index);
    onUpdateImages(newImages);
    if (currentIndex >= newImages.length) {
      setCurrentIndex(Math.max(0, newImages.length - 1));
    }
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setDragPosition({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-artistic-ink flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Header */}
          <div className="absolute top-0 inset-x-0 h-20 px-8 flex items-center justify-between z-50 bg-gradient-to-b from-black/60 to-transparent">
            <div>
              <h2 className="text-white font-serif text-xl italic">{title}</h2>
              <p className="text-white/60 text-[10px] uppercase tracking-widest font-bold">{artist}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-white/40 text-[10px] font-mono tracking-widest uppercase">
                {currentIndex + 1} / {allImages.length}
              </div>
              <button 
                onClick={onClose}
                className="p-3 text-white/60 hover:text-white transition-colors"
                title="Exit Gallery"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main Stage */}
          <div className="relative w-full h-[60vh] md:h-[70vh] flex items-center justify-center p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={allImages[currentIndex]}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  transition: { duration: 0.4 }
                }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="relative w-full h-full flex items-center justify-center"
              >
                <motion.img 
                  src={allImages[currentIndex]}
                  alt={`${title} - ${currentIndex + 1}`}
                  className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing shadow-2xl"
                  style={{ 
                    scale: zoomLevel,
                    x: dragPosition.x,
                    y: dragPosition.y
                  }}
                  drag={zoomLevel > 1}
                  onDrag={(event, info) => {
                    if (zoomLevel > 1) {
                      setDragPosition({ x: info.point.x, y: info.point.y });
                    }
                  }}
                  dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />

                {/* Overlays / Controls */}
                <div className="absolute inset-x-0 bottom-8 flex justify-center items-center gap-4 z-50 pointer-events-none">
                  <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                    <button 
                      onClick={handleZoomOut}
                      className="p-2 text-white/60 hover:text-white transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-mono text-white/80 w-12 text-center uppercase tracking-widest">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button 
                      onClick={handleZoomIn}
                      className="p-2 text-white/60 hover:text-white transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-2" />
                    <button 
                      onClick={() => setIsSlideshowRunning(!isSlideshowRunning)}
                      className={`p-2 transition-colors ${isSlideshowRunning ? 'text-artistic-accent' : 'text-white/60 hover:text-white'}`}
                      title={isSlideshowRunning ? "Pause Slideshow" : "Start Slideshow"}
                    >
                      {isSlideshowRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Nav Arrows */}
            {allImages.length > 1 && (
              <>
                <button 
                  onClick={handlePrev}
                  className="absolute left-8 p-4 text-white/30 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-sm z-50"
                  title="Previous Image"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button 
                  onClick={handleNext}
                  className="absolute right-8 p-4 text-white/30 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-sm z-50"
                  title="Next Image"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}
          </div>

          {/* Filmstrip / Thumbnails */}
          <div className="absolute bottom-0 inset-x-0 h-32 px-8 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60 to-transparent">
             <div className="flex items-center gap-4 overflow-x-auto pb-4 px-4 mask-fade-edges">
                {allImages.map((img, i) => (
                  <div key={i} className="relative group/thumb">
                    <button 
                      onClick={() => {
                        setCurrentIndex(i);
                        setZoomLevel(1);
                        setDragPosition({ x: 0, y: 0 });
                      }}
                      className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 ${currentIndex === i ? 'border-artistic-accent scale-110' : 'border-white/10 opacity-50 hover:opacity-100 hover:scale-105'}`}
                    >
                      <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                    </button>
                    {!isViewOnly && allImages.length > 1 && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(i);
                        }}
                        className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:scale-110 shadow-lg z-50"
                        title="Remove Visual"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                
                {!isViewOnly && (
                  <label className="w-20 h-20 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-artistic-accent/40 transition-all hover:bg-white/5 shrink-0">
                    <Plus className="w-5 h-5 text-white/40" />
                    <span className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Add</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileAdd} />
                  </label>
                )}
             </div>
          </div>

          {/* Tips Overlay */}
          <div className="absolute bottom-36 inset-x-0 text-center pointer-events-none">
            <p className="text-white/20 text-[8px] uppercase tracking-[0.3em] font-bold">
              Drag to pan • Scroll to Zoom • Arrows to Navigate
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
