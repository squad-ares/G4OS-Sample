# Security findings — G4 OS v2

Tracking de findings reportados em pentests, code review interno, ou
relatório de bug bounty (quando o programa abrir). Não inclui findings
em deps externas — esses ficam em `pnpm audit` e GitHub Advisory.

## Status legend

- 🟢 **Fixed** — patch merged + verificado.
- 🟡 **In progress** — assigned + PR aberta.
- 🔴 **Open** — triada mas sem owner.
- ⚫ **Won't fix** — decisão registrada (out of scope, accepted risk).

## Severidade

Triagem segue tabela em `audit-prep.md`:

- **P0** — RCE, credential exposure → fix imediato, bloqueia GA.
- **P1** — privilege escalation, auth bypass → fix antes GA.
- **P2** — info disclosure, hardening gaps → fix pós-GA aceitável.
- **P3** — best practice → backlog.

---

## Template de finding

```markdown
## F-NNN — Título conciso [P0|P1|P2|P3]

- **Status**: 🟢 Fixed in #1234 / 🟡 In progress / 🔴 Open / ⚫ Won't fix
- **Reporter**: vendor X (audit YYYY-MM-DD) / @internal-handle
- **Component**: packages/credentials/src/vault.ts — escopo afetado
- **Description**: o que está errado, com PoC (sem detalhes que
  habilitem exploit ativo se a finding ainda está aberta).
- **Impact**: o que um atacante consegue se explora.
- **Remediation**: o que foi feito (commit / PR) ou plano.
- **Verification**: como retestar (comando, test case, checklist).
- **CWE**: CWE-XXX (Common Weakness Enumeration class).
```

---

## Findings ativos

_Vazio até primeiro audit ou pentest reportar findings reais._

---

## Findings históricos (pre-V2)

Findings da V1 não migram automaticamente — V2 substitui as decisões
estruturais que produziram a maioria deles (vault scattered, listeners
sem dispose, etc.). Findings históricos relevantes ficam linkados aqui
quando houver lição aplicável a V2.

| Origem | Resumo | Status em V2 |
|---|---|---|
| V1 vault | 93 arquivos tocando `credentials.enc` | Resolvido por design — gateway único `CredentialVault` (ADR-0050) |
| V1 chokidar | Memory leak no Windows | Resolvido por dep change — `@parcel/watcher` |
| V1 main monolítico | 1461 LOC, sem boundaries | Resolvido por gate `check:main-size` + boundaries cruiser |

---

## Disclosure pós-GA

Após GA + retest do audit:

1. Publicar resumo do report em `security.md` (raiz do repo) — sem PoCs.
2. Agradecer vendor.
3. Setup `security@<dominio>` inbox para reports externos.
4. Considerar bug bounty público (HackerOne / Bugcrowd) se demanda
   justificar.
