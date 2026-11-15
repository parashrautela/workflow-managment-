// Speech-to-text for a client's voice note (OpenAI file transcription). Opt-in: the recording is sent to the
// provider, so the studio must set both VOICE_TRANSCRIPT_ENABLED=true and OPENAI_API_KEY.
// The text keeps the language that was spoken (Hindi stays Hindi); it is a convenience next to the recording, never a replacement.
const FORMATS = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm' }; // what the API accepts
const MAX_CHARS = 20000;

export const transcriptionEnabled = (env = process.env) => env.VOICE_TRANSCRIPT_ENABLED === 'true' && Boolean(env.OPENAI_API_KEY);

export async function transcribeAudio({ bytes, mime, apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe',
  baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', fetchImpl = fetch, timeoutMs = 90000 }) {
  const extension = FORMATS[mime];
  if (!extension) throw new Error('This audio format cannot be transcribed.');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), `voice.${extension}`);
  form.append('model', model);
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Transcription failed (${response.status}).`);
  const text = String((await response.json()).text || '').trim().slice(0, MAX_CHARS);
  if (!text) throw new Error('No speech was found in this voice note.');
  return { text, model };
}
