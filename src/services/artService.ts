
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ArtDetails {
  title: string;
  artist: string;
  year: string;
  movement: string;
  medium: string;
  description: string;
  historicalContext: string;
}

export async function identifyArtwork(base64Image: string, mimeType: string = "image/jpeg"): Promise<ArtDetails> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: "Identify this artwork and provide details in a structured format. If it's a famous piece, provide accurate historical context. If it is not a recognizable artwork, analyze its style and provide a professional curatorial description as if it were in a gallery.",
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
            description: { type: Type.STRING },
            historicalContext: { type: Type.STRING },
          },
          required: ["title", "artist", "year", "movement", "medium", "description", "historicalContext"],
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
  famousWorks: { title: string; year: string }[];
}

export async function getEntityDetails(name: string, type: 'artist' | 'movement'): Promise<EntityDetails> {
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
              - famousWorks: A list of 3-5 most famous artworks by this artist or associated with this movement. For each work include title and year.`,
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
                  year: { type: Type.STRING }
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

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("AI Entity Error:", error);
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.message?.includes("429")) {
      throw new Error("API_LIMIT_REACHED: Your Google AI Studio credits are depleted. Please check your billing at https://ai.studio/projects");
    }
    throw error;
  }
}
