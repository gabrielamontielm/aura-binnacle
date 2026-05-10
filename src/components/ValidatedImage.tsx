import React, { useState, useEffect } from 'react';

interface ValidatedImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const ValidatedImage: React.FC<ValidatedImageProps> = ({ src, alt, className }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => setIsValid(true);
    img.onerror = () => setIsValid(false);
  }, [src]);

  if (isValid === false) {
    return (
      <div className={`${className} bg-gray-200 flex items-center justify-center`}>
        <span className="text-[10px] text-gray-400">Artwork not available</span>
      </div>
    );
  }

  if (isValid === null) {
     return <div className={`${className} bg-gray-100 animate-pulse`} />;
  }

  return <img src={src} alt={alt} className={className} />;
};
