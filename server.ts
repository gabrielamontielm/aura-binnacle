import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import heicConvert from "heic-convert";
import { OAuth2Client } from "google-auth-library";
import session from "express-session";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

declare module 'express-session' {
  interface SessionData {
    tokens: any;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_PHOTOS_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_PHOTOS_CLIENT_SECRET;

async function startServer() {
  const app = express();
  const PORT = 3000;

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
