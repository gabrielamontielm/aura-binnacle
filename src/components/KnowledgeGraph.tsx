import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { ArtDetails, getEntityDetails, EntityDetails, sanitizeId, normalizeName } from '../services/artService';
import { HistoryItem } from '../types';
import { Info, X, ExternalLink, Network, Loader2, BookOpen, RefreshCw, Eye, EyeOff, MousePointer2, Maximize2, SlidersHorizontal, ChevronDown, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

const typeColors = {
  movement: '#C4A484',   // warm tan
  artist: '#1A1A1A',     // ink black
  artwork: '#6B7280',    // neutral grey (thumbnail replaces fill)
  location: '#E05050',   // red
  type: '#3B72F0',       // blue
  museum: '#7C3AED',     // violet
};

const typeBorders = {
  movement: '#A07850',
  artist: '#404040',
  artwork: '#9CA3AF',
  location: '#B02020',
  type: '#1D4ED8',
  museum: '#5B21B6',
};

// Draw a white vector icon inside the node circle.
// All coordinates are relative to (cx, cy); s = icon half-size ≈ r * 0.5
function drawNodeIcon(ctx: CanvasRenderingContext2D, type: string, cx: number, cy: number, r: number) {
  const s = r * 0.52;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (type) {
    case 'movement': {
      // Painter's palette: rounded blob + colour dots
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      // Palette outline (egg shape rotated)
      ctx.ellipse(cx - s * 0.05, cy + s * 0.05, s * 0.82, s * 0.68, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      // Thumb hole
      ctx.beginPath();
      ctx.arc(cx + s * 0.28, cy - s * 0.38, s * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      // Three colour dots
      const dotR = s * 0.12;
      const dotPositions = [
        [cx - s * 0.35, cy - s * 0.15],
        [cx - s * 0.1,  cy - s * 0.42],
        [cx + s * 0.2,  cy - s * 0.08],
      ];
      dotPositions.forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'artist': {
      // Person silhouette: circle head + body arc
      ctx.lineWidth = r * 0.1;
      // Head
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.32, s * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      // Shoulders / body (arc)
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.7, s * 0.72, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      break;
    }
    case 'location': {
      // Map pin: circle + pointed drop
      ctx.lineWidth = r * 0.09;
      const pinCy = cy - s * 0.18;
      const pinR  = s * 0.38;
      // Outer circle
      ctx.beginPath();
      ctx.arc(cx, pinCy, pinR, 0, Math.PI * 2);
      ctx.stroke();
      // Inner dot
      ctx.beginPath();
      ctx.arc(cx, pinCy, pinR * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // Drop tail — two lines meeting at a point
      ctx.beginPath();
      ctx.moveTo(cx - pinR * 0.62, pinCy + pinR * 0.78);
      ctx.lineTo(cx,               pinCy + s * 1.05);
      ctx.lineTo(cx + pinR * 0.62, pinCy + pinR * 0.78);
      ctx.stroke();
      break;
    }
    case 'type': {
      // Stacked brush strokes / medium layers
      ctx.lineWidth = r * 0.1;
      ctx.lineCap = 'round';
      const lines = [
        { x1: cx - s * 0.55, y1: cy - s * 0.38, x2: cx + s * 0.3,  y2: cy - s * 0.38 },
        { x1: cx - s * 0.35, y1: cy,             x2: cx + s * 0.55, y2: cy             },
        { x1: cx - s * 0.55, y1: cy + s * 0.38, x2: cx + s * 0.15, y2: cy + s * 0.38 },
      ];
      lines.forEach(({ x1, y1, x2, y2 }) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
      // Small circle end-cap on first line (brush tip)
      ctx.beginPath();
      ctx.arc(cx + s * 0.3 + r * 0.06, cy - s * 0.38, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'museum': {
      // Building: pediment + columns + base
      ctx.lineWidth = r * 0.09;
      const bx = cx - s * 0.7;
      const bw = s * 1.4;
      const baseY = cy + s * 0.62;
      const roofY = cy - s * 0.62;
      const colTop = cy - s * 0.35;

      // Roof triangle (pediment)
      ctx.beginPath();
      ctx.moveTo(bx, roofY + s * 0.28);
      ctx.lineTo(cx, roofY);
      ctx.lineTo(bx + bw, roofY + s * 0.28);
      ctx.closePath();
      ctx.stroke();

      // Columns (3 vertical lines)
      const colXs = [cx - s * 0.42, cx, cx + s * 0.42];
      colXs.forEach(colX => {
        ctx.beginPath();
        ctx.moveTo(colX, colTop);
        ctx.lineTo(colX, baseY);
        ctx.stroke();
      });

      // Base line
      ctx.beginPath();
      ctx.moveTo(bx, baseY);
      ctx.lineTo(bx + bw, baseY);
      ctx.stroke();
      break;
    }
    default:
      break;
  }

  ctx.restore();
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
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [entityDetails, setEntityDetails] = useState<Record<string, EntityDetails>>({});
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(['movement', 'artist', 'artwork', 'location', 'type', 'museum']));
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [hideAllLinks, setHideAllLinks] = useState(false);
  const [focusSelectedOnly, setFocusSelectedOnly] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: Node } | null>(null);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(false);

  // Graph diff state — effect runs after graphData is declared below
  const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set());

  // Thumbnail image cache for artwork nodes
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imgCacheVersion, setImgCacheVersion] = useState(0);

  useEffect(() => {
    items.forEach(item => {
      if (!item.image || imgCache.current.has(item.id)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imgCache.current.set(item.id, img);
        setImgCacheVersion(v => v + 1);
      };
      img.src = item.image;
    });
  }, [items]);

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
      const m = normalizeName(item.details.movement || 'Unknown Movement');
      const a = normalizeName(item.details.artist || 'Unknown Artist');
      const l = item.details.location ? normalizeName(item.details.location) : null;
      const t = item.details.type ? normalizeName(item.details.type) : null;
      const mus = item.details.museum ? normalizeName(item.details.museum) : null;
      
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
      const mid = sanitizeId(m);
      nodes.push({
        id: `mov_${mid}`,
        name: m,
        type: 'movement',
        val: 20,
        color: typeColors.movement,
        icon: '🎨',
        info: `An artistic movement characterized by specific styles and philosophies during its era.`
      });
    });

    // 2. Add Artist Nodes
    artists.forEach((m, a) => {
      const aid = sanitizeId(a);
      const mid = sanitizeId(m);
      nodes.push({
        id: `art_${aid}`,
        name: a,
        type: 'artist',
        val: 14,
        color: typeColors.artist,
        icon: '👨‍🎨',
        info: `A notable creator whose work contributes to the ${m} movement.`
      });
      links.push({ source: `mov_${mid}`, target: `art_${aid}`, label: 'Influences' });
    });

    // 3. Add Location Nodes
    locations.forEach(l => {
      const lid = sanitizeId(l);
      nodes.push({
        id: `loc_${lid}`,
        name: l,
        type: 'location',
        val: 12,
        color: typeColors.location,
        icon: '📍',
        info: `A geographical location where significant artworks are currently housed or originated.`
      });
    });

    // 4. Add Type Nodes
    types.forEach(t => {
      const tid = sanitizeId(t);
      nodes.push({
        id: `typ_${tid}`,
        name: t,
        type: 'type',
        val: 12,
        color: typeColors.type,
        icon: '🏺',
        info: `The medium and format of the masterpiece, classifying it as a ${t}.`
      });
    });

    // 5. Add Museum Nodes
    museums.forEach(mus => {
      const musId = sanitizeId(mus);
      nodes.push({
        id: `mus_${musId}`,
        name: mus,
        type: 'museum',
        val: 14,
        color: typeColors.museum,
        icon: '🏛️',
        info: `The cultural institution that preserves and displays this masterpiece.`
      });

      // Link Museum to its Location
      const loc = museumToLocation.get(mus);
      if (loc) {
        const lid = sanitizeId(loc);
        links.push({ source: `loc_${lid}`, target: `mus_${musId}`, label: 'Located In' });
      }
    });

    // 6. Add Artwork Nodes (History)
    items.forEach(item => {
      const a = normalizeName(item.details.artist || 'Unknown Artist');
      const l = item.details.location ? normalizeName(item.details.location) : null;
      const t = item.details.type ? normalizeName(item.details.type) : null;
      const mus = item.details.museum ? normalizeName(item.details.museum) : null;

      const aid = sanitizeId(a);
      const lid = l ? sanitizeId(l) : null;
      const tid = t ? sanitizeId(t) : null;
      const musId = mus ? sanitizeId(mus) : null;

      nodes.push({
        id: `work_${item.id}`,
        name: item.details.title,
        type: 'artwork',
        val: 9,
        color: typeColors.artwork,
        icon: '🖼️',
        itemId: item.id,
        info: `${item.details.title} (${item.details.year}). ${item.details.description?.substring(0, 100)}...`
      });
      links.push({ source: `art_${aid}`, target: `work_${item.id}`, label: 'Created' });
      
      // Map location to museum instead of painting if museum is available
      if (lid && !musId) {
        links.push({ source: `loc_${lid}`, target: `work_${item.id}`, label: 'Located In' });
      }
      if (tid) links.push({ source: `typ_${tid}`, target: `work_${item.id}`, label: 'Categorized As' });
      if (musId) links.push({ source: `mus_${musId}`, target: `work_${item.id}`, label: 'Exhibited At' });
    });

    // 7. Add Semantic Influence Links from entityDetails cache
    Object.entries(entityDetails).forEach(([nodeId, details]) => {
      const entity = details as EntityDetails;
      if (entity.relatedEntities) {
        entity.relatedEntities.forEach(rel => {
          const relId = rel.type === 'artist' ? `art_${sanitizeId(rel.name)}` : `mov_${sanitizeId(rel.name)}`;
          
          // Only add the related node if it doesn't exist yet
          const exists = nodes.find(n => n.id === relId);
          if (!exists) {
            nodes.push({
              id: relId,
              name: rel.name,
              type: rel.type as any,
              val: 7, // Smaller since it's a discovered/secondary node
              color: rel.type === 'artist' ? typeColors.artist : typeColors.movement,
              icon: rel.type === 'artist' ? '👤' : '📔',
              info: rel.description
            });
          }

          // Add the semantic link
          const relationshipLabel = rel.relationship.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          
          // Avoid duplicate links
          const linkExists = links.find(l => 
            (l.source === nodeId && l.target === relId) || 
            (l.source === relId && l.target === nodeId)
          );
          
          if (!linkExists) {
            // Directional logic for influence
            if (rel.relationship === 'influenced_by') {
              links.push({ source: relId, target: nodeId, label: relationshipLabel });
            } else {
              links.push({ source: nodeId, target: relId, label: relationshipLabel });
            }
          }
        });
      }
    });
    
    return { nodes, links };
  }, [items, bucketListItems, entityDetails]);

  // Graph diff: runs after graphData is declared
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const key = 'kg_last_visit_nodes';
    const stored = localStorage.getItem(key);
    const previousIds: string[] = stored ? JSON.parse(stored) : [];
    const currentIds = graphData.nodes.map(n => n.id);
    const isNew = new Set(currentIds.filter(id => !previousIds.includes(id)));
    setNewNodeIds(isNew);
    localStorage.setItem(key, JSON.stringify(currentIds));
  }, [graphData.nodes.length]);

  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  /**
   * Toggles the collapsed state of a node. 
   * Collapsing a node hides all its incoming edges and recursively hides upstream nodes
   * that only connected to the graph through this path.
   */
  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // Collapse hides a node's children (downstream nodes).
  // A child is hidden if every one of its incoming links comes from a collapsed or already-hidden node.
  const filteredGraphData = useMemo(() => {
    const { nodes, links } = graphData;

    const visibleByTypeNodes = nodes.filter(n => visibleTypes.has(n.type));
    const visibleByTypeIds = new Set(visibleByTypeNodes.map(n => n.id));

    // Build parent map: targetId -> Set<sourceId> (only within visible-by-type nodes)
    const parents = new Map<string, Set<string>>();
    visibleByTypeNodes.forEach(n => parents.set(n.id, new Set()));
    links.forEach(l => {
      const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (visibleByTypeIds.has(src) && visibleByTypeIds.has(tgt)) {
        parents.get(tgt)?.add(src);
      }
    });

    // BFS downward from collapsed nodes: hide a child only if ALL its parents
    // are collapsed or already hidden (so nodes with multiple parents survive).
    const hiddenByCollapse = new Set<string>();
    const queue: string[] = [];

    const tryHideChildren = (parentId: string) => {
      links.forEach(l => {
        const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (src !== parentId || !visibleByTypeIds.has(tgt) || hiddenByCollapse.has(tgt)) return;
        const nodeParents = parents.get(tgt) ?? new Set<string>();
        const allBlocked = [...nodeParents].every(
          p => collapsedNodes.has(p) || hiddenByCollapse.has(p)
        );
        if (allBlocked) {
          hiddenByCollapse.add(tgt);
          queue.push(tgt);
        }
      });
    };

    collapsedNodes.forEach(id => {
      if (visibleByTypeIds.has(id)) tryHideChildren(id);
    });
    while (queue.length > 0) {
      tryHideChildren(queue.shift()!);
    }

    const visibleNodes = visibleByTypeNodes.filter(n => !hiddenByCollapse.has(n.id));
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    const visibleLinks = links.filter(l => {
      const src = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (!visibleNodeIds.has(src) || !visibleNodeIds.has(tgt)) return false;
      if (hideAllLinks) return false;
      if (focusSelectedOnly && selectedNode) {
        return src === selectedNode.id || tgt === selectedNode.id;
      }
      // Hide outgoing links from collapsed nodes
      if (collapsedNodes.has(src)) return false;
      return true;
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, visibleTypes, collapsedNodes, hideAllLinks, focusSelectedOnly, selectedNode]);

  // Track neighbors and neighbor links for highlighting
  const { neighbors, neighborLinks } = useMemo(() => {
    const neighbors = new Set<string>();
    const neighborLinks = new Set<string>();
    
    if (selectedNode) {
      filteredGraphData.links.forEach(link => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
        
        if (sourceId === selectedNode.id || targetId === selectedNode.id) {
          neighbors.add(sourceId);
          neighbors.add(targetId);
          neighborLinks.add(`${sourceId}-${targetId}`);
        }
      });
    }
    
    return { neighbors, neighborLinks };
  }, [selectedNode, filteredGraphData.links]);

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
    setIsInfoPanelVisible(true);

    // Zoom and center
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(3, 1000);
    }

    await fetchEntity(n);
  }, [fetchEntity]);

  const exportGraphPng = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `art-connections-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  // Auto-fit graph when data first loads
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (!fgRef.current || filteredGraphData.nodes.length === 0) return;
    if (hasFittedRef.current) return;
    hasFittedRef.current = true;
    setTimeout(() => fgRef.current?.zoomToFit(600, 60), 800);
  }, [filteredGraphData.nodes.length]);

  // Custom Node Rendering — geometric circles with thumbnails for artworks
  const renderNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const r = node.val;
    const isSelected = selectedNode?.id === node.id;
    const isNeighbor = neighbors.has(node.id);
    const isDimmed = selectedNode && !isSelected && !isNeighbor;
    const fill = typeColors[node.type as keyof typeof typeColors] ?? '#888';
    const border = typeBorders[node.type as keyof typeof typeBorders] ?? '#555';

    ctx.save();
    ctx.globalAlpha = isDimmed ? 0.12 : 1;

    // Outer selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 5 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = '#E05050';
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }

    // Gold ring for newly added nodes (diff mode)
    if (newNodeIds.has(node.id) && !isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(212, 170, 60, 0.8)';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    // Pulsing neighbor highlight ring
    if (isNeighbor && !isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 3 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(224, 80, 80, 0.35)';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Collapsed dashed ring
    if (collapsedNodes.has(node.id)) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 3 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = '#C4A484';
      ctx.setLineDash([3 / globalScale, 3 / globalScale]);
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Fill circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5 / globalScale;
    ctx.stroke();

    // Non-artwork nodes: draw vector icon inside circle
    if (node.type !== 'artwork') {
      drawNodeIcon(ctx, node.type, node.x, node.y, r);
    }

    // Artwork nodes: clip and draw thumbnail
    if (node.type === 'artwork' && node.itemId) {
      const img = imgCache.current.get(node.itemId);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r - 0.5 / globalScale, 0, 2 * Math.PI);
        ctx.clip();
        const d = r * 2;
        ctx.drawImage(img, node.x - r, node.y - r, d, d);
        ctx.restore();
        // Thin inner border over image
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }
    }

    // Label — always visible but scale-capped; larger for bigger nodes
    const minScale = node.type === 'movement' ? 0.5 : node.type === 'artist' || node.type === 'museum' ? 0.8 : 1.2;
    if (globalScale >= minScale) {
      const baseFontSize = node.type === 'movement' ? 14 : node.type === 'artist' || node.type === 'museum' ? 11 : 9;
      const fontSize = Math.min(baseFontSize, 20) / globalScale;
      ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = node.y + r + 3 / globalScale;

      // White knockout for readability
      ctx.shadowBlur = 5 / globalScale;
      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.fillStyle = isSelected ? '#C4351A' : '#101010';
      ctx.fillText(node.name, node.x, labelY);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }, [collapsedNodes, selectedNode, neighbors, imgCacheVersion, newNodeIds]);

  const renderLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const MAX_FONT_SIZE = 4;
    const LABEL_NODE_MARGIN = 2; // Extra margin so labels don't overlap icons
    const start = link.source;
    const end = link.target;

    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
    const isHighlighted = neighborLinks.has(`${sourceId}-${targetId}`);
    const isDimmed = selectedNode && !isHighlighted;

    // Only render labels if they exist and zoom is high enough
    if (!link.label || globalScale < 2.5) return;

    // If node selected, only show labels for highlighted links
    if (selectedNode && !isHighlighted) return;

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
      {filteredGraphData.nodes.length > 0 && (
        <button
          onClick={exportGraphPng}
          title="Export graph as PNG"
          className="absolute top-4 right-4 z-20 p-2 bg-white/70 backdrop-blur-md rounded-xl border border-artistic-ink/10 shadow-sm hover:bg-white transition-colors"
        >
          <Download className="w-4 h-4 text-artistic-ink/60" />
        </button>
      )}
      {(filteredGraphData.nodes.length > 0) ? (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={filteredGraphData}
          backgroundColor="transparent"
          nodeCanvasObject={renderNode}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val + 4, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link: any) => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            return neighborLinks.has(`${sourceId}-${targetId}`)
              ? 'rgba(200, 60, 60, 0.7)'
              : 'rgba(26, 26, 26, 0.25)';
          }}
          linkDirectionalParticles={(link: any) => {
            if (!selectedNode) return 1;
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            return neighborLinks.has(`${sourceId}-${targetId}`) ? 4 : 0;
          }}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={(link: any) => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            return neighborLinks.has(`${sourceId}-${targetId}`) ? '#E05050' : '#C4A484';
          }}
          linkCurvature={0.15}
          linkColor={(link: any) => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            const isHighlighted = neighborLinks.has(`${sourceId}-${targetId}`);
            if (isHighlighted) return 'rgba(200, 60, 60, 0.55)';
            if (selectedNode) return 'rgba(26, 26, 26, 0.04)';
            return 'rgba(26, 26, 26, 0.2)';
          }}
          linkWidth={(link: any) => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            return neighborLinks.has(`${sourceId}-${targetId}`) ? 2 : 1;
          }}
          linkCanvasObject={renderLink}
          linkCanvasObjectMode={() => 'after'}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.3}
          onNodeClick={handleNodeClick}
          onNodeRightClick={(node: any, event) => {
            event.preventDefault();
            setSelectedNode(node as Node);
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              node: node as Node
            });
          }}
          onBackgroundClick={() => {
            setIsInfoPanelVisible(false);
            setSelectedNode(null);
          }}
          cooldownTicks={120}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
          <Network className="w-8 h-8 mb-4" />
          <p className="text-xs uppercase tracking-widest font-bold">No Neural Connections Detected</p>
          <p className="text-xs uppercase tracking-widest font-bold mt-2">Scan artworks to populate the graph</p>
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
              <p className="text-xs font-bold truncate text-artistic-ink/60 uppercase tracking-widest">{contextMenu.node.name}</p>
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
              className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
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
              className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
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
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold ${focusSelectedOnly ? 'text-artistic-accent' : 'text-artistic-ink/80'} hover:bg-artistic-accent hover:text-white rounded-xl transition-all`}
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
              className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
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
                className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
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
              className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider font-bold text-artistic-ink/80 hover:bg-artistic-accent hover:text-white rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Force Refresh Data</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Panel Overlay */}
      <AnimatePresence>
        {selectedNode && isInfoPanelVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 md:top-6 md:right-6 md:left-auto md:bottom-auto w-full md:w-80 bg-white shadow-2xl border-t md:border border-artistic-ink/10 rounded-t-3xl md:rounded-2xl p-6 z-[110] backdrop-blur-md max-h-[70vh] md:max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-6 sticky top-0 bg-white/95 pt-2 pb-2 -mt-2 -mx-2 px-2 z-20 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedNode.icon}</span>
                <span className="uppercase text-[11px] tracking-[0.3em] font-bold text-artistic-accent">
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
                  onClick={() => setFocusSelectedOnly(!focusSelectedOnly)}
                  className={`p-1 rounded-full transition-colors ${focusSelectedOnly ? 'bg-artistic-accent text-white' : 'hover:bg-artistic-shadow text-artistic-ink/40'}`}
                  title={focusSelectedOnly ? "Show All Connections" : "Focus Selected Connections"}
                >
                  <MousePointer2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => fetchEntity(selectedNode, true)}
                  className="p-1 hover:bg-artistic-shadow rounded-full transition-colors"
                  title="Refresh Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsInfoPanelVisible(false)}
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
                  <span className="text-[11px] uppercase tracking-widest font-bold opacity-40">Consulting Archive...</span>
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
                      className="w-full py-4 bg-artistic-ink text-white text-xs uppercase font-bold tracking-[0.2em] rounded-xl flex items-center justify-center gap-3 hover:bg-artistic-accent transition-colors shadow-lg shadow-artistic-ink/20 mb-8"
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
                <h4 className="text-[11px] uppercase tracking-widest font-bold text-artistic-ink/40 mb-4 px-1">
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
                          className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{art.details.title}</p>
                        <p className="text-[11px] opacity-40 uppercase tracking-widest mt-0.5">{art.details.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {relatedBucketList.length > 0 && (
              <div className="mb-8">
                <h4 className="text-[11px] uppercase tracking-widest font-bold text-artistic-ink/40 mb-4 px-1">
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
                          className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{art.details.title}</p>
                        <p className="text-[11px] opacity-40 uppercase tracking-widest mt-0.5">{art.details.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.type === 'artwork' && (
              <button 
                onClick={() => onArtworkClick(selectedNode.itemId!)}
                className="w-full py-4 bg-artistic-ink text-white text-xs uppercase font-bold tracking-[0.2em] rounded-xl flex items-center justify-center gap-3 hover:bg-artistic-accent transition-colors shadow-lg shadow-artistic-ink/20"
              >
                <span>View Details</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`absolute bottom-6 left-6 flex flex-col gap-2 bg-white/70 backdrop-blur-md rounded-2xl border border-artistic-ink/5 shadow-sm z-10 transition-all duration-300 ${isFiltersMinimized ? 'p-2 w-auto md:min-w-0' : 'p-4 md:p-5 w-[calc(100%-3rem)] md:w-auto md:min-w-[200px]'}`}>
          <div className="flex items-center justify-between gap-4 mb-2">
            {!isFiltersMinimized && <span className="text-xs uppercase tracking-[0.2em] font-bold text-artistic-ink/40">Filters</span>}
            <div className="flex gap-2 items-center">
              {!isFiltersMinimized && (
                <>
                  <button 
                    onClick={() => setVisibleTypes(new Set(['movement', 'artist', 'artwork', 'location', 'type', 'museum']))}
                    className="text-[11px] uppercase font-bold text-artistic-accent hover:underline"
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setVisibleTypes(new Set())}
                    className="text-[11px] uppercase font-bold text-artistic-ink/40 hover:text-red-500 transition-colors"
                  >
                    None
                  </button>
                </>
              )}
              <button 
                onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                className="p-1 hover:bg-artistic-ink/5 rounded-full transition-colors"
                title={isFiltersMinimized ? "Expand Filters" : "Minimize Filters"}
              >
                {isFiltersMinimized ? <SlidersHorizontal className="w-3.5 h-3.5 opacity-40" /> : <ChevronDown className="w-3.5 h-3.5 opacity-40" />}
              </button>
            </div>
          </div>

          {!isFiltersMinimized && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4">
                <div 
                  onClick={() => toggleType('movement')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('movement') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">🎨</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Styles</span>
                </div>
                <div 
                  onClick={() => toggleType('artist')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('artist') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">👨‍🎨</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Artists</span>
                </div>
                <div 
                  onClick={() => toggleType('artwork')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('artwork') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">🖼️</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Paintings</span>
                </div>
                <div 
                  onClick={() => toggleType('location')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('location') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">📍</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Locations</span>
                </div>
                <div 
                  onClick={() => toggleType('museum')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('museum') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">🏛️</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Museums</span>
                </div>
                <div 
                  onClick={() => toggleType('type')}
                  className={`flex items-center gap-3 cursor-pointer transition-all hover:bg-white/50 p-1.5 rounded-lg -mx-1.5 ${visibleTypes.has('type') ? 'opacity-100' : 'opacity-30'}`}
                >
                    <span className="text-lg">🏺</span>
                    <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Types</span>
                </div>
              </div>

              {newNodeIds.size > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-artistic-ink/5">
                  <span className="w-3 h-3 rounded-full border-2 border-yellow-500 flex-shrink-0" />
                  <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">{newNodeIds.size} new since last visit</span>
                </div>
              )}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-artistic-ink/5">
                <button 
                  onClick={() => setHideAllLinks(!hideAllLinks)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${hideAllLinks ? 'bg-red-50 border-red-200 text-red-600' : 'bg-artistic-shadow/10 border-transparent text-artistic-ink/60'}`}
                  title={hideAllLinks ? "Show All Connections" : "Hide All Connections"}
                >
                  {hideAllLinks ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span className="text-[11px] uppercase tracking-wider font-bold">Connections</span>
                </button>
                <button 
                  onClick={() => setFocusSelectedOnly(!focusSelectedOnly)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${focusSelectedOnly ? 'bg-artistic-accent text-white border-artistic-accent' : 'bg-artistic-shadow/10 border-transparent text-artistic-ink/60'}`}
                  title={focusSelectedOnly ? "Show All Connections" : "Focus Selected Connections"}
                >
                  <MousePointer2 className="w-3 h-3" />
                  <span className="text-[11px] uppercase tracking-wider font-bold">Focus</span>
                </button>
              </div>
            </>
          )}
      </div>
    </div>
  );
};

