import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

export interface FirebaseUser {
  localId: string;
  email: string;
  displayName?: string;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: FirebaseUser;
    }
  }
}

interface HistorySetPayload {
  weight?: string | number;
  reps?: string | number;
  done?: boolean;
  [key: string]: unknown;
}

interface HistoryItemPayload {
  date?: string;
  workoutType?: string;
  sets?: HistorySetPayload[];
  [key: string]: unknown;
}

interface CleanHistorySet {
  weight: string;
  reps: string;
  done: boolean;
}

interface CleanHistorySession {
  date: string;
  workoutType: string;
  sets: CleanHistorySet[];
}

dotenv.config();

const CANDIDATE_MODELS = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview', 'gemini-flash-latest'];

function generateRuleBasedAdvice(cleanName: string, cleanReps: string, cleanHistory: CleanHistorySession[]): string {
  if (cleanHistory.length === 0) {
    return `Establish a solid baseline for ${cleanName} targeting ${cleanReps || '8–12'} controlled reps. Prioritize strict form and consistent tempo.`;
  }
  const lastSession = cleanHistory[0];
  const lastSets = (lastSession.sets || []).filter(s => s.done);
  if (lastSets.length > 0) {
    const topSet = lastSets[0];
    const topWeight = parseFloat(topSet.weight) || 0;
    const topReps = parseInt(topSet.reps, 10) || 0;
    if (topWeight > 0 && topReps >= 8) {
      return `Strong baseline on ${cleanName} (${topWeight}kg x ${topReps} reps). If you hit your target reps across all sets today, increment by 2.5kg; otherwise focus on explosive concentric tempo.`;
    } else if (topWeight > 0) {
      return `For ${cleanName}, keep load at ${topWeight}kg and focus on hitting your full ${cleanReps || 'target'} rep target with controlled 2-3 second eccentrics.`;
    }
  }
  return `Focus on progressive tension on ${cleanName}. Keep a solid core brace, pause briefly at peak contraction, and track every completed set accurately.`;
}

async function generateAiContentWithTimeout(
  aiClient: GoogleGenAI,
  model: string,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await aiClient.models.generateContent({
      model,
      contents: prompt,
      config: {
        abortSignal: controller.signal
      }
    });
    return response.text?.trim() || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted') || error.message === 'TIMEOUT';
  }
  return false;
}

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
  } catch (err: unknown) {
    console.error("Failed to perform initial firebase config load:", err);
  }

  let ai: GoogleGenAI | null = null;
  const getAiClient = (): GoogleGenAI => {
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
  const asyncHandler = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>) => 
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
      } catch (e: unknown) {
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

      const decoded = await response.json() as { users?: FirebaseUser[] };
      if (decoded.users && decoded.users.length > 0) {
        req.user = decoded.users[0];
      } else {
        req.user = undefined;
      }
      next();
    } catch (err: unknown) {
      console.error("Token verification exception:", err);
      req.user = undefined;
      next();
    }
  });

  // API Routes
  app.get(['/api/health', '/health'], (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/fitness/advice', adviceLimiter, verifyFirebaseToken, asyncHandler(async (req, res) => {
    const { exercise, history } = req.body as {
      exercise?: { name?: unknown; reps?: unknown };
      history?: unknown;
    };

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
    const cleanReps = String(rawReps ?? '').replace(/[^a-zA-Z0-9\s()/\-+]/g, '').trim().substring(0, 50);

    // Validate history payload safely to avoid massive deep nesting or huge text
    if (history !== undefined && !Array.isArray(history)) {
      return res.status(400).json({ error: 'History must be an array' });
    }

    const cleanHistory: CleanHistorySession[] = [];
    if (Array.isArray(history)) {
      if (history.length > 5) {
        return res.status(400).json({ error: 'History exceeds safe depth limits' });
      }

      for (const item of history as HistoryItemPayload[]) {
        if (item && typeof item === 'object') {
          const cleanSets: CleanHistorySet[] = [];
          if (Array.isArray(item.sets)) {
            for (const s of item.sets) {
              if (s && typeof s === 'object') {
                cleanSets.push({
                  weight: String(s.weight ?? '').replace(/[^0-9.]/g, '').substring(0, 10),
                  reps: String(s.reps ?? '').replace(/[^0-9]/g, '').substring(0, 10),
                  done: Boolean(s.done)
                });
              }
            }
          }
          cleanHistory.push({
            date: String(item.date ?? '').substring(0, 20),
            workoutType: String(item.workoutType ?? '').substring(0, 20),
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
      if (!process.env.GEMINI_API_KEY) {
        // Provide rule-based coaching gracefully if GEMINI_API_KEY is not configured
        const fallbackAdvice = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
        return res.json({ suggestion: fallbackAdvice });
      }

      const aiClient = getAiClient();
      let suggestionText = '';
      let lastModelError: unknown = null;

      for (const modelName of CANDIDATE_MODELS) {
        try {
          suggestionText = await generateAiContentWithTimeout(aiClient, modelName, prompt, 8000);
          if (suggestionText) {
            break;
          }
        } catch (modelErr: unknown) {
          lastModelError = modelErr;
          console.log(`[AI Coaching] Model ${modelName} unavailable, trying next candidate...`);
        }
      }

      if (suggestionText) {
        return res.json({ suggestion: suggestionText });
      }

      // If all candidate models experienced temporary outages (503/429/timeouts), return intelligent contextual rule-based advice
      console.log('[AI Coaching] AI models in high demand; serving contextual rule-based coaching.');
      const coachingFallback = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
      res.json({ suggestion: coachingFallback });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return res.status(504).json({ error: 'Coaching server request timed out. Please try again soon.' });
      }
      console.log('[AI Coaching] Serving rule-based fallback advice.');
      const coachingFallback = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
      res.json({ suggestion: coachingFallback });
    }
  }));

  // Fallback for unmatched API routes so they never return HTML SPA shell
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404 fallback] ${req.method} ${req.url} did not match any API routes.`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, server.cjs runs from /app/dist or /app
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application index.html not found.');
      }
    });
  }

  // Global Express Error-handling Middleware to guarantee JSON responses
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express Error Handler caught:", err);
    const status = (typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: number }).status === 'number')
      ? (err as { status: number }).status
      : 500;
    const message = err instanceof Error ? err.message : 'Internal server error occurred.';
    res.status(status).json({ 
      error: message 
    });
  });

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
