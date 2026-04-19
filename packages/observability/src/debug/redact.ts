import { scrubObject, scrubString } from '../sentry/scrub.ts';

export function redactSecretsInText(text: string): string {
  return scrubString(text);
}

export function sanitizeConfig<T>(config: T): T {
  return scrubObject(config);
}
