export type SourceIntentKind =
  | 'explicit'
  | 'mention'
  | 'skill-required'
  | 'preview-mount'
  | 'soft'
  | 'none';

export interface SourceIntent {
  readonly kind: SourceIntentKind;
  readonly sources: readonly string[];
  readonly confidence: 'hard' | 'soft';
}

export interface IntentContext {
  readonly availableSources: readonly { readonly slug: string; readonly displayName: string }[];
  readonly requiredBySkill?: readonly string[];
  readonly previewMounted?: readonly string[];
}

const EXPLICIT_RE = /\[source:([a-z0-9][a-z0-9_-]*)\]/gi;
const MENTION_RE = /(?:^|\s)@([a-z0-9][a-z0-9_-]*)/gi;
const USE_DIRECTIVE_RE = /\b(?:use|usar|usa)\s+([A-Za-z0-9][A-Za-z0-9 _-]{1,40})\b/gi;

export class SourceIntentDetector {
  detect(message: string, context: IntentContext): SourceIntent {
    const explicit = unique(matchAll(message, EXPLICIT_RE));
    if (explicit.length > 0) {
      return { kind: 'explicit', sources: explicit, confidence: 'hard' };
    }

    const mentions = unique(matchAll(message, MENTION_RE)).filter((s) =>
      context.availableSources.some((a) => a.slug === s),
    );
    if (mentions.length > 0) {
      return { kind: 'mention', sources: mentions, confidence: 'hard' };
    }

    if (context.requiredBySkill && context.requiredBySkill.length > 0) {
      return {
        kind: 'skill-required',
        sources: [...context.requiredBySkill],
        confidence: 'hard',
      };
    }

    if (context.previewMounted && context.previewMounted.length > 0) {
      return {
        kind: 'preview-mount',
        sources: [...context.previewMounted],
        confidence: 'hard',
      };
    }

    const soft = this.extractSoftReferences(message, context.availableSources);
    if (soft.length > 0) {
      return { kind: 'soft', sources: soft, confidence: 'soft' };
    }

    return { kind: 'none', sources: [], confidence: 'soft' };
  }

  private extractSoftReferences(
    message: string,
    available: IntentContext['availableSources'],
  ): string[] {
    const lower = message.toLowerCase();
    const hits = new Set<string>();

    for (const candidate of matchAll(message, USE_DIRECTIVE_RE)) {
      const needle = candidate.trim().toLowerCase();
      const match = available.find(
        (a) => a.slug.toLowerCase() === needle || a.displayName.toLowerCase() === needle,
      );
      if (match) hits.add(match.slug);
    }

    for (const src of available) {
      const display = src.displayName.toLowerCase();
      if (display.length >= 3 && lower.includes(display)) {
        hits.add(src.slug);
      }
    }

    return Array.from(hits);
  }
}

function matchAll(input: string, re: RegExp): string[] {
  const out: string[] = [];
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const pattern = new RegExp(re.source, flags);
  let match: RegExpExecArray | null = pattern.exec(input);
  while (match !== null) {
    if (match[1]) out.push(match[1]);
    match = pattern.exec(input);
  }
  return out;
}

function unique(xs: readonly string[]): string[] {
  return Array.from(new Set(xs));
}
