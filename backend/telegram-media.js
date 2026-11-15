import { ApiError } from './pilot.js';

const INLINE_MEDIA = ['image/jpeg','image/png','image/gif','image/webp','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/webm'];

// Telegram voice notes are Ogg/Opus; anything outside the allowlist stays a forced download.
export function mediaKind(attachment) {
  const mime = attachment.type === 'Photo' ? 'image/jpeg' : attachment.mimeType || (attachment.type === 'voice' ? 'audio/ogg' : '');
  const inline = INLINE_MEDIA.includes(mime);
  return {mime:inline ? mime : 'application/octet-stream',inline};
}

export async function loadTelegramAttachment(attachment, token, fetchImpl = fetch) {
  if (!token) throw new ApiError('Telegram media is not configured.',503);
  const maximum = 20_000_000;
  try {
    const lookup = await fetchImpl(`https://api.telegram.org/bot${token}/getFile`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file_id:attachment.fileId}),signal:AbortSignal.timeout(10000),redirect:'error'});
    const info = await lookup.json(); const file = info.result;
    if (!info.ok || !file?.file_path || !/^[\w./-]+$/.test(file.file_path) || file.file_path.split('/').includes('..')) throw new ApiError('Telegram attachment unavailable.',502);
    if (file.file_size > maximum) throw new ApiError('Attachment exceeds the 20 MB pilot limit.',413);
    const response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(20000),redirect:'error'});
    if (!response.ok || !response.body) throw new ApiError('Telegram attachment unavailable.',502);
    if (Number(response.headers.get('content-length')) > maximum) { await response.body.cancel(); throw new ApiError('Attachment too large.',413); }
    let size=0; const chunks=[];
    for await (const chunk of response.body) { size+=chunk.byteLength; if (size>maximum) throw new ApiError('Attachment too large.',413); chunks.push(Buffer.from(chunk)); }
    return {bytes:Buffer.concat(chunks),...mediaKind(attachment)};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Could not load Telegram attachment. Try again later.',502);
  }
}
