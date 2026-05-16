import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoryItem } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { TrendingUp, Clock, Palette, Shapes, History as HistoryIcon, Layout, X, Sparkles } from 'lucide-react';

interface CuratorInsightsProps {
  history: HistoryItem[];
}

/**
 * CuratorInsights Component
 * 
 * Provides an interactive visualization of the user's art collection.
 * Features:
 * - Chronological Journey: A scrollable timeline of artworks based on their historical year.
 * - Movement Dominance: Bar chart showing distribution across art movements.
 * - Medium Composition: Pie chart showing the mix of artistic mediums.
 * - Curatorial Diversity: Summary stats of collection types.
 */
export const CuratorInsights: React.FC<CuratorInsightsProps> = ({ history }) => {
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  /**
   * Aggregates and transforms history data for visualization.
   * Extracts years (supporting BCE), movements, mediums, and types.
   */
  const stats = useMemo(() => {
    const movements: Record<string, number> = {};
    const mediums: Record<string, number> = {};
    const types: Record<string, number> = {};
    const timelineData: { year: number; displayYear: string; title: string; image: string; artist: string }[] = [];

    history.forEach(item => {
      const details = item.details;
      
      // Aggregate Movements
      const mvt = details.movement || 'Unknown';
      movements[mvt] = (movements[mvt] || 0) + 1;

      // Aggregate Mediums
      const med = details.medium || 'Unknown';
      mediums[med] = (mediums[med] || 0) + 1;

      // Aggregate Types
      const type = details.type || 'Unknown';
      types[type] = (types[type] || 0) + 1;

      // Parse Year for Timeline
      // Handle BCE/BC by making them negative
      const isBCE = /BCE|BC/i.test(details.year);
      const yearMatch = details.year.match(/(\d+)/); 
      
      if (yearMatch) {
        let year = parseInt(yearMatch[1]);
        if (isBCE) year = -year;
        
        timelineData.push({
          year,
          displayYear: details.year, // Keep original for tooltip/display
          title: details.title,
          image: item.image,
          artist: details.artist
        });
      }
    });

    // Sort timeline by year
    timelineData.sort((a, b) => a.year - b.year);

    // Convert to Recharts format
    const movementChartData = Object.entries(movements)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const mediumChartData = Object.entries(mediums)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const typeChartData = Object.entries(types)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { movementChartData, mediumChartData, typeChartData, timelineData };
  }, [history]);

  const COLORS = ['#D4AF37', '#2C3E50', '#8E44AD', '#E67E22', '#273746'];

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-artistic-ink/40">
        <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium uppercase tracking-widest">Add more art to see curator insights</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Chronological Timeline */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-artistic-accent/10 rounded-full flex items-center justify-center text-artistic-accent">
            <HistoryIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-medium text-artistic-ink tracking-tight">Chronological Journey</h2>
            <p className="text-xs text-artistic-ink/40 uppercase tracking-widest font-bold">Evolution of your collection</p>
          </div>
        </div>

        <div className="relative overflow-x-auto pb-8 mask-fade-right">
          <div className="flex gap-12 min-w-max px-4 pt-10">
            {stats.timelineData.map((item, index) => (
              <motion.div 
                key={`${item.title}-${index}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative flex flex-col items-center w-48 group"
              >
                {/* Year Marker */}
                <div className="absolute -top-10 flex flex-col items-center">
                  <span className="text-sm font-serif italic text-artistic-accent whitespace-nowrap">{item.displayYear}</span>
                  <div className="w-px h-6 bg-artistic-accent/30 mt-1" />
                </div>

                {/* Artwork Card */}
                <div className="w-40 aspect-[3/4] bg-artistic-shadow rounded-sm overflow-hidden shadow-sm border border-artistic-ink/5 group-hover:scale-105 group-hover:-rotate-1 transition-all duration-500">
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-artistic-ink/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-[10px] text-white font-bold truncate">{item.title}</p>
                    <p className="text-[8px] text-white/70 uppercase tracking-wider truncate">{item.artist}</p>
                  </div>
                </div>

                {/* Connecting Line */}
                {index < stats.timelineData.length - 1 && (
                  <div className="absolute top-1/2 -right-12 w-12 h-px bg-artistic-accent/20" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Curator Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Movement Distribution */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/50 backdrop-blur-md rounded-3xl p-8 border border-artistic-ink/5 shadow-xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-5 h-5 text-artistic-accent" />
            <h3 className="font-medium text-artistic-ink">Movement Dominance</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.movementChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  tick={{ fontSize: 10, fill: '#2C3E50', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  itemStyle={{ fontSize: '10px', color: '#D4AF37', fontWeight: 'bold', textTransform: 'uppercase' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#D4AF37" 
                  radius={[0, 4, 4, 0]} 
                  animationDuration={1500}
                  className="cursor-pointer"
                  onClick={(data) => setSelectedMovement(data.name)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Medium Mix */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/50 backdrop-blur-md rounded-3xl p-8 border border-artistic-ink/5 shadow-xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <Shapes className="w-5 h-5 text-artistic-accent" />
            <h3 className="font-medium text-artistic-ink">Medium Composition</h3>
          </div>
          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.mediumChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  className="cursor-pointer"
                >
                  {stats.mediumChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 pr-4">
              {stats.mediumChartData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-artistic-ink/60">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Selected Movement Masterpieces */}
        <AnimatePresence>
          {selectedMovement && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:col-span-2 overflow-hidden"
            >
              <div className="bg-artistic-accent/5 rounded-3xl p-8 border border-artistic-accent/10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-artistic-accent" />
                    <h3 className="font-serif italic text-2xl text-artistic-ink">
                      {selectedMovement} <span className="font-sans text-xs not-italic uppercase tracking-widest text-artistic-ink/40 ml-2">Movements</span>
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedMovement(null)}
                    className="p-2 hover:bg-artistic-accent/10 rounded-full transition-colors text-artistic-ink/40 hover:text-artistic-ink"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                  {history
                    .filter(item => item.details.movement === selectedMovement)
                    .map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative"
                      >
                        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-artistic-shadow border border-artistic-ink/5 shadow-sm group-hover:shadow-xl transition-all duration-500 group-hover:-translate-y-1">
                          <img 
                            src={item.image} 
                            alt={item.details.title} 
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-artistic-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <p className="text-[9px] text-white font-bold truncate">{item.details.title}</p>
                            <p className="text-[7px] text-white/70 uppercase tracking-widest truncate">{item.details.artist}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected Type Masterpieces */}
        <AnimatePresence>
          {selectedType && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:col-span-2 overflow-hidden"
            >
              <div className="bg-artistic-bg rounded-3xl p-8 border border-artistic-ink/10 shadow-inner">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <Layout className="w-5 h-5 text-artistic-ink" />
                    <h3 className="font-serif italic text-2xl text-artistic-ink">
                      {selectedType} <span className="font-sans text-xs not-italic uppercase tracking-widest text-artistic-ink/40 ml-2">Diversity Collection</span>
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedType(null)}
                    className="p-2 hover:bg-artistic-ink/5 rounded-full transition-colors text-artistic-ink/40 hover:text-artistic-ink"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                  {history
                    .filter(item => item.details.type === selectedType)
                    .map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group relative"
                      >
                        <div className="aspect-square rounded-full overflow-hidden bg-artistic-shadow border border-artistic-ink/5 shadow-sm hover:scale-110 transition-transform duration-500">
                          <img 
                            src={item.image} 
                            alt={item.details.title} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-artistic-ink/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
                            <p className="text-[8px] text-white font-bold uppercase tracking-widest leading-tight">{item.details.title}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection Density Overlay - using Type data */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-2 bg-artistic-ink text-artistic-bg rounded-3xl p-8 border border-white/10 shadow-2xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <TrendingUp className="w-32 h-32" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <Layout className="w-5 h-5 text-artistic-accent" />
              <h3 className="font-medium text-white">Curatorial Diversity</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {stats.typeChartData.map((type, index) => (
                <motion.button 
                  key={type.name}
                  onClick={() => setSelectedType(type.name === selectedType ? null : type.name)}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ delay: 0.3 + (index * 0.1) }}
                  className={`text-left rounded-2xl p-4 border transition-all ${selectedType === type.name ? 'bg-artistic-accent border-artistic-accent text-artistic-ink' : 'bg-white/10 border-white/5 hover:border-white/20'}`}
                >
                  <p className={`text-3xl font-serif mb-1 ${selectedType === type.name ? 'text-artistic-ink' : 'text-artistic-accent'}`}>{type.count}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.2em] line-clamp-1 ${selectedType === type.name ? 'text-artistic-ink' : 'opacity-60'}`}>{type.name}</p>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
