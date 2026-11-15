// Keep the existing response flag; sender roles no longer restrict founder decisions.
import { transcriptionEnabled } from './voice-transcript.js';
// canTranscribe tells the inbox whether to offer "Transcribe" on voice notes (the studio opted in to sending them to the AI provider).
export const queryView = (_state, request) => ({ ...request, canReject: true, canTranscribe: transcriptionEnabled() });
