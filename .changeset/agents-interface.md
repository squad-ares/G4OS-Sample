---
'@g4os/agents': minor
---

Agent framework epic 07 (TASK-07-01): `@g4os/agents/interface` publica o contrato plugin para agentes. `IAgent extends IDisposable` (ADR-0012) + `AgentFactory { kind, supports, create }` + `AgentRegistry` (`register` lança em duplicate kind; `resolve`/`create` retornam `Result<IAgent, AgentError>` via neverthrow — ADR-0011). `AgentEvent` é união discriminada cobrindo todos os eventos que v1 emitia (started, text/thinking deltas, tool use em 4 fases, usage, done, error). Schemas Zod para `AgentConfig`/`AgentCapabilities`/`AgentDoneReason`/`ThinkingLevel`/`AgentFamily` validam payloads IPC. `ToolDefinition` reusa o tipo de `@g4os/kernel` (sem redefinição). `rxjs` é o transport de stream do contrato. Boundary `agents-interface-isolated` no dependency-cruiser garante que o pacote só depende de `@g4os/kernel`. ADR-0070.
