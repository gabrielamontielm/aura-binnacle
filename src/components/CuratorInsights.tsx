import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { HistoryItem } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { TrendingUp, Clock, Palette, Shapes, History as HistoryIcon, Layout } from 'lucide-react';

interface CuratorInsightsProps {
  history: HistoryItem[];
}

export const CuratorInsights: React.FC<CuratorInsightsProps> = ({ history }) => {
  // 1. Data Parsing & Aggregation
  const stats = useMemo(() => {
    const movements: Record<string, number> = {};
    const mediums: Record<string, number> = {};
    const types: Record<string, number> = {};
    const timelineData: { year: number; title: string; image: string; artist: string }[] = [];

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
                  <span className="text-sm font-serif italic text-artistic-accent whitespace-nowrap">{(item as any).displayYear}</span>
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
                >
                  {stats.mediumChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                <motion.div 
                  key={type.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + (index * 0.1) }}
                  className="bg-white/10 rounded-2xl p-4 border border-white/5"
                >
                  <p className="text-3xl font-serif text-artistic-accent mb-1">{type.count}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 line-clamp-1">{type.name}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
