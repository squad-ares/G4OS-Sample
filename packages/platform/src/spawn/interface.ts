import type { ChildProcess, SpawnOptions } from 'node:child_process';

export interface SpawnPolicy {
  /** Timeout apos o qual o processo e morto */
  timeoutMs?: number;
  /** Kill signal a usar */
  killSignal?: NodeJS.Signals;
  /** Cleanup automático em app exit */
  autoKillOnExit?: boolean;
  /** Memory limit via cgroups (Linux) ou Job Object (Windows) */
  memoryLimitMb?: number;
}

export interface ISpawner {
  spawn(command: string, args: string[], options: SpawnOptions & SpawnPolicy): ChildProcess;
}
