---
'@g4os/features': patch
'@g4os/desktop': patch
---

Streaming chat — cadência mais sólida, user msg otimística e estado de loading

**1. `useStreamingText` — cap, piso e warmup de drenagem:**
- `MAX_CHARS_PER_FRAME = 15`: evita que buffers grandes drenem em ~30
  frames (0.5s parecendo "instantâneo"). Cap visual ~900 chars/s.
- `MIN_CHARS_PER_FRAME = 3`: piso de drenagem para evitar 1 char/frame
  em buffers pequenos. 180 chars/s mínimos durante o stream.
- `WARMUP_CHARS = 8` (novo): acumula silenciosamente os primeiros chars
  antes de iniciar o drain. LLMs tipicamente enviam o primeiro chunk
  pequeno (1-2 chars) e fazem pausa de 100-300ms — sem warmup, usuário
  via "primeira letra travando" com cursor pulsing. Com warmup, o ghost
  mantém os "thinking dots" até acumular ≥ 8 chars, então drena fluido.
  `flush()` (em `turn.done`) força exibição de respostas curtas que nunca
  atingem o threshold (ex.: "Sim", "OK"). `reset()` zera o flag.

**2. `AssistantMessage` — fix do estado "thinking" no ghost vazio:**
- Bug: `inferStreamingStatusKey` retornava `null` para `[{type:'text', text:''}]`
  (ghost criado em `turn.started` antes do primeiro chunk). UI mostrava o
  cursor pulsing flutuando num espaço vazio sem feedback de "modelo pensando".
- Fix: detecta `text` block com `length === 0` e retorna `'thinking'` →
  exibe os dots + label "Pensando…".
- Polish: dots de `h-1 w-1` (4px) → `h-1.5 w-1.5` (6px); opacity `/60` →
  `/80`; gap `0.5` → `1`; font `12px` → `13px`. Mais visível sem ser
  obnóxio.

**3. Session page — user message otimística:**
- Bug: ao enviar mensagem, o ghost da IA aparecia antes da user msg
  ser persistida e refetcheada — flicker visual quando a user msg
  finalmente chegava e empurrava o ghost para baixo.
- Fix: `pendingUserText` state setado em `handleSend`, renderizado
  imediatamente em `chatMessages` (com dedupe contra `persistedMessages`
  para o caso de race entre `.then()` e refetch). Limpo em
  `message.added` (user) `.then()` — mesma estratégia do ghost da IA,
  garante que persistido já está em cache antes de remover otimístico.
  Rollback em erro do `sendMessage`.
