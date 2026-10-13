import { createHash } from 'node:crypto';

export function noteContentHash(title, body) {
  if (typeof title !== 'string' || typeof body !== 'string') throw new TypeError('invalid_note_content');
  const text = `${Buffer.byteLength(title, 'utf8')}:${title}${Buffer.byteLength(body, 'utf8')}:${body}`;
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
