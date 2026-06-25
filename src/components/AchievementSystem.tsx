import React from 'react';
import { Award, Star, Zap, Shield, Trophy, Medal } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';

interface AchievementSystemProps {
  profile: UserProfile;
}

const BADGES = [
  { id: 'impressionist-trainee', name: 'Impressionist Trainee', movement: 'Impressionism', threshold: 1, icon: Star, color: 'text-blue-400' },
  { id: 'impressionist-expert', name: 'Impressionist Expert', movement: 'Impressionism', threshold: 5, icon: Zap, color: 'text-blue-600' },
  { id: 'renaissance-apprentice', name: 'Renaissance Apprentice', movement: 'Renaissance', threshold: 1, icon: Shield, color: 'text-amber-500' },
  { id: 'renaissance-master', name: 'Renaissance Master', movement: 'Renaissance', threshold: 5, icon: Trophy, color: 'text-amber-700' },
  { id: 'modernist-explorer', name: 'Modernist Explorer', movement: 'Modernism', threshold: 1, icon: Medal, color: 'text-red-500' },
  { id: 'connoisseur-initiate', name: 'Connoisseur Initiate', total: 1, icon: Award, color: 'text-purple-400' },
  { id: 'art-historian', name: 'Art Historian', total: 10, icon: Award, color: 'text-purple-600' },
];

export const AchievementSystem: React.FC<AchievementSystemProps> = ({ profile }) => {
  const xpForNextLevel = (profile.level || 1) * 100;
  const progress = ((profile.totalXP || 0) % xpForNextLevel) / xpForNextLevel * 100;

  return (
    <div className="space-y-8 p-6 bg-artistic-shadow/20 rounded-3xl border border-artistic-ink/5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-[0.4em] font-bold text-artistic-accent block mb-1">Rank</span>
          <h3 className="text-2xl font-serif italic">Level {profile.level || 1} Connoisseur</h3>
        </div>
        <div className="text-right">
          <span className="text-xs uppercase tracking-widest font-bold opacity-40 block mb-1">{profile.totalXP || 0} Total XP</span>
          <div className="w-32 h-2 bg-artistic-ink/10 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-artistic-accent"
            />
          </div>
        </div>
      </div>

      <div>
        <span className="text-xs uppercase tracking-[0.4em] font-bold text-artistic-ink/40 block mb-6">Badges & Achievements</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {BADGES.map((badge) => {
            const isEarned = profile.badges?.includes(badge.id);
            const BadgeIcon = badge.icon;
            
            return (
              <motion.div
                key={badge.id}
                whileHover={isEarned ? { scale: 1.05 } : {}}
                className={`p-4 rounded-2xl border flex flex-col items-center text-center transition-all ${isEarned ? 'bg-white border-artistic-ink/10 shadow-sm' : 'bg-transparent border-dashed border-artistic-ink/5 opacity-30 grayscale'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isEarned ? 'bg-artistic-shadow' : 'bg-transparent'}`}>
                  <BadgeIcon className={`w-6 h-6 ${isEarned ? badge.color : 'text-artistic-ink'}`} />
                </div>
                <span className="text-xs font-bold uppercase tracking-tight leading-tight">{badge.name}</span>
                {badge.movement && (
                  <span className="text-[11px] opacity-40 mt-1">{badge.movement}</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
