# Guia de Conventional Commits

O G4 OS usa [Conventional Commits](https://www.conventionalcommits.org/) para mensagens de commit. Isso habilita geração automática de changelog, versionamento semântico e um histórico de projeto legível.

## Formato

```
<tipo>(<escopo>): <assunto>

<corpo>

<rodapé>
```

**Campos obrigatórios:**
- `<tipo>`: um entre `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`
- `<escopo>`: um dos escopos predefinidos (ver lista abaixo)
- `<assunto>`: minúsculo, sem ponto final, máximo 50 caracteres

**Campos opcionais:**
- `<corpo>`: explicação detalhada (múltiplos parágrafos permitidos)
- `<rodapé>`: issues relacionadas (ex: `Closes #123`)

## Tipos

| Tipo | Significado | Release |
|------|-------------|---------|
| `feat` | Nova funcionalidade | minor |
| `fix` | Correção de bug | patch |
| `perf` | Ganho de performance | patch |
| `refactor` | Reestruturação sem mudar comportamento | none |
| `docs` | Apenas documentação | none |
| `style` | Apenas formatação | none |
| `test` | Apenas testes | none |
| `build` | Sistema de build ou deps | patch |
| `ci` | Config de CI/CD | none |
| `chore` | Manutenção | none |
| `revert` | Reverte commit anterior | depende |

## Escopos

### Fundação/Infraestrutura
- `foundation` — setup fundacional (monorepo, build, CI)
- `kernel` — tipos core, erros, logging
- `platform` — abstração de OS (paths, keychain, spawn)
- `ipc` — IPC e RPC (tRPC)
- `credentials` — cofre de credenciais
- `deps` — atualização de dependências
- `ci` — workflows de CI/CD
- `build` — scripts de build, config de bundler
- `release` — processo de release, versionamento
- `docs` — documentação do projeto
- `config` — arquivos de configuração

### Pacotes
- `ui` — componentes React compartilhados
- `agents` — implementações de provedores de IA
- `sources` — MCP e sources de dados
- `features` — módulos de feature (Feature-Sliced Design)

### Features
- `chat` — interface de chat e sessões
- `sessions` — ciclo de vida de sessão
- `workspaces` — workspaces
- `projects` — projetos
- `marketplace` — marketplace de skills/workflows
- `company-context` — features de company context
- `scheduler` — agendamento (cron)
- `vigia` — regras de watch/automação
- `remote-control` — controle mobile/remoto
- `voice` — gravação de voz e transcrição
- `skills` — sistema de skills e marketplace
- `browser` — integração com browser

### Apps
- `desktop` — app Electron
- `viewer` — viewer web

## Exemplos

### Commits válidos

```bash
feat(chat): add streaming support for Claude 3.5
fix(credentials): resolve race condition in vault write
perf(sessions): cache metadata in SQLite
refactor(ipc): extract middleware pattern
docs(kernel): add API examples
test(agents): cover streaming backpressure
chore(deps): bump @anthropic-ai/sdk to 0.72.0
ci(release): add macOS notarization step
```

### Com corpo e rodapé

```
feat(chat): add streaming support for Claude 3.5

- Implement Server-Sent Events bridge in IPC layer
- Add backpressure handling for renderer
- Support token counting for streamed completion
- Add integration test for long-running streams

Closes #456
```

### Revert

```
revert(chat): revert streaming support

This reverts commit abc123def.
Reason: Compatibility issues on Windows.
```

## Commits inválidos (bloqueados pelo commitlint)

| Exemplo | Motivo |
|---------|--------|
| `fix stuff` | Falta escopo |
| `feat(Chat): add feature` | Escopo precisa ser minúsculo |
| `feature(chat): streaming` | Tipo precisa ser `feat`, não `feature` |
| `fix(unknown): bug` | Escopo fora da lista |
| `feat(chat): Add feature.` | Assunto precisa começar minúsculo e sem ponto |
| `feat(chat): add a really long feature that takes more than 50 characters` | Assunto longo (máx 50) |

## Padrões comuns

### Múltiplas mudanças relacionadas no mesmo commit

Agrupe mudanças logicamente relacionadas:

```
feat(agents): add Claude 4 support with token counting

- Implement 4-turbo model in factory
- Add prompt caching for 1-hour TTL
- Cover streaming and tool-use flows
- Update model equivalence mapping

Closes #789
```

### Commits atômicos (preferido)

Prefira commits pequenos e focados:

```
feat(agents): add Claude 4 model enum
fix(agents): correct token counting for prompt cache
test(agents): cover streaming with compression
```

### Breaking changes

Coloque `!` antes dos `:` para marcar:

```
feat(ipc)!: remove deprecated /session/send route

BREAKING CHANGE: clients must use /session/stream instead
```

## Fluxo local

### Antes de commitar

```bash
# Stage dos arquivos
git add packages/chat/src/

# Preview
git status

# Lint auto-fix roda no commit
git commit -m "feat(chat): add message search"
```

### Se o lint fizer auto-fix

Biome corrige formatação e imports. Seus arquivos staged ficam atualizados. Só committar de novo:

```bash
git commit -m "feat(chat): add message search"
```

### Se o commitlint rejeitar

```bash
✗ scope must be one of [kernel, ..., chat, ...]
→ Corrija o escopo e tente de novo:
  git commit -m "feat(chat): add message search"
```

### Se precisar ignorar localmente (emergência)

```bash
git commit --no-verify -m "fix(chat): hot fix for production"
```

**Importante:** CI roda as mesmas checagens, então `--no-verify` só adia a falha. Use apenas em emergência real (ex: hotfix de segurança) e espere review crítico.

## Integração com changesets

Mensagens de commit geram entradas de changelog automaticamente:

```bash
feat(chat): add search      → Added: Chat search feature
fix(ipc): handle timeout    → Fixed: IPC timeout handling
perf(sessions): add caching → Improved: Session metadata caching
```

Ver [docs de changesets](../../docs/adrs/0008-changesets-versioning.md) para o fluxo de release.

## Troubleshooting

### "commit-msg hook não está rodando"

Git hooks são instalados no `pnpm install`. Reinstale:

```bash
pnpm install
# ou
lefthook install
```

### "pre-commit hook está lento"

- Lint/format rodam apenas em arquivos staged (rápido)
- Typecheck roda apenas em pacotes alterados (cache do Turbo)
- O primeiro commit pode ser lento; subsequentes são cacheados

```bash
ls -la .turbo/
```

### "Windows Git Bash: hooks não executam"

Use WSL2 (recomendado) ou atualize o Git for Windows para a versão mais recente. Lefthook suporta Git Bash nativamente.

### "commitlint diz que o subject está longo"

Mensagens são limitadas a 100 chars totais. Mantenha o assunto curto:

```bash
✗ header-max-length: header must not be longer than 100 characters
→ Sua mensagem está com 112 chars. Mantenha o assunto em ~50-60 chars.

# Longo demais (76 chars)
feat(chat): add realtime collaborative editing with conflict resolution

# Melhor (51 chars)
feat(chat): add realtime collaborative editing
# Detalhes no corpo, se precisar
```

## Referências

- [Spec de Conventional Commits](https://www.conventionalcommits.org/)
- [Docs do commitlint](https://commitlint.js.org/)
- [Semantic Versioning](https://semver.org/)
- [Diretrizes de commit do Angular](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)
- [ADR 0004: Git Hooks & Conventional Commits](../adrs/0004-lefthook-conventional-commits.md)
