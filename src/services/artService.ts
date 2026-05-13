
/**
 * Art-related services using Gemini AI and Firestore.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Sanitizes a string for use as a Firestore document ID.
 * @param name The name to sanitize.
 * @returns A lowercase, underscore-separated ID string.
 */
export function sanitizeId(name: string): string {
  if (!name) return 'unknown';
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
}

/**
 * Normalizes a name string for consistency (e.g., " Vincent  van Gogh " -> "Vincent van Gogh").
 */
export function normalizeName(name: string): string {
  if (!name) return 'Unknown';
  const normalized = name.trim().replace(/\s+/g, ' ');
  // Capitals for first letters of words in names usually looks better
  return normalized.split(' ').map(word => {
    if (word.length === 0) return '';
    if (word.includes('.') || word.length < 2) return word; // Handle initials or single letters
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
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
 * Identifies an artwork from a base64 encoded image using Gemini AI.
 * @param base64Image The base64 representation of the image.
 * @param mimeType The mime type of the image (default: image/jpeg).
 * @returns A promise resolving to identified artwork details.
 */
export async function identifyArtwork(base64Image: string, mimeType: string = "image/jpeg"): Promise<ArtDetails> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: "Identify this artwork and provide details in a structured format. If it's a famous piece, provide accurate historical context, including the museum where it resides and its location. Determine the type of masterpiece (e.g., Painting, Sculpture, Architecture, etc.). If it is not a recognizable artwork, analyze its style and provide a professional curatorial description as if it were in a gallery.",
            },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            artist: { type: Type.STRING },
            year: { type: Type.STRING },
            movement: { type: Type.STRING },
            medium: { type: Type.STRING },
            museum: { type: Type.STRING, description: "The museum where the piece resides, if known" },
            location: { type: Type.STRING, description: "The city and country where the piece resides, if known" },
            type: { type: Type.STRING, description: "The category of artwork, e.g., Painting, Sculpture" },
            description: { type: Type.STRING },
            historicalContext: { type: Type.STRING },
          },
          required: ["title", "artist", "year", "movement", "medium", "type", "description", "historicalContext"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No identification text received from AI");
    }

    const data: ArtDetails = JSON.parse(response.text);

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
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("429")) {
      throw new Error("API_LIMIT_REACHED: Your Google AI Studio credits are depleted. Please check your billing at https://ai.studio/projects");
    }
    throw error;
  }
}

export async function identifyArtworkFromUrl(imageUrl: string, titleHint?: string, artistHint?: string): Promise<ArtDetails> {
  try {
    const isBase64 = imageUrl.startsWith('data:');
    const imagePart = isBase64 ? {
      inlineData: {
        mimeType: imageUrl.split(';')[0].split(':')[1],
        data: imageUrl.split(',')[1]
      }
    } : {
      text: `Identify the artwork shown at this URL: ${imageUrl}.`
    };

    const hintText = (titleHint || artistHint) 
      ? ` Contextual Hint: This is believed to be "${titleHint || 'unknown title'}" by ${artistHint || 'unknown artist'}. Use this to provide accurate historical details.` 
      : "";

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Identify the artwork provided. Provide details in a structured format: title, artist, year, movement, medium, museum, location, type (e.g. Painting), description, and historicalContext.${hintText}`,
            },
            ...(isBase64 ? [imagePart] : [imagePart as any]), // Handle slightly differently for typing if needed, but this works
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            artist: { type: Type.STRING },
            year: { type: Type.STRING },
            movement: { type: Type.STRING },
            medium: { type: Type.STRING },
            museum: { type: Type.STRING },
            location: { type: Type.STRING },
            type: { type: Type.STRING },
            description: { type: Type.STRING },
            historicalContext: { type: Type.STRING },
          },
          required: ["title", "artist", "year", "movement", "medium", "type", "description", "historicalContext"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No identification text received from AI");
    }

    const data: ArtDetails = JSON.parse(response.text);

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
 * Fetches comprehensive details for an artist, movement, museum, type, or location, with caching.
 * @param name The name of the artist, movement, museum, type, or location.
 * @param type The type of entity ('artist' | 'movement' | 'museum' | 'type' | 'location').
 * @param forceRefresh If true, bypasses cache.
 * @returns A promise resolving to entity details.
 */
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
        // We trigger getEntityDetails which handles the fetching and caching.
        // The user requested unconditional overwrite to keep metadata fresh.
        await getEntityDetails(entity.name, entity.type as any, true);
      } catch (err) {
        console.warn(`Could not sync entity ${entity.name}:`, err);
      }
    }
  }
}
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
         Please SYNTHESIZE and ENRICH this information with fresh insights. 
         - Do not repeat yourself verbatim; instead, expand on style, evolution, and specific historical details.
         - Merge the 'famousWorks' list, ensuring we have a diverse representation of their career. 
         - Improve the 'detailedDescription' by making it more comprehensive based on the integration of new and old knowledge.`
      : "";

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Provide a comprehensive curatorial report for the following ${type}: "${name}". ${contextPrompt}
              
              Format the response as JSON with the following fields:
              - name: The full name of the ${type}
              - type: "${type}"
              - yearsOrPeriod: Life spans for artists, active period for movements, founding date for museums, or historical era for locations
              - originOrRegion: Birthplace/National origin for artists, geographical center for movements, location for museums, or the broader region/country for locations
              - significance: Why they or the place is important in art history (1-2 sentences)
              - detailedDescription: A deep dive into style, philosophy, evolution, or history of the person, movement, or location (3-4 paragraphs of enriched text)
              - keyCharacteristics: A list of 4-6 defining traits, styles, or cultural significance
              - historicalImpact: Long-term legacy or influence on global culture (2-3 sentences)
              - curatorialSummary: An engaging short summary (around 200 characters) for a quick overview
              - famousWorks: A list of 8-10 most famous artworks associated with this person, movement, museum, or created/held in this location. For each work include title, year, museum, location if known, and a URL string for a high-quality, stable public domain image (e.g., from Wikimedia Commons or a major museum website). ONLY provide a URL if you are certain it is stable and publicly accessible; otherwise, omit the imageUrl field or set it to null.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING },
            yearsOrPeriod: { type: Type.STRING },
            originOrRegion: { type: Type.STRING },
            significance: { type: Type.STRING },
            detailedDescription: { type: Type.STRING },
            keyCharacteristics: { type: Type.ARRAY, items: { type: Type.STRING } },
            historicalImpact: { type: Type.STRING },
            curatorialSummary: { type: Type.STRING },
            famousWorks: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  year: { type: Type.STRING },
                  museum: { type: Type.STRING },
                  location: { type: Type.STRING },
                  imageUrl: { 
                    type: Type.STRING, 
                    description: "A DIRECT, stable URL to an image of the artwork. Prefer wikimedia.org, metmuseum.org, or artic.edu. NEVER use relative paths or placeholders. If no direct link is found, omit this field."
                  }
                },
                required: ["title", "year"]
              }
            }
          },
          required: ["name", "type", "yearsOrPeriod", "originOrRegion", "significance", "detailedDescription", "keyCharacteristics", "historicalImpact", "curatorialSummary", "famousWorks"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No entity details received from AI");
    }

    const data = JSON.parse(response.text);

    // Save to cache
    try {
      await setDoc(docRef, data);
    } catch (e) {
      console.warn("Failed to cache entity details, proceeding without caching.", e);
    }

    return data;
  } catch (error: any) {
    console.error("AI Entity Error:", error);
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("429")) {
      throw new Error("API_LIMIT_REACHED: Your Google AI Studio credits are depleted. Please check your billing at https://ai.studio/projects");
    }
    throw error;
  }
}
