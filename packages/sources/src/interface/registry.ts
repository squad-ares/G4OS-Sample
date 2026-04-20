import { SourceError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { ISource, SourceConfig, SourceFactory, SourceKind } from './source.ts';

export class SourceRegistry {
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

  async disposeAll(): Promise<void> {
    const slugs = Array.from(this.instances.keys());
    await Promise.all(slugs.map((slug) => this.deactivate(slug)));
    this.factories.clear();
  }
}

export const globalSourceRegistry = new SourceRegistry();
