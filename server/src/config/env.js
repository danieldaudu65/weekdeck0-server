'use strict';

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const env = {
  port: Number(process.env.PORT) || 4100,
  isProd,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173' || 'https://adron-weekdeck.netlify.app' || 'http://adron-weekdeck.netlify.app/')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  adminSecret: process.env.ADMIN_SECRET || '',
  tokenDays: 60,
  // Optional AI ideas for activities (Anthropic Claude). Leave empty to switch off.
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-haiku-5-5',
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
