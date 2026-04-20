---
"@g4os/auth": minor
"@g4os/sources": minor
"@g4os/agents": patch
---

Refatoração dos pacotes de Autenticação e Sources/MCP para adequação à nova arquitetura granular (Épicos 08 e 09). Implementação das decisões arquiteturais (ADRs) 0081-0086 (interface ISource, McpStdioSource, McpHttpSource, ManagedConnectorBase, OAuth Kit, SourceLifecycleManager) e 0091-0094 (fallback OTP Supabase, ManagedLoginService, dev bypass do EntitlementService, e injeção do timer no SessionRefresher).
