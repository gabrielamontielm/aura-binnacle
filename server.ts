import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import heicConvert from "heic-convert";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // AI Identification Endpoint
  app.post("/api/identify-artwork", async (req, res) => {
    try {
      const { base64Image, mimeType } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "No image data provided" });
      }

      console.log("Server: Identifying artwork...");
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

      res.json(JSON.parse(result.text));
    } catch (error) {
      console.error("Server AI Identify Error:", error);
      res.status(500).json({ error: "Failed to identify artwork" });
    }
  });

  // AI Entity Details Endpoint
  app.post("/api/entity-details", async (req, res) => {
    try {
      const { name, type } = req.body;
      if (!name || !type) {
        return res.status(400).json({ error: "Name and type are required" });
      }

      console.log(`Server: Fetching details for ${type}: ${name}...`);
      const result = await ai.models.generateContent({
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
                - keyCharacteristics: A list of 3-4 defining traits or styles
                - historicalImpact: Their long-term legacy (2-3 sentences)
                - curatorialSummary: An engaging short summary (around 200 characters) for a quick overview`,
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
              keyCharacteristics: { type: Type.ARRAY, items: { type: Type.STRING } },
              historicalImpact: { type: Type.STRING },
              curatorialSummary: { type: Type.STRING },
            },
            required: ["name", "type", "yearsOrPeriod", "originOrRegion", "significance", "keyCharacteristics", "historicalImpact", "curatorialSummary"],
          }
        }
      });

      res.json(JSON.parse(result.text));
    } catch (error) {
      console.error("Server AI Entity Error:", error);
      res.status(500).json({ error: "Failed to fetch entity details" });
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
