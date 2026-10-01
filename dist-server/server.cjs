var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_express_rate_limit = require("express-rate-limit");
var import_genai = require("@google/genai");
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_fs = __toESM(require("fs"), 1);
import_dotenv.default.config();
var CANDIDATE_MODELS = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-flash-latest"];
function generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory) {
  if (cleanHistory.length === 0) {
    return `Establish a solid baseline for ${cleanName} targeting ${cleanReps || "8\u201312"} controlled reps. Prioritize strict form and consistent tempo.`;
  }
  const lastSession = cleanHistory[0];
  const lastSets = (lastSession.sets || []).filter((s) => s.done);
  if (lastSets.length > 0) {
    const topSet = lastSets[0];
    const topWeight = parseFloat(topSet.weight) || 0;
    const topReps = parseInt(topSet.reps, 10) || 0;
    if (topWeight > 0 && topReps >= 8) {
      return `Strong baseline on ${cleanName} (${topWeight}kg x ${topReps} reps). If you hit your target reps across all sets today, increment by 2.5kg; otherwise focus on explosive concentric tempo.`;
    } else if (topWeight > 0) {
      return `For ${cleanName}, keep load at ${topWeight}kg and focus on hitting your full ${cleanReps || "target"} rep target with controlled 2-3 second eccentrics.`;
    }
  }
  return `Focus on progressive tension on ${cleanName}. Keep a solid core brace, pause briefly at peak contraction, and track every completed set accurately.`;
}
async function generateAiContentWithTimeout(aiClient, model, prompt, timeoutMs) {
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
    return response.text?.trim() || "";
  } finally {
    clearTimeout(timeoutId);
  }
}
function isAbortError(error) {
  if (!error) return false;
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.toLowerCase().includes("aborted") || error.message === "TIMEOUT";
  }
  return false;
}
async function startServer() {
  const app = (0, import_express.default)();
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.url.startsWith("/api")) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });
  app.use(import_express.default.json({ limit: "100kb" }));
  let cachedFirebaseApiKey = "";
  try {
    const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
    if (import_fs.default.existsSync(configPath)) {
      const config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
      cachedFirebaseApiKey = config.apiKey || "";
    }
  } catch (err) {
    console.error("Failed to perform initial firebase config load:", err);
  }
  let ai = null;
  const getAiClient = () => {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      ai = new import_genai.GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
    return ai;
  };
  const adviceLimiter = (0, import_express_rate_limit.rateLimit)({
    windowMs: 15 * 60 * 1e3,
    // 15 minutes
    limit: 30,
    // Limit each IP to 30 requests per 15 minutes
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many advice requests. Please focus on your training sets and try again in 15 minutes." }
  });
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  const verifyFirebaseToken = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = void 0;
      return next();
    }
    const idToken = authHeader.split("Bearer ")[1]?.trim();
    if (!idToken) {
      req.user = void 0;
      return next();
    }
    let apiKey = cachedFirebaseApiKey || process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      try {
        const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
        if (import_fs.default.existsSync(configPath)) {
          const config = JSON.parse(await import_fs.default.promises.readFile(configPath, "utf8"));
          apiKey = config.apiKey || "";
          cachedFirebaseApiKey = apiKey;
        }
      } catch (e) {
        console.error("Failed to read firebase config in middleware:", e);
      }
    }
    if (!apiKey) {
      req.user = void 0;
      return next();
    }
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      });
      if (!response.ok) {
        console.warn("Google identity toolkit token validation returned non-ok status");
        req.user = void 0;
        return next();
      }
      const decoded = await response.json();
      if (decoded.users && decoded.users.length > 0) {
        req.user = decoded.users[0];
      } else {
        req.user = void 0;
      }
      next();
    } catch (err) {
      console.error("Token verification exception:", err);
      req.user = void 0;
      next();
    }
  });
  app.get(["/api/health", "/health"], (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/fitness/advice", adviceLimiter, verifyFirebaseToken, asyncHandler(async (req, res) => {
    const { exercise, history } = req.body;
    if (!exercise || typeof exercise !== "object") {
      return res.status(400).json({ error: "Invalid or missing exercise object" });
    }
    const rawName = exercise.name;
    const rawReps = exercise.reps;
    if (typeof rawName !== "string" || rawName.trim().length === 0 || rawName.length > 100) {
      return res.status(400).json({ error: "Exercise name must be a non-empty string under 100 characters" });
    }
    const cleanName = rawName.replace(/[^a-zA-Z0-9\s()/\-+]/g, "").trim();
    if (!cleanName) {
      return res.status(400).json({ error: "Exercise name contains invalid characters" });
    }
    const cleanReps = String(rawReps ?? "").replace(/[^a-zA-Z0-9\s()/\-+]/g, "").trim().substring(0, 50);
    if (history !== void 0 && !Array.isArray(history)) {
      return res.status(400).json({ error: "History must be an array" });
    }
    const cleanHistory = [];
    if (Array.isArray(history)) {
      if (history.length > 5) {
        return res.status(400).json({ error: "History exceeds safe depth limits" });
      }
      for (const item of history) {
        if (item && typeof item === "object") {
          const cleanSets = [];
          if (Array.isArray(item.sets)) {
            for (const s of item.sets) {
              if (s && typeof s === "object") {
                cleanSets.push({
                  weight: String(s.weight ?? "").replace(/[^0-9.]/g, "").substring(0, 10),
                  reps: String(s.reps ?? "").replace(/[^0-9]/g, "").substring(0, 10),
                  done: Boolean(s.done)
                });
              }
            }
          }
          cleanHistory.push({
            date: String(item.date ?? "").substring(0, 20),
            workoutType: String(item.workoutType ?? "").substring(0, 20),
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
        const fallbackAdvice = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
        return res.json({ suggestion: fallbackAdvice });
      }
      const aiClient = getAiClient();
      let suggestionText = "";
      let lastModelError = null;
      for (const modelName of CANDIDATE_MODELS) {
        try {
          suggestionText = await generateAiContentWithTimeout(aiClient, modelName, prompt, 8e3);
          if (suggestionText) {
            break;
          }
        } catch (modelErr) {
          lastModelError = modelErr;
          console.log(`[AI Coaching] Model ${modelName} unavailable, trying next candidate...`);
        }
      }
      if (suggestionText) {
        return res.json({ suggestion: suggestionText });
      }
      console.log("[AI Coaching] AI models in high demand; serving contextual rule-based coaching.");
      const coachingFallback = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
      res.json({ suggestion: coachingFallback });
    } catch (error) {
      if (isAbortError(error)) {
        return res.status(504).json({ error: "Coaching server request timed out. Please try again soon." });
      }
      console.log("[AI Coaching] Serving rule-based fallback advice.");
      const coachingFallback = generateRuleBasedAdvice(cleanName, cleanReps, cleanHistory);
      res.json({ suggestion: coachingFallback });
    }
  }));
  app.all("/api/*", (req, res) => {
    console.warn(`[API 404 fallback] ${req.method} ${req.url} did not match any API routes.`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const possibleDistPaths = [
      import_path.default.join(process.cwd(), "dist"),
      process.cwd(),
      __dirname,
      import_path.default.join(__dirname, "..", "dist")
    ];
    const distPath = possibleDistPaths.find((p) => import_fs.default.existsSync(import_path.default.join(p, "index.html"))) || import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = import_path.default.join(distPath, "index.html");
      if (import_fs.default.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application index.html not found.");
      }
    });
  }
  app.use((err, req, res, next) => {
    console.error("Express Error Handler caught:", err);
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error occurred.";
    res.status(status).json({
      error: message
    });
  });
  const PORT = Number(process.env.PORT) || 3e3;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
