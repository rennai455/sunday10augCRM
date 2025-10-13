import crypto from 'node:crypto';
import config from '../../config/index.js';

function getKey() {
  const hexKey = config.TOTP_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('TOTP_ENCRYPTION_KEY is required');
  }
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

function encryptSecret(secret) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

function decryptSecret(ciphertext, iv) {
  if (!ciphertext || !iv) return null;
  const key = getKey();
  const data = Buffer.from(ciphertext, 'base64');
  if (data.length <= 16) return null;
  const tag = data.subarray(data.length - 16);
  const payload = data.subarray(0, data.length - 16);
  const ivBuf = Buffer.from(iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}

export { encryptSecret, decryptSecret };
export default { encryptSecret, decryptSecret };
