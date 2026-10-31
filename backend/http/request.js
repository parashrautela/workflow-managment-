import { ApiError } from './api-error.js';

export async function body(req, maximum = 1_000_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > maximum) throw new ApiError('Request too large.', 413);
  }
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ApiError('Invalid JSON object.', 400);
  }
}
