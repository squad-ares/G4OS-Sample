import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: 'S256';
}

export function generatePkce(verifierBytes = 32): PkcePair {
  const verifier = randomBytes(verifierBytes).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export function generateState(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}
