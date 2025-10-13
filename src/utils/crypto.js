import crypto from 'node:crypto';
import config from '../../config/index.js';

function getKey() {
  const hex = String(config.TOTP_ENCRYPTION_KEY || '').trim();
  if (!hex || hex.length !== 64) return null; // 32 bytes hex
  try {
    return Buffer.from(hex, 'hex');
  } catch {
    return null;
  }
}

function encryptAesGcm(plain) {
  const key = getKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([ct, tag]).toString('base64');
  return { ciphertext: payload, ivHex: iv.toString('hex') };
}

function decryptAesGcm(ciphertextB64, ivHex) {
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(String(ciphertextB64), 'base64');
    const iv = Buffer.from(String(ivHex), 'hex');
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(0, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return pt;
  } catch {
    return null;
  }
}

export { encryptAesGcm, decryptAesGcm, getKey };
export default { encryptAesGcm, decryptAesGcm, getKey };

