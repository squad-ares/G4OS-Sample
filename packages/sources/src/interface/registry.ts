import { DisposableBase } from '@g4os/kernel/disposable';
import { SourceError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import type { ISource, SourceConfig, SourceFactory, SourceKind } from './source.ts';

const log = createLogger('source-registry');

export class SourceRegistry extends DisposableBase {
  private readonly factories = new Map<SourceKind, SourceFactory>();
  private readonly instances = new Map<string, ISource>();

  register(factory: SourceFactory): void {
    if (this.factories.has(factory.kind)) {
      throw new Error(`Source kind already registered: ${factory.kind}`);
    }
    this.factories.set(factory.kind, factory);
  }

  unregister(kind: SourceKind): boolean {
    return this.factories.delete(kind);
  }

  hasFactory(kind: SourceKind): boolean {
    return this.factories.has(kind);
  }

  async activate(config: SourceConfig): Promise<Result<ISource, SourceError>> {
    const existing = this.instances.get(config.slug);
    if (existing) return ok(existing);

    const factory = this.factories.get(config.kind);
    if (!factory?.supports(config)) {
      return err(SourceError.incompatible(config.slug, `no factory for kind=${config.kind}`));
    }

    const source = factory.create(config);
    const activation = await source.activate();
    if (activation.isErr()) {
      source.dispose();
      return err(activation.error);
    }

    this.instances.set(config.slug, source);
    return ok(source);
  }

  async deactivate(slug: string): Promise<void> {
    const source = this.instances.get(slug);
    if (!source) return;
    await source.deactivate();
    source.dispose();
    this.instances.delete(slug);
  }

  get(slug: string): ISource | undefined {
    return this.instances.get(slug);
  }

  list(): readonly ISource[] {
    return Array.from(this.instances.values());
  }

  /** @deprecated Usar `dispose()` — mantido por compatibilidade com callers existentes. */
  disposeAll(): Promise<void> {
    this.dispose();
    return Promise.resolve();
  }

  override dispose(): void {
    // allSettled garante que falhas em deactivate individuais não abortam o loop
    // — mantém registry consistente e loga erros sem re-throw.
    const slugs = Array.from(this.instances.keys());
    void Promise.allSettled(
      slugs.map(async (slug) => {
        const source = this.instances.get(slug);
        if (!source) return;
        try {
          await source.deactivate();
        } catch (e) {
          log.warn({ slug, err: String(e) }, 'deactivate falhou durante dispose do registry');
        }
        source.dispose();
        this.instances.delete(slug);
      }),
    );
    this.factories.clear();
    super.dispose();
  }
}

export const globalSourceRegistry = new SourceRegistry();
