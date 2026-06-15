// Encrypt OAuth tokens at rest. Uses AES-256-GCM with a key derived from
// TOKEN_ENCRYPTION_KEY. If no key is configured (demo mode), values pass
// through unchanged so the app still runs.
'use strict';

const crypto = require('crypto');

function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plain) {
  const k = key();
  if (!k || plain == null) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(value) {
  const k = key();
  if (!k || typeof value !== 'string' || !value.startsWith('enc:')) return value;
  try {
    const raw = Buffer.from(value.slice(4), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

module.exports = { encrypt, decrypt };
