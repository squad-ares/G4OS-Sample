import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewsService } from '../news-service.ts';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE_FEED = {
  generatedAt: '2026-04-23T10:00:00Z',
  items: [
    {
      id: 'post-a',
      title: 'Post A',
      markdown: '# Olá\n\nConteúdo A',
      publishDate: '2026-04-23T09:00:00Z',
      sortRank: 0,
      updatedAt: '2026-04-23T09:00:00Z',
    },
    {
      id: 'post-b',
      title: 'Post B',
      markdown: 'Conteúdo B',
      publishDate: '2026-04-22T09:00:00Z',
      sortRank: 0,
      updatedAt: '2026-04-22T09:00:00Z',
    },
  ],
};

describe('NewsService', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
  });

  it('list retorna items do viewer', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(BASE_FEED));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const result = await service.list();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.id).toBe('post-a');
    }
    expect(fetchMock).toHaveBeenCalledWith('https://viewer.test/api/news', expect.any(Object));
  });

  it('get(id) encontra item pela lista cacheada', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(BASE_FEED));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const result = await service.get('post-b');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value?.title).toBe('Post B');
  });

  it('get(id) inexistente retorna ok(null)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(BASE_FEED));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const result = await service.get('post-inexistente');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });

  it('cache evita refetch dentro do TTL', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(okResponse(BASE_FEED)));
    let now = 1_000;
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
      now: () => now,
    });

    await service.list();
    now += 60_000; // 1 min depois — ainda dentro do TTL de 5 min
    const second = await service.list();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.isOk()).toBe(true);
  });

  it('cache expira após TTL e refaz fetch', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(okResponse(BASE_FEED)));
    let now = 1_000;
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
      now: () => now,
    });

    const first = await service.list();
    now += 6 * 60_000; // 6 min depois — após TTL de 5 min
    const second = await service.list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
  });

  it('erro HTTP é mapeado para Result.err', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const result = await service.list();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('502');
    }
  });

  it('shape inválido do viewer retorna Result.err', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ foo: 'bar' }));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const result = await service.list();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('invalid shape');
    }
  });

  it('remove trailing slash do viewerUrl', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(BASE_FEED));
    const service = createNewsService({
      viewerUrl: 'https://viewer.test/',
      fetchImpl: fetchMock,
    });

    await service.list();
    expect(fetchMock).toHaveBeenCalledWith('https://viewer.test/api/news', expect.any(Object));
  });

  it('dispose() aborta fetch em voo e cancela timer de timeout', async () => {
    let signalAtCallTime: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      signalAtCallTime = (init as RequestInit | undefined)?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signalAtCallTime?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });

    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    const pending = service.list();
    // libera a fila para o fetch ser registrado em `inflight`
    await Promise.resolve();
    service.dispose();

    const result = await pending;
    expect(result.isErr()).toBe(true);
    expect(signalAtCallTime?.aborted).toBe(true);
  });

  it('dispose() é idempotente', () => {
    const service = createNewsService({
      viewerUrl: 'https://viewer.test',
      fetchImpl: fetchMock,
    });

    expect(() => {
      service.dispose();
      service.dispose();
    }).not.toThrow();
  });
});
