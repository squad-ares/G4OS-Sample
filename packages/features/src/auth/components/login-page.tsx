import { LanguageSwitcher } from '@g4os/ui';
import type { LoginController } from '../hooks/use-login-controller.ts';
import { LoginCard, type LoginCardMode } from './login-card.tsx';

export interface LoginPageProps {
  readonly controller: LoginController;
  /** Erro pré-existente mostrado ao abrir a tela (ex.: reauth expirada). */
  readonly initialError?: string | undefined;
  /** Modo visual: `login` (padrão, primeira vez) ou `reauth` (sessão expirada). */
  readonly mode?: LoginCardMode | undefined;
  /** Callback para abrir reset destrutivo. Quando ausente, o botão de reset não aparece. */
  readonly onReset?: (() => void) | undefined;
  /** Email pré-preenchido (útil em reauth — confiamos no email anterior). */
  readonly reauthEmail?: string | undefined;
}

export function LoginPage({
  controller,
  initialError,
  mode = 'login',
  onReset,
  reauthEmail,
}: LoginPageProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-foreground-2 text-foreground">
      <div className="titlebar-drag-region fixed inset-x-0 top-0 z-10 h-12.5" />

      <div className="fixed right-4 top-4 z-20 titlebar-no-drag">
        <LanguageSwitcher size="sm" variant="ghost" />
      </div>

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="w-md max-w-full">
          <LoginCard
            controller={controller}
            mode={mode}
            initialError={initialError}
            onReset={onReset}
            reauthEmail={reauthEmail}
          />
        </div>
      </main>
    </div>
  );
}
