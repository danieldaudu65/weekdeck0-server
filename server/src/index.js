'use strict';

const mongoose = require('mongoose');
const { env, assertConfig } = require('./config/env');
const { createApp } = require('./app');

async function main() {
  assertConfig();
  if (env.dnsServers.length) {
    require('node:dns').setServers(env.dnsServers);
    console.log(`[weekdeck] Using DNS servers ${env.dnsServers.join(', ')}`);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log('[weekdeck] MongoDB connected');
  const server = createApp().listen(env.port, () => console.log(`[weekdeck] API listening on http://localhost:${env.port}`));

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[weekdeck] could not start:', err.message);
  if (/ECONNREFUSED|querySrv|ENOTFOUND|Authentication failed|bad auth/i.test(err.message)) {
    console.error('  Check MONGODB_URI in server/.env (is MongoDB running / is the Atlas password and IP access list right?)');
    if (/querySrv/i.test(err.message) && !env.dnsServers.length) {
      console.error('  "querySrv" means the Atlas address lookup failed. Add DNS_SERVERS=8.8.8.8,1.1.1.1 to server/.env and restart.');
    }
  }
  process.exit(1);
});
