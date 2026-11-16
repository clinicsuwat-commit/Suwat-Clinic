import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { cfg } from './config.mjs';
export const token = () => randomBytes(32).toString('base64url');
export const hashToken = t => createHash('sha256').update(t).digest('hex');
export function passHash(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
export function verifyPassword(a, b) { const x=Buffer.from(a,'hex'), y=Buffer.from(b,'hex'); return x.length===y.length && timingSafeEqual(x,y); }
export function cookieValue(req, key) { const raw = String(req.headers.cookie || ''); const match = raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'=')); return match ? decodeURIComponent(match.slice(key.length+1)) : ''; }
export function sessionCookie(key, value, maxAge=86400*14) { return `${key}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.production?'; Secure':''}`; }
export function clearCookie(key) { return `${key}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cfg.production?'; Secure':''}`; }
export function sameOrigin(req) {
  const origin=req.headers.origin;
  if (!origin) return true; // Non-browser API clients. Browser cross-site JSON POSTs carry Origin.
  try { return new URL(origin).host === req.headers.host; } catch {return false;}
}
export function validPhone(phone) { return /^0[0-9]{9}$/.test(phone); }
export function cleanText(v,limit=120) { return typeof v === 'string' ? v.trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,limit) : ''; }
export function randomRef(prefix) { return prefix + '-' + new Date().toISOString().slice(2,10).replaceAll('-','') + '-' + randomBytes(3).toString('hex').toUpperCase(); }
