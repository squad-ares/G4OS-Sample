import {
  AgentError,
  AppError,
  AuthError,
  CredentialError,
  SessionError,
  SourceError,
} from '@g4os/kernel/errors';
import superjson from 'superjson';

/**
 * Registra cada subclasse de AppError no superjson para que erros
 * lançados atravessem a fronteira IPC preservando a identidade da classe.
 * A ordem de importação importa: este módulo deve ser importado antes
 * de qualquer cliente ou servidor tRPC ser criado.
 */
superjson.registerClass(AppError, { identifier: 'AppError' });
superjson.registerClass(CredentialError, { identifier: 'CredentialError' });
superjson.registerClass(AuthError, { identifier: 'AuthError' });
superjson.registerClass(SessionError, { identifier: 'SessionError' });
superjson.registerClass(AgentError, { identifier: 'AgentError' });
superjson.registerClass(SourceError, { identifier: 'SourceError' });

export { superjson };
