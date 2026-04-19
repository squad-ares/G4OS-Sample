export interface SubprocessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface Subprocess {
  readonly stdout: AsyncIterable<string>;
  readonly exit: Promise<SubprocessExit>;
  write(chunk: string): Promise<void>;
  kill(signal?: NodeJS.Signals): void;
}

export interface SubprocessSpawner {
  readonly kind: string;
  spawn(command: string, args: readonly string[]): Subprocess;
}
