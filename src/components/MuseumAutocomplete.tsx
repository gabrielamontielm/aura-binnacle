import React, { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface MuseumAutocompleteProps {
  value: string;
  onPlaceSelect: (placeName: string) => void;
  onCancel: () => void;
  className?: string;
}

export const MuseumAutocomplete: React.FC<MuseumAutocompleteProps> = ({ 
  value, 
  onPlaceSelect, 
  onCancel,
  className 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !containerRef.current) return;

    // Create the autocomplete element
    const autocompleteElement = new (placesLib as any).PlaceAutocompleteElement({
      types: ['museum', 'art_gallery', 'establishment'],
    });

    // Set initial value if needed, though PlaceAutocompleteElement usually starts empty
    // To set initial text, we'd need to access the internal input if possible, 
    // but the documented way is to just let user type.
    
    // Style the custom element to match our design
    autocompleteElement.classList.add('aura-autocomplete');
    
    const style = document.createElement('style');
    style.textContent = `
      .aura-autocomplete {
        width: 100%;
        background: transparent !sync;
      }
      .aura-autocomplete::part(input) {
        width: 100%;
        font-family: inherit;
        font-size: 0.75rem; /* text-xs */
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        background: white;
        border: 1px solid rgba(10, 10, 10, 0.2);
        border-radius: 0.25rem;
        outline: none;
        transition: border-color 0.2s;
      }
      .aura-autocomplete::part(input):focus {
        border-color: #f59e0b; /* artistic-accent */
      }
    `;
    document.head.appendChild(style);

    const handlePlaceSelect = (event: any) => {
      const place = event.target.value;
      if (place && place.displayName) {
        onPlaceSelect(place.displayName);
      }
    };

    autocompleteElement.addEventListener('gmp-placeselect', handlePlaceSelect);
    containerRef.current.appendChild(autocompleteElement);

    return () => {
      autocompleteElement.removeEventListener('gmp-placeselect', handlePlaceSelect);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      document.head.removeChild(style);
    };
  }, [placesLib, onPlaceSelect]);

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full" />
      <div className="flex justify-end gap-2 mt-2">
        <button 
          onClick={onCancel}
          className="text-xs uppercase font-bold text-red-500 hover:opacity-70 transition-opacity"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
