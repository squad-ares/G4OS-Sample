---
'@g4os/desktop': patch
---

Fix `UNIQUE constraint failed: messages_index.session_id, messages_index.sequence`
disparado depois de qualquer toggle de UI (model selector, source picker,
working dir change) ser seguido por um envio de mensagem.

Causa: `SessionSchema` declarava `messageCount` e `lastEventSequence` com
`z.number().default(0)`. O `SessionUpdateSchema` antigo era construído como
`SessionSchema.partial().omit(...)`, que torna campos opcionais mas **mantém
os defaults Zod**. Isso fazia com que qualquer `sessions.update` surgical
(ex.: `{ patch: { modelId: 'x' } }`) tivesse `messageCount: 0` e
`lastEventSequence: 0` injetados pelo parser. O repository aplica
`if (patch.X !== undefined) updates.X = patch.X` — e como `0 !== undefined`,
gravava 0 por cima dos contadores event-driven, zerando o cursor de replay.

Próxima mensagem do usuário lia `lastEventSequence = 0`, computava
`sequenceNumber = 1`, colidia com a row existente em `messages_index` e
explodia.

Fix: `SessionUpdateSchema` reescrito como whitelist explícito usando
`z.optional()` ao invés de `partial()` + `default`. Apenas campos
user-editáveis aceitos no patch (`name`, `provider`, `modelId`,
`workingDirectory`, `enabled/sticky/rejectedSourceSlugs`, `unread`,
`projectId`, `metadata`). Campos server-managed
(`messageCount`/`lastEventSequence`/`lastMessageAt`/`status`/`lifecycle`/
`archivedAt`/`deletedAt`/`updatedAt`) ficam fora do schema e são
ignorados silenciosamente se chegarem via input. Router agora consome
`SessionUpdateSchema` do kernel ao invés de inline partial.

Adiciona 3 testes de regressão verificando que defaults event-driven
não vazam para o patch parseado.
