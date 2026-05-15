/**
 * Art-related services using server-side Gemini API proxy and Firestore.
 */
import axios from 'axios';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { sanitizeForFirestore } from './firebase';

/**
 * Sanitizes a string for use as a Firestore document ID.
 */
export function sanitizeId(name: string): string {
  if (!name) return 'unknown';
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
}

/**
 * Normalizes a name string for consistency.
 */
export function normalizeName(name: string): string {
  if (!name) return 'Unknown';
  const normalized = name.trim().replace(/\s+/g, ' ');
  return normalized.split(' ').map(word => {
    if (word.length === 0) return '';
    if (word.includes('.') || word.length < 2) return word;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Searches for a masterpiece based on a plain text query via server API.
 */
export async function searchArtwork(query: string): Promise<ArtDetails> {
  try {
    const response = await axios.post('/api/art/search', { query });
    const data: ArtDetails = response.data;
    
    // Normalize and sync
    data.artist = normalizeName(data.artist);
    if (data.museum) data.museum = normalizeName(data.museum);
    syncArtworkEntities(data).catch(e => console.warn("Background Sync Error:", e));

    return data;
  } catch (error) {
    console.error("AI Search Error:", error);
    throw error;
  }
}

/**
 * Returns a canonical document ID for an entity.
 */
export function getCanonicalId(name: string): string {
  return sanitizeId(name);
}

/**
 * Structure for artwork identification details.
 */
export interface ArtDetails {
  title: string;
  artist: string;
  year: string;
  movement: string;
  medium: string;
  museum?: string;
  location?: string;
  type: string;
  description: string;
  historicalContext: string;
}

/**
 * Identifies an artwork from a base64 encoded image via server API.
 */
export async function identifyArtwork(base64Image: string, mimeType: string = "image/jpeg"): Promise<ArtDetails> {
  try {
    const response = await axios.post('/api/art/identify', { base64Image, mimeType });
    const data: ArtDetails = response.data;

    // Normalize results after parsing
    data.artist = normalizeName(data.artist);
    data.movement = normalizeName(data.movement);
    if (data.museum) data.museum = normalizeName(data.museum);
    if (data.location) data.location = normalizeName(data.location);
    data.type = normalizeName(data.type);

    // Seed entity metadata in background
    syncArtworkEntities(data).catch(e => console.warn("Background Sync Error:", e));

    return data;
  } catch (error: any) {
    console.error("AI Identify Error:", error);
    throw error;
  }
}

/**
 * Identifies an artwork from a URL via server API.
 */
export async function identifyArtworkFromUrl(imageUrl: string, titleHint?: string, artistHint?: string): Promise<ArtDetails> {
  try {
     if (imageUrl.startsWith('data:')) {
       return identifyArtwork(imageUrl.split(',')[1], imageUrl.split(';')[0].split(':')[1]);
     }
     return identifyArtworkByText(titleHint || imageUrl, artistHint || '');
  } catch (error: any) {
    console.error("AI Identify URL Error:", error);
    throw error;
  }
}

/**
 * Detailed information for an artist or art movement.
 */
export interface EntityDetails {
  name: string;
  type: 'artist' | 'movement' | 'museum' | 'type' | 'location';
  yearsOrPeriod: string;
  originOrRegion: string;
  significance: string;
  detailedDescription: string;
  keyCharacteristics: string[];
  historicalImpact: string;
  curatorialSummary: string;
  famousWorks: { title: string; year: string; museum?: string; location?: string; imageUrl?: string }[];
}

/**
 * Triggers entity metadata synchronization for all entities found in an artwork.
 */
export async function syncArtworkEntities(details: ArtDetails) {
  const entities = [
    { name: details.artist, type: 'artist' },
    { name: details.movement, type: 'movement' },
    { name: details.museum, type: 'museum' },
    { name: details.location, type: 'location' },
    { name: details.type, type: 'type' }
  ];

  for (const entity of entities) {
    if (entity.name && entity.name !== 'Unknown' && entity.name !== 'unknown') {
      try {
        await getEntityDetails(entity.name, entity.type as any, false);
      } catch (err) {
        console.warn(`Could not sync entity ${entity.name}:`, err);
      }
    }
  }
}

/**
 * Fetches comprehensive details for an artist or movement via server API.
 */
export async function getEntityDetails(name: string, type: 'artist' | 'movement' | 'museum' | 'type' | 'location', forceRefresh: boolean = false): Promise<EntityDetails> {
  const collectionName = type === 'artist' 
    ? 'metadata_artists' 
    : type === 'movement' 
        ? 'metadata_movements'
        : type === 'museum'
            ? 'metadata_museums'
            : type === 'location'
                ? 'metadata_locations'
                : 'metadata_types';
  const id = sanitizeId(name);
  const docRef = doc(db, collectionName, id);

  let existingData: EntityDetails | null = null;
  try {
    const cachedDoc = await getDoc(docRef);
    if (cachedDoc.exists()) {
      existingData = cachedDoc.data() as EntityDetails;
      if (!forceRefresh) return existingData;
    }
  } catch (error) {
    console.error("Metadata Fetch Error:", error);
  }

  try {
    const contextPrompt = existingData 
      ? `\n\nCRITICAL: We already have some metadata for this entity: ${JSON.stringify(existingData)}. 
         Please SYNTHESIZE and ENRICH this information with fresh insights.`
      : "";

    const response = await axios.post('/api/art/entity-details', { name, type, contextPrompt });
    const data = response.data;

    // Save to cache
    try {
      await setDoc(docRef, sanitizeForFirestore(data));
    } catch (e) {
      console.warn("Failed to cache entity details, proceeding without caching.", e);
    }

    return data;
  } catch (error: any) {
    console.error("AI Entity Error:", error);
    throw error;
  }
}

export interface Recommendation {
  title: string;
  artist: string;
  museum?: string;
  reason: string;
  imageUrl?: string;
}

/**
 * Gets similar masterpiece recommendations via server API.
 */
export async function getRecommendations(details: ArtDetails): Promise<Recommendation[]> {
  try {
    const response = await axios.post('/api/art/recommendations', { details });
    return response.data.recommendations || [];
  } catch (error) {
    console.error("Recommendations Error:", error);
    return [];
  }
}

/**
 * Identifies artwork by text hints via server API.
 */
export async function identifyArtworkByText(title: string, artist: string): Promise<ArtDetails> {
  try {
    const response = await axios.post('/api/art/search', { query: `${title} by ${artist}` });
    return response.data;
  } catch (error) {
    console.error("AI Text Identity Error:", error);
    throw error;
  }
}

export interface ItineraryRoute {
  city: string;
  summary: string;
  route: {
    museum: string;
    works: string[];
    insight: string;
    order: number;
  }[];
  suggestions: {
    title: string;
    artist: string;
    museum: string;
    reason: string;
    imageUrl?: string;
  }[];
  travelTips: string;
}

/**
 * Generates an art itinerary via server API.
 */
export async function generateItinerary(city: string, artworks: { title: string; museum: string }[], userInterests: string[]): Promise<ItineraryRoute> {
  try {
    const artworksText = artworks.map(a => `- "${a.title}" at ${a.museum}`).join('\n');
    const interestsText = userInterests.length > 0 ? `The user is interested in: ${userInterests.join(', ')}.` : "";
    
    const response = await axios.post('/api/art/itinerary', { city, artworksText, interestsText });
    return response.data;
  } catch (error: any) {
    console.error("AI Itinerary Error:", error);
    throw error;
  }
}
