import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';

declare global {
  namespace Express {
    interface Request {
      user?: {
        localId: string;
        email: string;
        displayName?: string;
        [key: string]: any;
      };
    }
  }
}

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
  
  app.use(express.json({ limit: '100kb' }));

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

  // Helper to verify Firebase ID Token in Express (resilient to missing config / guest mode)
  const verifyFirebaseToken = asyncHandler(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = undefined;
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1]?.trim();
    if (!idToken) {
      req.user = undefined;
      return next();
    }

    let apiKey = cachedFirebaseApiKey || process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
          apiKey = config.apiKey || '';
          cachedFirebaseApiKey = apiKey;
        }
      } catch (e) {
        console.error("Failed to read firebase config in middleware:", e);
      }
    }

    if (!apiKey) {
      req.user = undefined;
      return next();
    }

    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      if (!response.ok) {
        console.warn("Google identity toolkit token validation returned non-ok status");
        req.user = undefined;
        return next();
      }

      const decoded = await response.json() as any;
      if (decoded.users && decoded.users.length > 0) {
        req.user = decoded.users[0];
      } else {
        req.user = undefined;
      }
      next();
    } catch (err) {
      console.error("Token verification exception:", err);
      req.user = undefined;
      next();
    }
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/fitness/advice', adviceLimiter, verifyFirebaseToken, asyncHandler(async (req, res) => {
    const { exercise, history } = req.body;

    if (!exercise || typeof exercise !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing exercise object' });
    }

    const rawName = exercise.name;
    const rawReps = exercise.reps;

    if (typeof rawName !== 'string' || rawName.trim().length === 0 || rawName.length > 100) {
      return res.status(400).json({ error: 'Exercise name must be a non-empty string under 100 characters' });
    }

    // Sanitize exercise name to block prompt injections (allow only alphanumeric, spaces, parentheses, slashes, hyphens)
    const cleanName = rawName.replace(/[^a-zA-Z0-9\s()/\-+]/g, '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Exercise name contains invalid characters' });
    }

    // Sanitize and limit reps representation
    const cleanReps = String(rawReps).replace(/[^a-zA-Z0-9\s()/\-+]/g, '').trim().substring(0, 50);

    // Validate history payload safely to avoid massive deep nesting or huge text
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({ error: 'History must be an array' });
    }

    const cleanHistory: any[] = [];
    if (Array.isArray(history)) {
      if (history.length > 5) {
        return res.status(400).json({ error: 'History exceeds safe depth limits' });
      }

      for (const h of history) {
        if (h && typeof h === 'object') {
          const cleanSets: any[] = [];
          if (Array.isArray(h.sets)) {
            for (const s of h.sets) {
              if (s && typeof s === 'object') {
                cleanSets.push({
                  weight: String(s.weight || '').replace(/[^0-9.]/g, '').substring(0, 10),
                  reps: String(s.reps || '').replace(/[^0-9]/g, '').substring(0, 10),
                  done: !!s.done
                });
              }
            }
          }
          cleanHistory.push({
            date: String(h.date || '').substring(0, 20),
            workoutType: String(h.workoutType || '').substring(0, 20),
            sets: cleanSets
          });
        }
      }
    }

    const prompt = `
      You are a professional fitness coach. Analyze the following progress for the exercise: "${cleanName}".
      Target Reps: ${cleanReps}

      Historical Data (last 3 sessions):
      ${JSON.stringify(cleanHistory, null, 2)}

      provide a short (1-2 sentence) specific coaching advice.
      Should the user increase the weight, focus on slowing down the negative, or stay at the same weight to hit rep targets?
      Be technical but encouraging. Format your response in plain text.
    `;

    try {
      const aiClient = getAiClient();
      let response;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 12000);

        response = await aiClient.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            abortSignal: controller.signal
          } as any
        });
        
        clearTimeout(timeoutId);
      } catch (firstErr: any) {
        const isAbort = firstErr?.name === 'AbortError' || firstErr?.message?.includes('aborted');
        if (isAbort) {
          throw new Error('TIMEOUT');
        }
        
        console.warn('Primary model (gemini-3.6-flash) failed or high demand. Attempting fallback model (gemini-3.1-flash-lite):', firstErr);
        
        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(() => {
          fallbackController.abort();
        }, 10000);

        response = await aiClient.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: prompt,
          config: {
            abortSignal: fallbackController.signal
          } as any
        });

        clearTimeout(fallbackTimeoutId);
      }

      res.json({ suggestion: response.text || "Keep up the intensity! Focus on perfect form." });
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || error?.message === 'TIMEOUT' || error?.message?.includes('aborted');
      if (isAbort) {
        console.error('Gemini Request Timed Out (limit exceeded)');
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
