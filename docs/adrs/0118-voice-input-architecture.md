# ADR 0118: Voice input — features transport-agnostic + TranscriptionService com fallback

## Metadata

- **Numero:** 0118
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 tinha gravação de voz acoplada: o botão do composer chamava `fetch('/api/transcribe')` direto do renderer. Consequências:

- Feature (`packages/features` na v2) ficava amarrada a uma rota HTTP específica — impossível reusar no viewer web sem reescrever.
- Chave da OpenAI era lida no renderer (vazamento se app fosse inspectado).
- Fallback para provider managed quando OpenAI falhava era um `try/catch` inline na UI.

TASK-11-00-09 pede arquitetura que:
1. Mantenha `packages/features` transport-agnostic.
2. Isole credentials no main process.
3. Tenha cadeia de fallback explícita (OpenAI Whisper → managed G4OS → erro).

## Opções consideradas

### Opção A: `fetch` direto no renderer

**Descrição:** manter padrão v1.

**Pros:**
- Simples.

**Contras:**
- Credentials no renderer. Bloqueado.

### Opção B: Feature recebe `transcribe` como prop injetada

**Descrição:** `VoiceButton` expõe `transcribe: (audio: Uint8Array, mimeType: string) => Promise<string>`. O desktop app passa uma implementação que chama tRPC `voice.transcribe` (IPC → main → `TranscriptionService` → provider).

**Pros:**
- Zero dependência da feature em IPC/Electron.
- `TranscriptionService` vive no main, com acesso ao `CredentialVault` (OpenAI key) e ao `AuthTokenStore` (managed token).
- Fallback fica isolado no service — UI só vê `Promise<string>` ou throw.
- Testável: feature pode ser testada com `transcribe` mock; service pode ser testado com `fetch` mock.

**Contras:**
- Uma prop extra no `Composer`. Aceitável — padrão já usado com `onSend`, `onStop`.

## Decisão

Optamos pela **Opção B** (injeção via prop + TranscriptionService no main).

### Contrato

```ts
// packages/features — transport-agnostic
interface VoiceButtonProps {
  readonly transcribe: (audio: Uint8Array, mimeType: string) => Promise<string>;
  readonly onTranscript: (text: string) => void;
  readonly disabled?: boolean;
}

// packages/ipc/server — IPC procedure tipado
voice.transcribe: authed.input({ audioBase64, mimeType }).mutation → { text }

// apps/desktop/main/services/transcription.ts
class TranscriptionService implements VoiceService {
  constructor(deps: {
    getOpenAIKey: () => Promise<string | null>;
    getManagedToken: () => Promise<string | null>;
    managedEndpoint: string;
  });
  transcribe(buf: Buffer, mimeType: string): Promise<string>;
}
```

### Fallback chain

1. Se `getOpenAIKey()` retorna chave válida → `POST api.openai.com/v1/audio/transcriptions` (Whisper-1).
2. Falha ou sem chave → `getManagedToken()` + `POST ${managedEndpoint}/api/voice/transcribe`.
3. Falha também → `throw new Error('No transcription provider available')`.

Cada tentativa é log-warned com `err` mas não cancela a próxima — o usuário vê o resultado final ou um erro único.

### Pipeline no renderer

1. `useVoiceRecorder()` captura via `MediaRecorder` em chunks de 250ms, MIME `audio/webm;codecs=opus` (fallback `audio/webm`).
2. `AnalyserNode` alimenta `Waveform` com frequências em tempo real (canvas 24 barras).
3. Usuário para a gravação → Blob → ArrayBuffer → Uint8Array → `transcribe(audio, mimeType)`.
4. Texto retornado é passado a `onTranscript` — o Composer concatena ao input atual.

### Max duration

Constante: 60s. Auto-stop via `useEffect` quando `state === 'too-long'`. UX: um banner aparece com `chat.composer.voice.maxDuration`.

## Consequências

### Positivas

- `packages/features` continua sem conhecer Electron, IPC ou OpenAI. Pode ser consumido no viewer web com um adapter HTTP diferente.
- Credentials nunca saem do main — renderer só recebe texto transcrito.
- Fallback é observável: logs estruturados com `err` em cada falha.
- Keyboard: Escape cancela gravação (atalho de ADR-0110).

### Negativas / Trade-offs

- Dois round-trips em fallback: renderer → main → OpenAI → fail → main → managed → renderer. Mitigação: timeout curto no OpenAI (30s) para cair para o managed rapidamente.
- `Waveform` usa `requestAnimationFrame` — custo de render enquanto gravando. Aceitável (feature é curta).

### Neutras

- `AnalyserNode` é via `Web Audio API` — funciona em Electron e Chromium moderno sem polyfill.
- O managed endpoint é wired no main como config estática no MVP (constante); pode virar env var (`G4OS_MANAGED_ENDPOINT`) se a viewer mover de URL.

## Estrutura implementada

```
packages/features/src/chat/
├── hooks/use-voice-recorder.ts          # MediaRecorder + AnalyserNode + FSM (idle/recording/too-long)
├── components/composer/
│   ├── voice-button.tsx                 # mic button + recording UI (waveform + timer)
│   └── waveform.tsx                     # canvas frequency bars

packages/ipc/src/server/
├── context.ts                           # VoiceService interface
├── null-services.ts                     # throws notImplemented
└── routers/voice-router.ts              # voice.transcribe mutation (authed)

apps/desktop/src/main/services/
└── transcription.ts                     # TranscriptionService — OpenAI → managed fallback
```

i18n: `chat.composer.voice.ariaLabel`, `chat.composer.voice.cancelAriaLabel`, `chat.composer.voice.transcribing`, `chat.composer.voice.maxDuration`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤200 LOC.
- Gate `check:cruiser`: feature não importa `electron`/`main/`/tRPC.
- Smoke manual: gravação + transcrição funciona com OpenAI key; cai para managed quando key removida.

## Referências

- TASK-11-00-09
- ADR-0050-0053 (credentials — OpenAI key via CredentialVault)
- ADR-0091-0094 (auth — managed token via SessionRefresher)
- ADR-0111 (composer arquitetura — ponto de integração do VoiceButton)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-09 entregue).
