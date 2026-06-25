import React, { useState, useEffect } from 'react';

interface ValidatedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const ValidatedImage: React.FC<ValidatedImageProps> = ({ src, alt, className, fallback }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!src) {
      setIsValid(false);
      return;
    }
    const img = new Image();
    img.src = src;
    img.onload = () => setIsValid(true);
    img.onerror = () => setIsValid(false);
  }, [src]);

  if (isValid === false) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className={`${className} bg-gray-200 flex items-center justify-center p-2 text-center`}>
        <span className="text-xs text-gray-400">Artwork not available</span>
      </div>
    );
  }

  if (isValid === null) {
     return <div className={`${className} bg-gray-100 animate-pulse`} />;
  }

  return <img src={src} alt={alt} className={className} />;
};
