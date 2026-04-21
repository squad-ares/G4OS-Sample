# ADR 0114: Attachment pipeline (drop-zone, clipboard, validação)

## Metadata

- **Numero:** 0114
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Anexar arquivos no chat da v1 tinha três pontos de entrada (botão paperclip, drag-and-drop, paste do clipboard) com código duplicado em cada um: os três convertiam `File → ArrayBuffer → Attachment` em helpers sutilmente diferentes, e nenhum deles validava MIME/tamanho antes de mandar para o agent. Sintomas:

- Arquivos grandes (> 25 MB) chegavam no worker e eram rejeitados pelo provider, sem feedback visual no composer.
- MIME sem match caía como `application/octet-stream` e era enviado mesmo assim; alguns providers retornavam 400 silencioso.
- Paste de screenshot do macOS gerava `image/png` mas o nome default `image.png` colidia com outros pastes na mesma sessão.

TASK-11-00-04 pede unificação do pipeline e validação antes do envio.

## Opções consideradas

### Opção A: Helper único `filesToAttachments(files: FileList)` com validação inline

**Descrição:** centralizar conversão + validação em uma função pura. Os três gatilhos de UI (`DropZone`, `PaperclipButton`, paste handler) chamam a mesma função.

**Pros:**
- Zero duplicação — mudança em MIME policy ou em naming de pastes só toca um lugar.
- Validação acontece na borda, antes do estado global receber qualquer Attachment.
- Paste auto-batizado com timestamp ISO, evitando colisão.

**Contras:**
- `filesToAttachments` é async (`File.arrayBuffer()`) — os três handlers precisam lidar com Promise.

### Opção B: Hook `useAttachmentInput()` que encapsula conversão e dispatcha direto

**Descrição:** hook que gerencia state + conversão.

**Pros:**
- UX unificada em um ponto.

**Contras:**
- Acopla o state management ao hook — o composer perde controle sobre quando limpar o estado após envio.
- Paste handler fora do composer (teclado global) não consegue consumir o hook.

## Decisão

Optamos pela **Opção A** (helper puro + validação explícita).

Reasoning:

1. Os três gatilhos de UI (drop, paperclip, paste) ficam simétricos — o mesmo `onAttach([...Attachment])` é chamado.
2. `validateAttachments(files, existing, { maxFiles, maxBytes, allowedMimes })` roda antes de qualquer conversão — rejeita tipos desconhecidos sem custo de ler o arquivo inteiro para memória.
3. Paste handler de clipboard fica trivial: `handlePaste = async (e) => onAttach(await filesToAttachments(Array.from(e.clipboardData.files)))`.
4. Estado de `attachments` vive no `Composer`, que já gerencia o resto do ciclo (texto, draft, submit).

## Contrato de validação

```ts
interface AttachmentPolicy {
  readonly maxFiles?: number;          // default: 10
  readonly maxBytesPerFile?: number;   // default: 25 MB
  readonly allowedMimes?: readonly string[];  // default: undefined = aceita todos
}

validateAttachments(files, existing, policy): Result<Attachment[], ValidationError>
```

- `existing` é passado para contar contra `maxFiles` (o drop não pode ultrapassar o teto considerando o que já está no composer).
- `ValidationError` carrega `code` (`too_many_files` / `file_too_large` / `mime_not_allowed`) e `offendingFile` — o consumer mapeia para i18n no próprio render.

## Consequências

### Positivas

- `DropZone`, `PaperclipButton` e paste convergem num único flow. Paste gera `paste-<ISO>.png` evitando colisão.
- Validação na borda impede estado inconsistente — composer nunca vê Attachment inválido.
- `AttachmentPreview` só renderiza tipos que passaram — pode assumir shape válido sem re-checar.
- Feedback de erro aparece no composer (linha de texto vermelha) em vez de falhar silenciosamente no agent.

### Negativas / Trade-offs

- Usuário vê erro depois de soltar/colar — não há preview-only (hover sobre dropzone não alerta sobre arquivo grande antes de soltar). Aceitável para V1 do feature; melhoria futura se houver complaint.
- `maxBytesPerFile` default de 25 MB é conservador — providers diferentes (Anthropic, OpenAI, Gemini) têm tetos distintos. Policy pode ser injetada via prop no futuro.

### Neutras

- `Attachment` type vive em `packages/features/src/chat/types.ts` para isolamento transport-agnostic. Serialização para o IPC (Uint8Array) acontece no nível do adapter no desktop renderer.

## Estrutura implementada

```
packages/features/src/chat/components/composer/attachments/
├── drop-zone.tsx            # <section role="region"> + drag feedback overlay
├── paperclip-button.tsx     # input[type=file] escondido + label clicável
├── attachment-list.tsx      # preview horizontal com remove button
├── attachment-preview.tsx   # ícone por tipo + nome + tamanho
├── files-to-attachments.ts  # conversão pura File → Attachment
├── validate-attachments.ts  # regras + ValidationError tipado
└── index.ts                 # barrel
```

i18n: `chat.composer.attachFiles`, `chat.composer.dropZone.ariaLabel`, `chat.composer.dropZone.dropHint`, `chat.composer.removeAttachment`.

## Validação

- Gate `check:file-lines`: todos os arquivos ≤150 LOC.
- Gate `check:cruiser`: attachments não importam `electron` nem tRPC — `Attachment` é tipo puro.
- Smoke manual: drop + paperclip + paste convergem sem duplicar o arquivo; arquivos > 25 MB mostram erro antes do envio.

## Referências

- TASK-11-00-04
- ADR-0044 (attachment content-addressed — persistência no data layer)
- ADR-0111 (composer arquitetura)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-04 entregue).
