'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { env } = require('./config/env');
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/team');
const weekRoutes = require('./routes/weeks');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const photoRoutes = require('./routes/photos');
const placeRoutes = require('./routes/places');
const regionRoutes = require('./routes/region');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = same-origin or server-to-server (curl). Browsers always send one cross-site.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
      maxAge: 86400,
    }),
  );
  // The team route can carry a small cover photo; everything else is tiny.
  app.use('/api/team', express.json({ limit: '800kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'weekdeck-api', database: mongoose.connection.readyState === 1 ? 'connected' : 'not-connected', ai: Boolean(env.geminiKey || env.anthropicKey), events: Boolean(env.geminiKey), photos: Boolean(env.pixabayKey || env.pexelsKey) });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/weeks', weekRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/photos', photoRoutes);
  app.use('/api/places', placeRoutes);
  app.use('/api/region', regionRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
