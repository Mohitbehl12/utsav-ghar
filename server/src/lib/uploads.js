import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from './http.js';

export const PUBLIC_DIR = path.join(config.uploadDir, 'public');
export const PRIVATE_DIR = path.join(config.uploadDir, 'private'); // payment screenshots — admin only
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' };

// Verify magic bytes — never trust the browser-supplied mimetype alone.
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(4, 12).toString().startsWith('ftypavi')) return 'image/avif';
  return null;
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => cb(null, !!EXT[file.mimetype]),
});

/** Persist an in-memory multer file after verifying it is really an image. */
export function saveImage(file, { private: isPrivate = false } = {}) {
  if (!file) return null;
  const type = sniff(file.buffer);
  if (!type) throw new HttpError(400, 'Only JPG, PNG, WebP or AVIF images are allowed.');
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${EXT[type]}`;
  fs.writeFileSync(path.join(isPrivate ? PRIVATE_DIR : PUBLIC_DIR, name), file.buffer);
  return isPrivate ? name : `/uploads/${name}`;
}
