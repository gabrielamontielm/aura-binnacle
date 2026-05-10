import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import heicConvert from "heic-convert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

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
