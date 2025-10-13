import crypto from 'node:crypto';

const TOTP_ISSUER = 'renn.ai';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  const output = [];
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) {
      bits += '0'.repeat(5 - chunk.length);
    }
    const index = parseInt(chunk.padEnd(5, '0'), 2);
    output.push(BASE32_ALPHABET[index]);
  }
  while (output.length % 8 !== 0) {
    output.push('=');
  }
  return output.join('');
}

function base32Decode(str) {
  const sanitized = str.toUpperCase().replace(/=+$/u, '');
  let bits = '';
  for (const char of sanitized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character');
    }
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byte = bits.slice(i, i + 8);
    bytes.push(parseInt(byte, 2));
  }
  return Buffer.from(bytes);
}

function generateSecret(bytes = 20) {
  const raw = crypto.randomBytes(bytes);
  return base32Encode(raw).replace(/=+$/u, '');
}

function hotp(secret, counter, digits = 6) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i -= 1) {
    buf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, '0');
}

function totp(secret, { timestamp = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(timestamp / 1000 / step);
  return hotp(secret, counter, digits);
}

function verifyTotp(secret, token, { window = 1, step = 30, digits = 6 } = {}) {
  if (!token || typeof token !== 'string') return false;
  const normalized = token.replace(/\s+/gu, '');
  if (!/^\d{6}$/u.test(normalized)) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    const value = hotp(secret, currentCounter + errorWindow, digits);
    if (crypto.timingSafeEqual(Buffer.from(value), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

function createTotpSecret(label) {
  const secret = generateSecret();
  const name = encodeURIComponent(label || 'user');
  const issuer = encodeURIComponent(TOTP_ISSUER);
  const otpauthUrl = `otpauth://totp/${issuer}:${name}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
  return { secret, otpauthUrl };
}

function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString('hex');
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`.toUpperCase());
  }
  return codes;
}

export {
  createTotpSecret,
  generateRecoveryCodes,
  totp,
  verifyTotp,
};

export default {
  createTotpSecret,
  generateRecoveryCodes,
  totp,
  verifyTotp,
};
