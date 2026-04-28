import {
  AgentError,
  AppError,
  AuthError,
  CredentialError,
  FsError,
  IpcError,
  ProjectError,
  SessionError,
  SourceError,
} from '@g4os/kernel/errors';
import superjson from 'superjson';

/**
 * Registra cada subclasse de AppError no superjson para que erros
 * lançados atravessem a fronteira IPC preservando a identidade da classe.
 * A ordem de importação importa: este módulo deve ser importado antes
 * de qualquer cliente ou servidor tRPC ser criado.
 *
 * Quando uma nova subclasse de `AppError` é exportada por
 * `@g4os/kernel/errors`, ela DEVE ser registrada aqui também — caso
 * contrário o renderer recebe um plain object e perde `instanceof`.
 * O teste em `__tests__/superjson-roundtrip.test.ts` é o gate.
 */
superjson.registerClass(AppError, { identifier: 'AppError' });
superjson.registerClass(CredentialError, { identifier: 'CredentialError' });
superjson.registerClass(AuthError, { identifier: 'AuthError' });
superjson.registerClass(SessionError, { identifier: 'SessionError' });
superjson.registerClass(AgentError, { identifier: 'AgentError' });
superjson.registerClass(SourceError, { identifier: 'SourceError' });
superjson.registerClass(ProjectError, { identifier: 'ProjectError' });
superjson.registerClass(FsError, { identifier: 'FsError' });
superjson.registerClass(IpcError, { identifier: 'IpcError' });

export { superjson };
