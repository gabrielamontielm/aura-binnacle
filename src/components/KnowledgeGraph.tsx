import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { ArtDetails, getEntityDetails, EntityDetails } from '../services/artService';
import { Info, X, ExternalLink, Network, Loader2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HistoryItem {
  id: string;
  image: string;
  details: ArtDetails;
  timestamp: number;
}

interface Node {
  id: string;
  name: string;
  type: 'movement' | 'artist' | 'artwork' | 'location' | 'type' | 'museum';
  val: number;
  color: string;
  icon: string;
  itemId?: string;
  info?: string;
  x?: number;
  y?: number;
}

interface Link {
  source: string;
  target: string;
}

interface KnowledgeGraphProps {
  items: HistoryItem[];
  onArtworkClick: (itemId: string) => void;
  onEntityClick: (details: EntityDetails) => void;
}

/**
 * Interactive 2D Knowledge Graph component for visualizing art connections.
 * 
 * @param items List of scanned artworks in user history.
 * @param onArtworkClick Callback when an artwork node or list item is clicked.
 * @param onEntityClick Callback when "Full Curatorial Report" is requested for an artist/movement.
 */
export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ items, onArtworkClick, onEntityClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [entityDetails, setEntityDetails] = useState<Record<string, EntityDetails>>({});

  // Explicit dimension tracking
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Generate Graph Data
  const graphData = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const movements = new Set<string>();
    const artists = new Map<string, string>(); // Artist -> Movement
    const locations = new Set<string>();
    const types = new Set<string>();
    const museums = new Set<string>();
    const museumToLocation = new Map<string, string>(); // Museum name -> Location name

    items.forEach(item => {
      const m = item.details.movement || 'Unknown Movement';
      const a = item.details.artist || 'Unknown Artist';
      const l = item.details.location;
      const t = item.details.type;
      const mus = item.details.museum;
      
      movements.add(m);
      artists.set(a, m);
      if (l) locations.add(l);
      if (t) types.add(t);
      if (mus) {
        museums.add(mus);
        if (l) museumToLocation.set(mus, l);
      }
    });

    // 1. Add Movement Nodes
    movements.forEach(m => {
      nodes.push({
        id: `mov_${m}`,
        name: m,
        type: 'movement',
        val: 12,
        color: '#C4A484',
        icon: '🎨',
        info: `An artistic movement characterized by specific styles and philosophies during its era.`
      });
    });

    // 2. Add Artist Nodes
    artists.forEach((m, a) => {
      nodes.push({
        id: `art_${a}`,
        name: a,
        type: 'artist',
        val: 10,
        color: '#1A1A1A',
        icon: '👨‍🎨',
        info: `A notable creator whose work contributes to the ${m} movement.`
      });
      links.push({ source: `mov_${m}`, target: `art_${a}` });
    });

    // 3. Add Location Nodes
    locations.forEach(l => {
      nodes.push({
        id: `loc_${l}`,
        name: l,
        type: 'location',
        val: 10,
        color: '#FF4B4B',
        icon: '📍',
        info: `A geographical location where significant artworks are currently housed or originated.`
      });
    });

    // 4. Add Type Nodes
    types.forEach(t => {
      nodes.push({
        id: `typ_${t}`,
        name: t,
        type: 'type',
        val: 10,
        color: '#4B7BFF',
        icon: '🏺',
        info: `The medium and format of the masterpiece, classifying it as a ${t}.`
      });
    });

    // 5. Add Museum Nodes
    museums.forEach(mus => {
      nodes.push({
        id: `mus_${mus}`,
        name: mus,
        type: 'museum',
        val: 11,
        color: '#8A2BE2',
        icon: '🏛️',
        info: `The cultural institution that preserves and displays this masterpiece.`
      });

      // Link Museum to its Location
      const loc = museumToLocation.get(mus);
      if (loc) {
        links.push({ source: `loc_${loc}`, target: `mus_${mus}` });
      }
    });

    // 6. Add Artwork Nodes
    items.forEach(item => {
      const a = item.details.artist || 'Unknown Artist';
      const l = item.details.location;
      const t = item.details.type;
      const mus = item.details.museum;

      nodes.push({
        id: `work_${item.id}`,
        name: item.details.title,
        type: 'artwork',
        val: 8,
        color: '#E5E0D5',
        icon: '🖼️',
        itemId: item.id,
        info: `${item.details.title} (${item.details.year}). ${item.details.description?.substring(0, 100)}...`
      });
      links.push({ source: `art_${a}`, target: `work_${item.id}` });
      
      // Map location to museum instead of painting if museum is available
      if (l && !mus) {
        links.push({ source: `loc_${l}`, target: `work_${item.id}` });
      }
      
      if (t) links.push({ source: `typ_${t}`, target: `work_${item.id}` });
      if (mus) links.push({ source: `mus_${mus}`, target: `work_${item.id}` });
    });

    return { nodes, links };
  }, [items]);

  // Handle Node Click
  const handleNodeClick = useCallback(async (node: any) => {
    const n = node as Node;
    
    setSelectedNode(n);

    // Zoom and center
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(3, 1000);
    }

    // Fetch more details for artists and movements if not already cached
    if ((n.type === 'artist' || n.type === 'movement') && !entityDetails[n.id]) {
      setIsLoadingMore(true);
      try {
        const details = await getEntityDetails(n.name, n.type);
        setEntityDetails(prev => ({
          ...prev,
          [n.id]: details
        }));
      } catch (err) {
        console.error("Failed to fetch entity details", err);
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [entityDetails]);

  // Custom Node Rendering
  const renderNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    const size = node.val;
    
    /* 
    // Removed background circle as requested
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color;
    ctx.fill();
    
    // Draw border
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();
    */

    // Draw Icon
    ctx.font = `${size * 1.5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.icon, node.x, node.y);

    // Draw Label
    if (globalScale > 1.5) {
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#101010';
      ctx.shadowBlur = 4 / globalScale;
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.fillText(label, node.x, node.y + size + 2);
      ctx.shadowBlur = 0;
    }
  }, []);

  const relatedArtworks = useMemo(() => {
    if (!selectedNode) return [];
    if (selectedNode.type === 'artist') {
      return items.filter(item => item.details.artist === selectedNode.name);
    }
    if (selectedNode.type === 'movement') {
      return items.filter(item => item.details.movement === selectedNode.name);
    }
    if (selectedNode.type === 'location') {
      return items.filter(item => item.details.location === selectedNode.name);
    }
    if (selectedNode.type === 'type') {
      return items.filter(item => item.details.type === selectedNode.name);
    }
    if (selectedNode.type === 'museum') {
      return items.filter(item => item.details.museum === selectedNode.name);
    }
    return [];
  }, [selectedNode, items]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {items.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={renderNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkColor={() => 'rgba(26, 26, 26, 0.1)'}
          onNodeClick={handleNodeClick}
          cooldownTicks={100}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
          <Network className="w-8 h-8 mb-4" />
          <p className="text-[10px] uppercase tracking-widest font-bold">No Neural Connections Detected</p>
          <p className="text-[10px] uppercase tracking-widest font-bold mt-2">Scan artworks to populate the graph</p>
        </div>
      )}

      {/* Info Panel Overlay */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-6 right-6 w-80 bg-white/95 shadow-2xl border border-artistic-ink/10 rounded-2xl p-6 z-10 backdrop-blur-md max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-6 sticky top-0 bg-white/95 pt-2 pb-2 -mt-2 -mx-2 px-2 z-20 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedNode.icon}</span>
                <span className="uppercase text-[9px] tracking-[0.3em] font-bold text-artistic-accent">
                  {selectedNode.type}
                </span>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-artistic-shadow rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-2xl font-serif italic mb-4 tracking-tight leading-tight">{selectedNode.name}</h3>
            
            <div className="min-h-[100px] flex flex-col justify-center">
              {isLoadingMore ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-artistic-accent mb-2" />
                  <span className="text-[8px] uppercase tracking-widest font-bold opacity-40">Consulting Archive...</span>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <p className="text-sm leading-relaxed text-artistic-ink/70 mb-6 italic">
                    {entityDetails[selectedNode.id]?.curatorialSummary || selectedNode.info}
                  </p>
                  
                  {(selectedNode.type === 'artist' || selectedNode.type === 'movement') && entityDetails[selectedNode.id] && (
                    <button 
                      onClick={() => onEntityClick(entityDetails[selectedNode.id])}
                      className="w-full py-4 bg-artistic-ink text-white text-[10px] uppercase font-bold tracking-[0.2em] rounded-xl flex items-center justify-center gap-3 hover:bg-artistic-accent transition-colors shadow-lg shadow-artistic-ink/20 mb-8"
                    >
                      <span>Full Curatorial Report</span>
                      <BookOpen className="w-3 h-3" />
                    </button>
                  )}
                </motion.div>
              )}
            </div>

            {relatedArtworks.length > 0 && (
              <div className="mb-8">
                <h4 className="text-[9px] uppercase tracking-widest font-bold text-artistic-ink/40 mb-4 px-1">
                  In Your Collection ({relatedArtworks.length})
                </h4>
                <div className="space-y-4">
                  {relatedArtworks.map(art => (
                    <div 
                      key={art.id}
                      onClick={() => onArtworkClick(art.id)}
                      className="group flex items-center gap-4 p-2 hover:bg-artistic-shadow rounded-xl cursor-pointer transition-all border border-transparent hover:border-artistic-ink/5"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-artistic-shadow">
                        <img 
                          src={art.image} 
                          alt={art.details.title} 
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold truncate leading-tight">{art.details.title}</p>
                        <p className="text-[9px] opacity-40 uppercase tracking-widest mt-0.5">{art.details.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.type === 'artwork' && (
              <button 
                onClick={() => onArtworkClick(selectedNode.itemId!)}
                className="w-full py-4 bg-artistic-ink text-white text-[10px] uppercase font-bold tracking-[0.2em] rounded-xl flex items-center justify-center gap-3 hover:bg-artistic-accent transition-colors shadow-lg shadow-artistic-ink/20"
              >
                <span>View Details</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-6 left-6 flex flex-col gap-2 p-5 bg-white/70 backdrop-blur-md rounded-2xl border border-artistic-ink/5 shadow-sm pointer-events-none">
          <div className="flex items-center gap-3">
              <span className="text-lg">🎨</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Styles / Movements</span>
          </div>
          <div className="flex items-center gap-3">
              <span className="text-lg">👨‍🎨</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Artists</span>
          </div>
          <div className="flex items-center gap-3">
              <span className="text-lg">🖼️</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Paintings</span>
          </div>
          <div className="flex items-center gap-3">
              <span className="text-lg">📍</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Locations</span>
          </div>
          <div className="flex items-center gap-3">
              <span className="text-lg">🏛️</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Museums</span>
          </div>
          <div className="flex items-center gap-3">
              <span className="text-lg">🏺</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Masterpiece Types</span>
          </div>
      </div>
    </div>
  );
};

