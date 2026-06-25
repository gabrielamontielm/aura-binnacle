import React from 'react';

const shimmer = 'animate-pulse bg-artistic-shadow';

export const SkeletonArtCard: React.FC = () => (
  <div className="group">
    <div className={`aspect-[4/5] ${shimmer} mb-6 rounded-sm`} />
    <div className={`h-5 w-3/4 ${shimmer} rounded mb-2`} />
    <div className={`h-3 w-1/2 ${shimmer} rounded`} />
  </div>
);

export const SkeletonGalleryGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonArtCard key={i} />
    ))}
  </div>
);

export const SkeletonInsights: React.FC = () => (
  <div className="space-y-12 pb-20">
    {/* Timeline skeleton */}
    <section>
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-full ${shimmer}`} />
        <div className="space-y-2">
          <div className={`h-5 w-48 rounded ${shimmer}`} />
          <div className={`h-3 w-32 rounded ${shimmer}`} />
        </div>
      </div>
      <div className="flex gap-12 overflow-hidden pb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center w-48 shrink-0">
            <div className={`h-4 w-16 rounded mb-4 ${shimmer}`} />
            <div className={`w-40 aspect-[3/4] rounded-sm ${shimmer}`} />
          </div>
        ))}
      </div>
    </section>

    {/* Charts skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className={`rounded-3xl p-8 border border-artistic-ink/5 ${shimmer} h-[380px]`} />
      <div className={`rounded-3xl p-8 border border-artistic-ink/5 ${shimmer} h-[380px]`} />
      <div className={`md:col-span-2 rounded-3xl p-8 border border-artistic-ink/5 ${shimmer} h-[160px]`} />
    </div>
  </div>
);
