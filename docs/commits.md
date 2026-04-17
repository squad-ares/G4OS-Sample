# Conventional Commits Guide

G4 OS uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automatic changelog generation, semantic versioning, and clear project history.

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Mandatory fields:**
- `<type>`: One of: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`
- `<scope>`: One of the predefined scopes (see list below)
- `<subject>`: Lowercase, no period, 50 chars max

**Optional fields:**
- `<body>`: Detailed explanation (multiple paragraphs allowed)
- `<footer>`: Related issues (e.g., `Closes #123`)

## Types

| Type | Meaning | Release |
|------|---------|---------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `perf` | Performance improvement | patch |
| `refactor` | Code restructure (no behavior change) | none |
| `docs` | Documentation only | none |
| `style` | Formatting only | none |
| `test` | Tests only | none |
| `build` | Build system or deps | patch |
| `ci` | CI/CD config | none |
| `chore` | Maintenance | none |
| `revert` | Revert previous commit | depends |

## Scopes

### Foundation/Infrastructure
- `foundation` — Foundational setup (monorepo, build, CI)
- `kernel` — Core types, errors, logging
- `platform` — OS abstraction (paths, keychain, spawn)
- `ipc` — IPC and RPC (tRPC)
- `credentials` — Credential vault management
- `deps` — Dependency updates
- `ci` — CI/CD workflows
- `build` — Build scripts, bundler config
- `release` — Release process, versioning
- `docs` — Project documentation
- `config` — Configuration files

### Packages
- `ui` — Shared React components
- `agents` — AI provider implementations
- `sources` — MCP and data sources
- `features` — Feature modules (Feature-Sliced Design)

### Features
- `chat` — Chat interface and sessions
- `sessions` — Session lifecycle management
- `workspaces` — Workspace management
- `projects` — Project management
- `marketplace` — Skill/workflow marketplace
- `company-context` — Company context features
- `scheduler` — Task scheduling (cron)
- `vigia` — Watch/automation rules
- `remote-control` — Mobile/remote control
- `voice` — Voice recording and transcription
- `skills` — Skill system and marketplace
- `browser` — Browser integration

### Apps
- `desktop` — Electron app
- `viewer` — Web viewer

## Examples

### Valid commits

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

### With body and footer

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

## Invalid commits (blocked by commitlint)

| Example | Reason |
|---------|--------|
| `fix stuff` | Missing scope |
| `feat(Chat): add feature` | Scope must be lowercase |
| `feature(chat): streaming` | Type must be `feat`, not `feature` |
| `fix(unknown): bug` | Scope not in predefined list |
| `feat(chat): Add feature.` | Subject must start lowercase, no period |
| `feat(chat): add a really long feature that takes more than 50 characters` | Subject too long (max 50 chars) |

## Common patterns

### Multiple related changes in one commit

Group logically related changes:

```
feat(agents): add Claude 4 support with token counting

- Implement 4-turbo model in factory
- Add prompt caching for 1-hour TTL
- Cover streaming and tool-use flows
- Update model equivalence mapping

Closes #789
```

### Atomic commits (preferred)

Prefer small, focused commits:

```
feat(agents): add Claude 4 model enum
fix(agents): correct token counting for prompt cache
test(agents): cover streaming with compression
```

### Breaking changes

Add `!` before `:` to indicate breaking change:

```
feat(ipc)!: remove deprecated /session/send route

BREAKING CHANGE: clients must use /session/stream instead
```

## Local commit workflow

### Before committing

```bash
# Stage your changes
git add packages/chat/src/

# Preview the commit
git status

# Lint will auto-fix on commit
git commit -m "feat(chat): add message search"
```

### If lint auto-fixes

Biome will fix formatting and imports. Your staged files are updated. Just commit again:

```bash
git commit -m "feat(chat): add message search"
```

### If commitlint rejects

```bash
✗ scope must be one of [kernel, ..., chat, ...]
→ Fix the scope name and retry:
  git commit -m "feat(chat): add message search"
```

### If you need to bypass locally (emergency only)

```bash
git commit --no-verify -m "fix(chat): hot fix for production"
```

**Important:** CI runs the same checks, so `--no-verify` only delays failure. Use only for true emergencies (e.g., security hotfix) and expect code review scrutiny.

## Integration with changesets

Commit messages automatically drive changelog generation:

```bash
# Each commit generates a changelog entry
feat(chat): add search      → Added: Chat search feature
fix(ipc): handle timeout    → Fixed: IPC timeout handling
perf(sessions): add caching → Improved: Session metadata caching
```

See [changesets docs](../../docs/adrs/0008-changesets-versioning.md) for release workflow.

## Troubleshooting

### "commit-msg hook not running"

Git hooks are installed on `pnpm install`. Reinstall:

```bash
pnpm install
# or
lefthook install
```

### "pre-commit hook is slow"

- Lint and format are run only on staged files (fast)
- Typecheck runs on changed packages only (Turbo-cached)
- First commit may be slow, subsequent are cached

```bash
# Check cache status
ls -la .turbo/
```

### "Windows Git Bash: hooks not executing"

Use WSL2 (recommended) or update Git for Windows to latest. Lefthook supports Git Bash natively.

### "commitlint says subject too long"

Messages are limited to 100 chars total. Keep subject short:

```bash
✗ header-max-length: header must not be longer than 100 characters
→ Your message is 112 chars. Keep subject to ~50-60 chars max.

# Too long (76 chars)
feat(chat): add realtime collaborative editing with conflict resolution

# Better (51 chars)
feat(chat): add realtime collaborative editing
# Details go in body if needed
```

## Resources

- [Conventional Commits Spec](https://www.conventionalcommits.org/)
- [commitlint docs](https://commitlint.js.org/)
- [Semantic Versioning](https://semver.org/)
- [Angular Commit Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)
- [ADR 0004: Git Hooks & Conventional Commits](../adrs/0004-lefthook-conventional-commits.md)
