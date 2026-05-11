
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
function sanitizeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
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

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("AI Identify Error:", error);
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("429")) {
      throw new Error("API_LIMIT_REACHED: Your Google AI Studio credits are depleted. Please check your billing at https://ai.studio/projects");
    }
    throw error;
  }
}

export async function identifyArtworkFromUrl(imageUrl: string): Promise<ArtDetails> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Identify the artwork shown at this URL: ${imageUrl}. Provide details in a structured format: title, artist, year, movement, medium, museum, location, type (e.g. Painting), description, and historicalContext.`,
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

    return JSON.parse(response.text);
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
  type: 'artist' | 'movement';
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
 * Fetches comprehensive details for an artist or movement, with caching.
 * @param name The name of the artist or movement.
 * @param type The type of entity ('artist' or 'movement').
 * @returns A promise resolving to entity details.
 */
export async function getEntityDetails(name: string, type: 'artist' | 'movement'): Promise<EntityDetails> {
  const collectionName = type === 'artist' ? 'metadata_artists' : 'metadata_movements';
  const id = sanitizeId(name);
  const docRef = doc(db, collectionName, id);

  try {
    const cachedDoc = await getDoc(docRef);
    if (cachedDoc.exists()) {
      return cachedDoc.data() as EntityDetails;
    }
  } catch (error) {
    console.error("Cache Read Error:", error);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Provide a comprehensive curatorial report for the following ${type}: "${name}". 
              Format the response as JSON with the following fields:
              - name: The full name of the ${type}
              - type: "${type}"
              - yearsOrPeriod: Life spans for artists or active period for movements
              - originOrRegion: Birthplace/National origin or geographical center of movement
              - significance: Why they are important in art history (1-2 sentences)
              - detailedDescription: A deep dive into their style, philosophy, and evolution (3-4 paragraphs)
              - keyCharacteristics: A list of 3-4 defining traits or styles
              - historicalImpact: Their long-term legacy (2-3 sentences)
              - curatorialSummary: An engaging short summary (around 200 characters) for a quick overview
              - famousWorks: A list of 3-5 most famous artworks by this artist or associated with this movement. For each work include title, year, museum, location if known, and a URL string for an image if available.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
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
                  imageUrl: { type: Type.STRING }
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
    await setDoc(docRef, data);

    return data;
  } catch (error: any) {
    console.error("AI Entity Error:", error);
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("429")) {
      throw new Error("API_LIMIT_REACHED: Your Google AI Studio credits are depleted. Please check your billing at https://ai.studio/projects");
    }
    throw error;
  }
}
