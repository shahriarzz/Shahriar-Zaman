import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function startServer() {
  const app = express();
  
  // Enable trusting proxy headers to prevent express-rate-limit validation warnings/errors
  app.set('trust proxy', 1);
  
  // Safe incoming requests logging for debugging API interactions (limited to api routes)
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });
  
  app.use(express.json());

  // Cache firebase config key at startup
  let cachedFirebaseApiKey = '';
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      cachedFirebaseApiKey = config.apiKey || '';
    }
  } catch (err) {
    console.error("Failed to perform initial firebase config load:", err);
  }

  let ai: GoogleGenAI | null = null;
  const getAiClient = () => {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return ai;
  };

  // API Rate Limiting for the AI Coach Advice route
  const adviceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 30, // Limit each IP to 30 requests per 15 minutes
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many advice requests. Please focus on your training sets and try again in 15 minutes.' }
  });

  // Helper wrapper for async Express routes to prevent unhandled promise exceptions
  const asyncHandler = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) => 
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // Helper to verify Firebase ID Token in Express
  const verifyFirebaseToken = asyncHandler(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header style.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: Missing token.' });
    }

    let apiKey = cachedFirebaseApiKey || process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
          apiKey = config.apiKey || '';
          cachedFirebaseApiKey = apiKey; // cache for next requests
        }
      } catch (e) {
        console.error("Failed to read firebase config in middleware:", e);
      }
    }

    // Secondary fallback to process env if config on disk doesn't have it
    if (!apiKey) {
      apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '';
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Server misconfiguration: Firebase API key not found. Please setup Firebase or provide VITE_FIREBASE_API_KEY in secrets.' });
    }

    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        console.warn("Google identity toolkit validation failed:", errDetail);
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired credentials.' });
      }

      const decoded = await response.json() as any;
      if (!decoded.users || decoded.users.length === 0) {
        return res.status(401).json({ error: 'Unauthorized: User account not found.' });
      }

      (req as any).user = decoded.users[0];
      next();
    } catch (err) {
      console.error("Token verification exception:", err);
      res.status(500).json({ error: 'Internal system validation error.' });
    }
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/fitness/advice', verifyFirebaseToken, adviceLimiter, asyncHandler(async (req, res) => {
    const { exercise, history } = req.body;

    if (!exercise) {
      return res.status(400).json({ error: 'Exercise info required' });
    }

    const prompt = `
      You are a professional fitness coach. Analyze the following progress for the exercise: "${exercise.name}".
      Target Reps: ${exercise.reps}

      Historical Data (last 3 sessions):
      ${JSON.stringify(history, null, 2)}

      provide a short (1-2 sentence) specific coaching advice.
      Should the user increase the weight, focus on slowing down the negative, or stay at the same weight to hit rep targets?
      Be technical but encouraging. Format your response in plain text.
    `;

    try {
      const aiClient = getAiClient();
      let response;
      
      try {
        const generatePromise = aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT')), 12000); // 12-second security timeout
        });

        response = await Promise.race([generatePromise, timeoutPromise]);
      } catch (firstErr) {
        // If it's a timeout error, let the outer block handle it directly
        if (firstErr instanceof Error && firstErr.message === 'TIMEOUT') {
          throw firstErr;
        }
        
        console.warn('Primary model (gemini-3.5-flash) failed or high demand. Attempting fallback model (gemini-3.1-flash-lite):', firstErr);
        
        const generatePromiseFallback = aiClient.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: prompt,
        });

        const timeoutPromiseFallback = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TIMEOUT')), 10000); // 10-second security timeout for fallback model
        });

        response = await Promise.race([generatePromiseFallback, timeoutPromiseFallback]);
      }

      res.json({ suggestion: response.text || "Keep up the intensity! Focus on perfect form." });
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT') {
        console.error('Gemini Request Timed Out (12s limit)');
        return res.status(504).json({ error: 'Coaching server request timed out. Please try again soon.' });
      }
      console.error('Gemini Error or client init error:', error);
      res.status(500).json({ error: 'Failed to generate advice. Please ensure GEMINI_API_KEY is configured.' });
    }
  }));

  // Fallback for unmatched API routes so they never return HTML SPA shell
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404 fallback] ${req.method} ${req.url} did not match any API routes.`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Express Error-handling Middleware to guarantee JSON responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error Handler caught:", err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal server error occurred.' 
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
