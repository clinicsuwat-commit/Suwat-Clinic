import fs from 'node:fs';
import path from 'node:path';

// Dependency-free .env reader, without overwriting variables supplied by hosting.
const file = path.resolve(process.cwd(), '.env');
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith('#') || process.env[match[1]] !== undefined) continue;
    const raw = match[2].trim();
    process.env[match[1]] = ((raw[0] === '"' && raw.at(-1) === '"') || (raw[0] === "'" && raw.at(-1) === "'")) ? raw.slice(1, -1) : raw;
  }
}
export const cfg = {
  port: Number(process.env.PORT || 3000),
  production: process.env.NODE_ENV === 'production',
  demo: process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : process.env.NODE_ENV !== 'production',
  secret: process.env.SESSION_SECRET || '',
  dbFile: process.env.DB_FILE || './data/suwat-clinic.sqlite',
  lineLoginChannel: process.env.LINE_LOGIN_CHANNEL_ID || '',
  liffId: process.env.LINE_LIFF_ID || '',
  lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  lineSecret: process.env.LINE_CHANNEL_SECRET || '',
  staffGroup: process.env.LINE_STAFF_GROUP_ID || '',
  baseUrl: process.env.PUBLIC_BASE_URL || '',
  twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioService: process.env.TWILIO_VERIFY_SERVICE_SID || '',
};
if (cfg.production && cfg.demo) throw new Error('DEMO_MODE must be false in production');
if (cfg.production && (!cfg.secret || cfg.secret.length < 48 || !process.env.STAFF_OWNER_PASSWORD || !process.env.STAFF_RECEPTION_PASSWORD)) {
  throw new Error('Production requires SESSION_SECRET (48+ characters), STAFF_OWNER_PASSWORD and STAFF_RECEPTION_PASSWORD.');
}
export const hasTwilio = Boolean(cfg.twilioSid && cfg.twilioToken && cfg.twilioService);
