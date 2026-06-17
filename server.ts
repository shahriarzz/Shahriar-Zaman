import express from 'express';
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

  // API Routes
  app.post('/api/fitness/advice', async (req, res) => {
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
      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ suggestion: response.text || "Keep up the intensity! Focus on perfect form." });
    } catch (error) {
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

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
