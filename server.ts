import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());

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

  // API Routes
  app.post('/api/fitness/advice', adviceLimiter, async (req, res) => {
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
      
      const generatePromise = aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 12000); // 12-second security timeout
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      res.json({ suggestion: response.text || "Keep up the intensity! Focus on perfect form." });
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT') {
        console.error('Gemini Request Timed Out (12s limit)');
        return res.status(504).json({ error: 'Coaching server request timed out. Please try again soon.' });
      }
      console.error('Gemini Error or client init error:', error);
      res.status(500).json({ error: 'Failed to generate advice. Please ensure GEMINI_API_KEY is configured.' });
    }
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

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
