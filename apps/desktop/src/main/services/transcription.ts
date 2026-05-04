import type { VoiceService } from '@g4os/ipc/server';
import { type AppError, ErrorCode, type Result, toResult } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('transcription');

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';
// Timeout default de 60s. Whisper típico responde em <10s; se passar de
// 60s indica server lento ou conexão hung — abortar é melhor UX que travar
// VoiceService indefinidamente. Voice notes têm cap 60s então payload é
// pequeno; timeout 60s é folgado.
const TRANSCRIBE_TIMEOUT_MS = 60_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  handle.unref?.();
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(handle);
  });
}

export interface TranscriptionDeps {
  readonly getOpenAIKey: () => Promise<string | null>;
  readonly getManagedToken: () => Promise<string | null>;
  readonly managedEndpoint: string;
}

export class TranscriptionService implements VoiceService {
  readonly #deps: TranscriptionDeps;

  constructor(deps: TranscriptionDeps) {
    this.#deps = deps;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<Result<string, AppError>> {
    return await toResult(this.#transcribe(audioBuffer, mimeType), ErrorCode.NETWORK_ERROR);
  }

  async #transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const openAIKey = await this.#deps.getOpenAIKey();
    if (openAIKey) {
      try {
        return await this.#transcribeOpenAI(audioBuffer, mimeType, openAIKey);
      } catch (err) {
        log.warn({ err }, 'openai transcription failed, trying managed fallback');
      }
    }

    const managedToken = await this.#deps.getManagedToken();
    if (managedToken) {
      try {
        return await this.#transcribeManaged(audioBuffer, mimeType, managedToken);
      } catch (err) {
        log.warn({ err }, 'managed transcription failed');
      }
    }

    throw new Error('No transcription provider available');
  }

  async #transcribeOpenAI(audio: Buffer, mimeType: string, apiKey: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([toBlobPart(audio)], { type: mimeType }), 'audio.webm');
    form.append('model', WHISPER_MODEL);

    const res = await fetchWithTimeout(
      OPENAI_TRANSCRIBE_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
      TRANSCRIBE_TIMEOUT_MS,
    );

    if (!res.ok) {
      throw new Error(`OpenAI transcription HTTP ${String(res.status)}`);
    }

    const json = (await res.json()) as { text?: string };
    return json.text ?? '';
  }

  async #transcribeManaged(audio: Buffer, mimeType: string, token: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([toBlobPart(audio)], { type: mimeType }), 'audio.webm');

    const res = await fetchWithTimeout(
      `${this.#deps.managedEndpoint}/api/voice/transcribe`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
      TRANSCRIBE_TIMEOUT_MS,
    );

    if (!res.ok) {
      throw new Error(`Managed transcription HTTP ${String(res.status)}`);
    }

    const json = (await res.json()) as { text?: string };
    return json.text ?? '';
  }
}

function toBlobPart(buffer: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);
  return ab;
}
