import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import heicConvert from "heic-convert";
import { OAuth2Client } from "google-auth-library";
import session from "express-session";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ path: '.env.local', override: false });
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
console.log(process.env.GEMINI_API_KEY);

// Simple persistent cache
class AICache {
  private cachePath: string;
  private cache: Record<string, any> = {};
  private isSaving = false;
  private pendingSave = false;

  constructor(name: string) {
    this.cachePath = path.join(process.cwd(), `cache_${name}.json`);
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = fs.readFileSync(this.cachePath, 'utf8');
        this.cache = JSON.parse(data);
      }
    } catch (e) {
      console.error(`Failed to load cache ${this.cachePath}`, e);
    }
  }

  private async save() {
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }

    this.isSaving = true;
    try {
      await fs.promises.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (e) {
      console.error(`Failed to save cache ${this.cachePath}`, e);
    } finally {
      this.isSaving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        this.save();
      }
    }
  }

  get(key: string) {
    return this.cache[key];
  }

  set(key: string, value: any) {
    this.cache[key] = value;
    this.save();
  }

  generateKey(...parts: string[]) {
    return parts.join('|').toLowerCase().trim();
  }

  generateImageKey(base64: string) {
    return crypto.createHash('md5').update(base64).digest('hex');
  }
}

const searchCache = new AICache('search');
const recsCache = new AICache('recs');
const entityCache = new AICache('entity');
const quizCache = new AICache('quiz');
const identifyCache = new AICache('identify');
const itineraryCache = new AICache('itinerary');

declare module 'express-session' {
  interface SessionData {
    tokens: any;
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_PHOTOS_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;

async function startServer() {
  const app = express();
  const PORT = 5000;

  app.set('trust proxy', 1);

  app.use(express.json({ limit: '50mb' }));

  // Session configuration for Iframe environments (AI Studio)
  app.use(session({
    secret: process.env.SESSION_SECRET || "art-curator-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // Required for SameSite=None
      sameSite: 'none', // Required for cross-origin iframe
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Google Photos OAuth Endpoints
  app.get("/api/auth/google-photos/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google Photos credentials not configured" });
    }

    // Determine base URL dynamically
    const host = req.get('x-forwarded-host') || req.get('host') || "";
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocal ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/auth/google-photos/callback`;

    const client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/photoslibrary.readonly"],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get(["/auth/google-photos/callback", "/auth/google-photos/callback/"], async (req, res) => {
    const { code } = req.query;
    try {
      const host = req.get('x-forwarded-host') || req.get('host') || "";
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const protocol = isLocal ? 'http' : 'https';
      const redirectUri = `${protocol}://${host}/auth/google-photos/callback`;
      
      const client = new OAuth2Client(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const { tokens } = await client.getToken(code as string);
      (req.session as any).tokens = tokens;
      console.log("Tokens saved to session:", req.sessionID);
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_PHOTOS_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window now.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Fetch Google Photos Media Items
  app.get("/api/google-photos/media", async (req, res) => {
    const tokens = (req.session as any).tokens;
    console.log("Session ID:", req.sessionID);
    console.log("Tokens present in session:", !!tokens);
    if (!tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { nextPageToken } = req.query;

    const host = req.get('x-forwarded-host') || req.get('host') || "";
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocal ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/auth/google-photos/callback`;

    const client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    client.setCredentials(tokens);

    try {
      console.log("Fetching Google Photos media items with OAuth2Client...");
      const accessToken = await client.getAccessToken();
      
      const response = await axios.get("https://photoslibrary.googleapis.com/v1/mediaItems", {
        headers: {
          Authorization: `Bearer ${accessToken.token}`
        },
        params: {
          pageSize: 24,
          pageToken: nextPageToken
        }
      });
      
      console.log("Google Photos API Response keys:", Object.keys(response.data));
      res.json(response.data);
    } catch (error: any) {
      console.error("Photos API Error:", error.response?.data || error.message);
      if (error.response?.status === 401) {
        return res.status(401).json({ error: "Session expired" });
      }
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  // HEIC to PNG Conversion Endpoint
  app.post("/api/convert-heic", async (req, res) => {
    try {
      const { base64 } = req.body;
      if (!base64) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log("Server: Received HEIC for conversion...");
      const inputBuffer = Buffer.from(base64, 'base64');
      
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'PNG'
      });

      console.log("Server: Conversion successful.");
      res.json({ 
        base64: Buffer.from(outputBuffer as Buffer).toString('base64'),
        mimeType: 'image/png'
      });
    } catch (error) {
      console.error("Server HEIC Error:", error);
      res.status(500).json({ error: "Failed to convert HEIC image" });
    }
  });

  // Art Identification Endpoint
  app.post("/api/art/identify", async (req, res) => {
    try {
      const { base64Image, mimeType } = req.body;
      const cacheKey = identifyCache.generateImageKey(base64Image);
      const cached = identifyCache.get(cacheKey);
      if (cached) return res.json(cached);

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

      const result = JSON.parse(response.text || "{}");
      identifyCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Art Identification API Error:", error);
      res.status(500).json({ error: "Failed to identify artwork" });
    }
  });

  // Art Search Endpoint
  app.post("/api/art/search", async (req, res) => {
    try {
      const { query: searchQuery } = req.body;
      const cacheKey = searchCache.generateKey(searchQuery);
      const cached = searchCache.get(cacheKey);
      if (cached) return res.json(cached);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Search for a world-famous masterpiece that matches this description: "${searchQuery}". 
                If multiple matches are possible, pick the most iconic one. 
                Provide comprehensive details in JSON format: title, artist, year, movement, medium, museum, location, type, description, and historicalContext.
                IMPORTANT: Try to provide a direct image URL from a public domain source like Wikimedia Commons in the imageUrl field if you can identify it with high confidence.`,
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
              museum: { type: Type.STRING },
              location: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
              historicalContext: { type: Type.STRING },
              imageUrl: { type: Type.STRING },
            },
            required: ["title", "artist", "year", "movement", "medium", "type", "description", "historicalContext"],
          },
        },
      });

      const result = JSON.parse(response.text || "{}");
      searchCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Art Search API Error:", error);
      res.status(500).json({ error: "Failed to search artwork" });
    }
  });

  // Recommendations Endpoint
  app.post("/api/art/recommendations", async (req, res) => {
    try {
      const { details } = req.body;
      const cacheKey = recsCache.generateKey(details.title, details.artist);
      const cached = recsCache.get(cacheKey);
      if (cached) return res.json(cached);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Based on this artwork: "${details.title}" by ${details.artist} (${details.movement}), build an "Artist Graph" of 5 deeply connected masterpieces. 
                Instead of just simple visual similarity, look for semantic and historical connections:
                1. Influenced by: An earlier work that directly shaped this one.
                2. Later influence: A later masterpiece that was directly inspired by this work/artist.
                3. Peer discovery: A work by a contemporary artist with a strong stylistic or thematic link.
                4. Thematic sibling: A work from a different era or culture that shares the same deep human concern.
                5. Technical parallel: A work with similar experimental application of medium or perspective.
                
                For each connection, provide a 'relationshipType' (e.g., 'Legacy', 'Inspiration', 'Peer', 'Thematic', 'Technique') and a 'relationshipDetail' (very short descriptive label like 'Direct Inspiration' or 'Stylistic Peer').
                Format the response as JSON.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    artist: { type: Type.STRING },
                    museum: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    imageUrl: { type: Type.STRING },
                    relationshipType: { type: Type.STRING },
                    relationshipDetail: { type: Type.STRING }
                  },
                  required: ["title", "artist", "reason", "relationshipType", "relationshipDetail"]
                }
              }
            },
            required: ["recommendations"],
          },
        },
      });

      const result = JSON.parse(response.text || "{}");
      recsCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Recommendations API Error:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  // Entity Details Endpoint
  app.post("/api/art/entity-details", async (req, res) => {
    try {
      const { name, type, contextPrompt } = req.body;
      const cacheKey = entityCache.generateKey(name, type);
      const cached = entityCache.get(cacheKey);
      if (cached) return res.json(cached);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Provide a comprehensive curatorial report for the following ${type}: "${name}". ${contextPrompt || ""}
                Format the response as JSON.`,
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
              },
              relatedEntities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING }, // artist or movement
                    relationship: { type: Type.STRING }, // influenced_by, influenced, collaborated_with, rival_of
                    description: { type: Type.STRING }
                  },
                  required: ["name", "type", "relationship", "description"]
                }
              }
            },
            required: ["name", "type", "yearsOrPeriod", "originOrRegion", "significance", "detailedDescription", "keyCharacteristics", "historicalImpact", "curatorialSummary", "famousWorks"],
          },
        },
      });

      const result = JSON.parse(response.text || "{}");
      entityCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Entity Details API Error:", error);
      res.status(500).json({ error: "Failed to get entity details" });
    }
  });

  // Itinerary Endpoint
  app.post("/api/art/itinerary", async (req, res) => {
    try {
      const { city, artworksText, interestsText } = req.body;
      const cacheKey = itineraryCache.generateKey(city, artworksText, interestsText);
      const cached = itineraryCache.get(cacheKey);
      if (cached) return res.json(cached);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `You are an expert art travel curator. Create a "Masterpiece Route" for one day in ${city} based on these specific bucket list artworks:
                ${artworksText}
                ${interestsText}
                Format the response as JSON.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              city: { type: Type.STRING },
              summary: { type: Type.STRING },
              route: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    museum: { type: Type.STRING },
                    works: { type: Type.ARRAY, items: { type: Type.STRING } },
                    insight: { type: Type.STRING },
                    order: { type: Type.NUMBER }
                  },
                  required: ["museum", "works", "insight", "order"]
                }
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    artist: { type: Type.STRING },
                    museum: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    imageUrl: { type: Type.STRING }
                  },
                  required: ["title", "artist", "museum", "reason"]
                }
              },
              travelTips: { type: Type.STRING }
            },
            required: ["city", "summary", "route", "suggestions", "travelTips"],
          },
        },
      });

      const result = JSON.parse(response.text || "{}");
      itineraryCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Itinerary API Error:", error);
      res.status(500).json({ error: "Failed to generate itinerary" });
    }
  });

  // Museum Masterpieces Endpoint
  app.post("/api/museum/masterpieces", async (req, res) => {
    try {
      const { museum, force } = req.body;
      if (!museum) return res.status(400).json({ error: "museum required" });

      const cacheKey = searchCache.generateKey('museum-masterpieces', museum);
      if (!force) {
        const cached = searchCache.get(cacheKey);
        if (cached) return res.json(cached);
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          role: 'user',
          parts: [{
            text: `List exactly 8 of the most iconic masterpieces permanently housed in "${museum}".
For each work provide: title, artist, year (string), movement, medium, a 1-sentence description, and optionally a public-domain imageUrl from Wikimedia Commons (https://upload.wikimedia.org/...).
Return ONLY a JSON object with keys "museum" (string), "city" (string), and "masterpieces" (array of 8 objects).`,
          }]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              museum: { type: Type.STRING },
              city: { type: Type.STRING },
              masterpieces: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    artist: { type: Type.STRING },
                    year: { type: Type.STRING },
                    movement: { type: Type.STRING },
                    medium: { type: Type.STRING },
                    description: { type: Type.STRING },
                    imageUrl: { type: Type.STRING },
                  },
                }
              }
            },
            required: ["museum", "masterpieces"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from model");
      const result = JSON.parse(text);
      if (!result.masterpieces?.length) throw new Error("No masterpieces in response");
      searchCache.set(cacheKey, result);
      res.json(result);
    } catch (error: any) {
      console.error("Museum Masterpieces API Error:", error?.message || error);
      res.status(500).json({ error: "Failed to fetch museum masterpieces", detail: error?.message });
    }
  });

  // Daily Quiz Endpoint
  app.get("/api/art/daily-quiz", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = quizCache.generateKey(today);
      const cached = quizCache.get(cacheKey);
      if (cached) return res.json(cached);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          role: 'user',
          parts: [{
            text: `Generate 20 distinct art history quiz questions about world-famous masterpieces. 
            For each, provide: 
            1. artworkTitle
            2. imageUrl (MUST be a direct, high-quality public domain link from Wikimedia Commons using the format https://upload.wikimedia.org/wikipedia/commons/...)
            3. type ('artist', 'movement', or 'period')
            4. correctAnswer
            5. 4 options (including the correct one)
            6. a helpful hint.`,
          }]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                artworkTitle: { type: Type.STRING },
                imageUrl: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['artist', 'movement', 'period'] },
                correctAnswer: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                hint: { type: Type.STRING }
              },
              required: ['artworkTitle', 'imageUrl', 'type', 'correctAnswer', 'options', 'hint']
            }
          }
        }
      });

      const result = JSON.parse(response.text || "[]");
      quizCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error("Daily Quiz API Error:", error);
      res.status(500).json({ error: "Failed to generate quiz" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
