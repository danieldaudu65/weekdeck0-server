'use strict';

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const env = {
  port: Number(process.env.PORT) || 4100,
  isProd,
  // Website addresses allowed to call the API, comma-separated. A trailing "/" is ignored.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,https://adron-weekdeck.netlify.app')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  adminSecret: process.env.ADMIN_SECRET || '',
  tokenDays: 60,
  // Optional AI ideas for activities (Anthropic Claude). Leave empty to switch off.
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-haiku-5-5',
  // Optional Google Gemini (free tier): AI ideas, week summary, and "Find events near us" (Google Search).
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  // Tried in order when the main model isn't available on the key's plan.
  geminiFallbacks: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash-lite,gemini-3.6-flash')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Optional Groq (free, no card): writes ideas and summaries, and reads event search results.
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  groqFallbacks: (process.env.GROQ_FALLBACK_MODELS || 'llama-3.3-70b-versatile,openai/gpt-oss-20b')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Optional Tavily (free 1,000 searches a month, no card): web search for "Events near us".
  tavilyKey: process.env.TAVILY_API_KEY || '',
  // Optional real cover photos: Pixabay (free key at pixabay.com/api/docs) or Pexels.
  pixabayKey: process.env.PIXABAY_API_KEY || '',
  pexelsKey: process.env.PEXELS_API_KEY || '',
  // Optional DNS servers for Node, e.g. "8.8.8.8,1.1.1.1" when mongodb+srv:// fails with querySrv ECONNREFUSED.
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

function assertConfig() {
  const problems = [];
  if (!env.mongoUri) problems.push('MONGODB_URI is not set');
  if (!env.jwtSecret || env.jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (problems.length) {
    // Fail fast with a clear message instead of starting a server that can't log anyone in.
    console.error(`\n[weekdeck] Configuration problem:\n  - ${problems.join('\n  - ')}\nSee server/.env.example\n`);
    process.exit(1);
  }
}

module.exports = { env, assertConfig };
