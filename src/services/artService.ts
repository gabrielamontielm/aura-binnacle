import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: "Identify this artwork and provide details in a structured format. If it's a famous piece, provide accurate historical context. If it is not a recognizable artwork, analyze its style and provide a professional curatorial description as if it were in a gallery.",
          },
          {
            inlineData: {
              mimeType,
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

  return JSON.parse(result.text);
}

export async function getEntityDetails(name: string, type: 'artist' | 'movement'): Promise<string> {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Provide a concise, professional, and engaging curatorial summary for the following ${type}: "${name}". Focus on their significance in art history, their key characteristics, and their impact. Keep it under 300 characters.`,
          },
        ],
      },
    ],
  });

  return result.text;
}
