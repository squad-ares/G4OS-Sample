---
'@g4os/desktop': patch
---

Round 3 de fixes do release pipeline:

**Pino transitive deps**

Adicionadas como deps diretas: pino-std-serializers, pino-abstract-transport,
sonic-boom, thread-stream, atomic-sleep, on-exit-leak-free, real-require,
process-warning, quick-format-unescaped, safe-stable-stringify,
@pinojs/redact, date-fns. pnpm com hoist controlado (shamefully-hoist=false)
não disponibiliza essas no app empacotado, causando "Cannot find module
'pino-std-serializers'" no boot do main process.

**Preflight tolerante em packaged**

`runtime.missing` (4 runtimes scaffolding pendente) e `env.invalid` (Supabase)
viraram `recoverable` em packaged. auth-runtime tem fallback via constantes
de build time. Boot continua mesmo sem todos os runtimes.

**Bootstrap trace logger**

`writeBootstrapTrace` em `$TMPDIR/g4os-boot-trace.log` + early
`uncaughtException` handler para diagnosticar crashes pré-pino futuros.

**Limitação macOS 15**

App ad-hoc é rejeitado por AMFI Code=-423 em macOS 15.7+ ("file is adhoc
signed or signed by an unknown certificate chain"). Não é bug nosso —
macOS 15 endureceu policy contra ad-hoc Electron apps com entitlements.
Solução real: Apple Developer ID (signed mode). CI roda em macOS 14 onde
ad-hoc historicamente funciona; teste de release valida lá.
