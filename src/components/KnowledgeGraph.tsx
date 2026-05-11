import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { ArtDetails, getEntityDetails, EntityDetails } from '../services/artService';
import { Info, X, ExternalLink, Network, Loader2, BookOpen, RefreshCw, Eye, EyeOff, MousePointer2, Maximize2 } from 'lucide-react';
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
  label: string;
}

interface KnowledgeGraphProps {
  items: HistoryItem[];
  bucketListItems: HistoryItem[];
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
export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ items, bucketListItems, onArtworkClick, onEntityClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [entityDetails, setEntityDetails] = useState<Record<string, EntityDetails>>({});
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(['movement', 'artist', 'artwork', 'location', 'type', 'museum']));
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [hideAllLinks, setHideAllLinks] = useState(false);
  const [focusSelectedOnly, setFocusSelectedOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: Node } | null>(null);

  // Close context menu on click anywhere else
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

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
      links.push({ source: `mov_${m}`, target: `art_${a}`, label: 'Influences' });
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
        links.push({ source: `loc_${loc}`, target: `mus_${mus}`, label: 'Located In' });
      }
    });

    // 6. Add Artwork Nodes (History)
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
      links.push({ source: `art_${a}`, target: `work_${item.id}`, label: 'Created' });
      
      // Map location to museum instead of painting if museum is available
      if (l && !mus) {
        links.push({ source: `loc_${l}`, target: `work_${item.id}`, label: 'Located In' });
      }
      if (t) links.push({ source: `typ_${t}`, target: `work_${item.id}`, label: 'Categorized As' });
      if (mus) links.push({ source: `mus_${mus}`, target: `work_${item.id}`, label: 'Exhibited At' });
    });
    
    return { nodes, links };
  }, [items, bucketListItems]);

  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const filteredGraphData = useMemo(() => {
    const { nodes, links } = graphData;
    
    // Filter nodes by type first
    const visibleByTypeNodes = nodes.filter(n => visibleTypes.has(n.type));
    const visibleByTypeIds = new Set(visibleByTypeNodes.map(n => n.id));

    // Determine nodes hidden by collapse recursion (upstream from collapsed incoming edges)
    const hiddenNodes = new Set<string>();
    const queue: string[] = [];

    // Initialize queue with nodes that point TO a collapsed target
    links.forEach(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      
      if (collapsedNodes.has(targetId) && visibleByTypeIds.has(sourceId)) {
        hiddenNodes.add(sourceId);
        queue.push(sourceId);
      }
    });

    // BFS upwards
    while(queue.length > 0) {
      const currentId = queue.shift()!;
      links.forEach(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (targetId === currentId && !hiddenNodes.has(sourceId) && visibleByTypeIds.has(sourceId)) {
          hiddenNodes.add(sourceId);
          queue.push(sourceId);
        }
      });
    }

    const visibleNodes = visibleByTypeNodes.filter(n => !hiddenNodes.has(n.id));
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Links are visible only if both source and target nodes are visible
    // AND if global visibility settings allow
    const visibleLinks = links.filter(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      
      const isVisible = visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
      if (!isVisible) return false;

      // Global Hide Toggle
      if (hideAllLinks) return false;

      // Focus Mode: only show links for selected node
      if (focusSelectedOnly && selectedNode) {
        return sourceId === selectedNode.id || targetId === selectedNode.id;
      }

      // Per-node collapse - hide incoming edges to collapsed nodes
      return !collapsedNodes.has(targetId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, visibleTypes, collapsedNodes, hideAllLinks, focusSelectedOnly, selectedNode]);

  // Fetch Entity Logic
  const fetchEntity = useCallback(async (node: Node, forceRefresh = false) => {
    if (!(node.type === 'artist' || node.type === 'movement' || node.type === 'museum' || node.type === 'type' || node.type === 'location')) return;

    if (!forceRefresh && entityDetails[node.id]) return;

    setIsLoadingMore(true);
    try {
      const details = await getEntityDetails(node.name, node.type as 'artist' | 'movement' | 'museum' | 'type' | 'location', forceRefresh);
      setEntityDetails(prev => ({
        ...prev,
        [node.id]: details
      }));
    } catch (err) {
      console.error("Failed to fetch entity details", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [entityDetails]);

  // Handle Node Click
  const handleNodeClick = useCallback(async (node: any) => {
    const n = node as Node;
    
    setSelectedNode(n);

    // Zoom and center
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(3, 1000);
    }

    await fetchEntity(n);
  }, [fetchEntity]);

  // Custom Node Rendering
  const renderNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    const size = node.val;
    
    // Draw Icon
    ctx.font = `${size * 1.5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.icon, node.x, node.y);

    // Draw Collapsed Indicator
    if (collapsedNodes.has(node.id)) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size * 1.2, 0, 2 * Math.PI);
      ctx.strokeStyle = '#C4A484';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
  }, [collapsedNodes]);

  const renderLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const MAX_FONT_SIZE = 4;
    const LABEL_NODE_MARGIN = 2; // Extra margin so labels don't overlap icons
    const start = link.source;
    const end = link.target;

    // Only render labels if they exist and zoom is high enough
    if (!link.label || globalScale < 2.5) return;

    // Calculate position
    const textPos = {
      x: start.x + (end.x - start.x) / 2,
      y: start.y + (end.y - start.y) / 2
    };

    const relLink = { x: end.x - start.x, y: end.y - start.y };
    const distance = Math.sqrt(relLink.x * relLink.x + relLink.y * relLink.y);

    // Don't render labels if they're too cramped
    if (distance < 20) return;

    let textAngle = Math.atan2(relLink.y, relLink.x);

    // Maintain label readability (top-to-bottom)
    if (textAngle > Math.PI / 2) textAngle -= Math.PI;
    if (textAngle < -Math.PI / 2) textAngle += Math.PI;

    const fontSize = Math.min(MAX_FONT_SIZE, (distance - LABEL_NODE_MARGIN * 2) / link.label.length);

    ctx.save();
    ctx.translate(textPos.x, textPos.y);
    ctx.rotate(textAngle);

    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(26, 26, 26, 0.4)';
    
    // Draw background white box for readability
    const textWidth = ctx.measureText(link.label).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(-textWidth/2 - 1, -fontSize/2 - 1, textWidth + 2, fontSize + 2);
    
    ctx.fillStyle = 'rgba(26, 26, 26, 0.5)';
    ctx.fillText(link.label, 0, 0);
    ctx.restore();
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

  const relatedBucketList = useMemo(() => {
    if (!selectedNode) return [];
    if (selectedNode.type === 'artist') {
      return bucketListItems.filter(item => item.details.artist === selectedNode.name);
    }
    if (selectedNode.type === 'movement') {
      return bucketListItems.filter(item => item.details.movement === selectedNode.name);
    }
    if (selectedNode.type === 'location') {
      return bucketListItems.filter(item => item.details.location === selectedNode.name);
    }
    if (selectedNode.type === 'type') {
      return bucketListItems.filter(item => item.details.type === selectedNode.name);
    }
    if (selectedNode.type === 'museum') {
      return bucketListItems.filter(item => item.details.museum === selectedNode.name);
    }
    return [];
  }, [selectedNode, bucketListItems]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {(filteredGraphData.nodes.length > 0) ? (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={filteredGraphData}
          nodeCanvasObject={renderNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.2}
          linkColor={() => 'rgba(26, 26, 26, 0.15)'}
          linkCanvasObject={renderLink}
          linkCanvasObjectMode={() => 'after'}
          onNodeClick={handleNodeClick}
          onNodeRightClick={(node: any, event) => {
            event.preventDefault();
            setContextMenu({ 
              x: event.clientX, 
              y: event.clientY, 
              node: node as Node 
            });
          }}
          cooldownTicks={100}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
          <Network className="w-8 h-8 mb-4" />
          <p className="text-[10px] uppercase tracking-widest font-bold">No Neural Connections Detected</p>
          <p className="text-[10px] uppercase tracking-widest font-bold mt-2">Scan artworks to populate the graph</p>
        </div>
      )}

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[100] min-w-[160px] bg-white/95 backdrop-blur-xl border border-artistic-ink/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-artistic-ink/5 mb-1">
              <p className="text-[10px] font-bold truncate text-artistic-ink/60 uppercase tracking-widest">{contextMenu.node.name}</p>
            </div>

            <button 
              onClick={() => {
                setCollapsedNodes(prev => {
                  const next = new Set(prev);
                  next.delete(contextMenu.node.id);
                  return next;
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Expand Connections</span>
            </button>

            <button 
              onClick={() => {
                setCollapsedNodes(prev => {
                  const next = new Set(prev);
                  next.add(contextMenu.node.id);
                  return next;
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
            >
              <Network className="w-3.5 h-3.5 opacity-40" />
              <span>Collapse Connections</span>
            </button>

            <button 
              onClick={() => {
                setSelectedNode(contextMenu.node);
                setFocusSelectedOnly(!focusSelectedOnly);
                setContextMenu(null);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold ${focusSelectedOnly ? 'text-artistic-accent' : 'text-artistic-ink/80'} hover:bg-artistic-accent hover:text-white rounded-xl transition-all`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              <span>{focusSelectedOnly ? 'Disable Focus Mode' : 'Focus Connections'}</span>
            </button>

            <div className="h-px bg-artistic-ink/5 my-1" />

            <button 
              onClick={() => {
                handleNodeClick(contextMenu.node);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Center View</span>
            </button>

            {(contextMenu.node.type === 'artwork' || contextMenu.node.itemId) && (
              <button 
                onClick={() => {
                  if (contextMenu.node.itemId) onArtworkClick(contextMenu.node.itemId);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Details</span>
              </button>
            )}

            <button 
              onClick={() => {
                fetchEntity(contextMenu.node, true);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Force Refresh Data</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
              <div className="flex gap-2">
                <button 
                  onClick={() => toggleCollapse(selectedNode.id)}
                  className={`p-1 rounded-full transition-colors ${collapsedNodes.has(selectedNode.id) ? 'bg-artistic-accent text-white' : 'hover:bg-artistic-shadow'}`}
                  title={collapsedNodes.has(selectedNode.id) ? "Expand Connections" : "Collapse Connections"}
                >
                  {collapsedNodes.has(selectedNode.id) ? <Network className="w-4 h-4" /> : <Network className="w-4 h-4 opacity-40" />}
                </button>
                <button 
                  onClick={() => fetchEntity(selectedNode, true)}
                  className="p-1 hover:bg-artistic-shadow rounded-full transition-colors"
                  title="Refresh Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="p-1 hover:bg-artistic-shadow rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
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
                  
                  {(selectedNode.type === 'artist' || selectedNode.type === 'movement' || selectedNode.type === 'museum' || selectedNode.type === 'type' || selectedNode.type === 'location') && entityDetails[selectedNode.id] && (
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

            {relatedBucketList.length > 0 && (
              <div className="mb-8">
                <h4 className="text-[9px] uppercase tracking-widest font-bold text-artistic-ink/40 mb-4 px-1">
                  In Your Bucket List ({relatedBucketList.length})
                </h4>
                <div className="space-y-4">
                  {relatedBucketList.map(art => (
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

      <div className="absolute bottom-6 left-6 flex flex-col gap-2 p-5 bg-white/70 backdrop-blur-md rounded-2xl border border-artistic-ink/5 shadow-sm">
          <div 
            onClick={() => toggleType('movement')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('movement') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">🎨</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Styles / Movements</span>
          </div>
          <div 
            onClick={() => toggleType('artist')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('artist') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">👨‍🎨</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Artists</span>
          </div>
          <div 
            onClick={() => toggleType('artwork')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('artwork') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">🖼️</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Paintings</span>
          </div>
          <div 
            onClick={() => toggleType('location')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('location') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">📍</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Locations</span>
          </div>
          <div 
            onClick={() => toggleType('museum')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('museum') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">🏛️</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Museums</span>
          </div>
          <div 
            onClick={() => toggleType('type')}
            className={`flex items-center gap-3 cursor-pointer transition-opacity ${visibleTypes.has('type') ? 'opacity-100' : 'opacity-30'}`}
          >
              <span className="text-lg">🏺</span>
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">Masterpiece Types</span>
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-artistic-ink/5">
            <button 
              onClick={() => setHideAllLinks(!hideAllLinks)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${hideAllLinks ? 'bg-red-50 border-red-200 text-red-600' : 'bg-artistic-shadow/10 border-transparent text-artistic-ink/60'}`}
              title={hideAllLinks ? "Show All Connections" : "Hide All Connections"}
            >
              {hideAllLinks ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span className="text-[8px] uppercase tracking-wider font-bold">Connections</span>
            </button>
            <button 
              onClick={() => setFocusSelectedOnly(!focusSelectedOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${focusSelectedOnly ? 'bg-artistic-accent text-white border-artistic-accent' : 'bg-artistic-shadow/10 border-transparent text-artistic-ink/60'}`}
              title={focusSelectedOnly ? "Show All Connections" : "Focus Selected Connections"}
            >
              <MousePointer2 className="w-3 h-3" />
              <span className="text-[8px] uppercase tracking-wider font-bold">Focus</span>
            </button>
          </div>
      </div>
    </div>
  );
};

