import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDirHandler } from '../../tools/handlers/list-dir.ts';
import { readFileHandler } from '../../tools/handlers/read-file.ts';
import { writeFileHandler } from '../../tools/handlers/write-file.ts';
import type { ToolContext } from '../../tools/types.ts';

function makeContext(workingDirectory: string, signal?: AbortSignal): ToolContext {
  const controller = new AbortController();
  return {
    sessionId: '00000000-0000-0000-0000-000000000000',
    turnId: 't1',
    toolUseId: 'tu1',
    workingDirectory,
    signal: signal ?? controller.signal,
  };
}

describe('tool handlers', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'g4os-tools-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('read_file returns file contents', async () => {
    await writeFile(join(dir, 'hello.txt'), 'hi there', 'utf8');
    const result = await readFileHandler.execute({ path: 'hello.txt' }, makeContext(dir));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.output).toBe('hi there');
  });

  it('read_file rejects path escape', async () => {
    const result = await readFileHandler.execute({ path: '../etc/passwd' }, makeContext(dir));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('tool.read_file.path_escape');
  });

  it('read_file validates input', async () => {
    const result = await readFileHandler.execute({}, makeContext(dir));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('tool.read_file.invalid_input');
  });

  it('list_dir lists entries', async () => {
    await writeFile(join(dir, 'a.txt'), '', 'utf8');
    await writeFile(join(dir, 'b.txt'), '', 'utf8');
    const result = await listDirHandler.execute({}, makeContext(dir));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.output.split('\n').sort()).toEqual(['a.txt', 'b.txt']);
    }
  });

  it('list_dir rejects depth out of range', async () => {
    const result = await listDirHandler.execute({ depth: 99 }, makeContext(dir));
    expect(result.isErr()).toBe(true);
  });

  it('write_file creates a file', async () => {
    const result = await writeFileHandler.execute(
      { path: 'out.txt', content: 'data' },
      makeContext(dir),
    );
    expect(result.isOk()).toBe(true);
    const roundTrip = await readFile(join(dir, 'out.txt'), 'utf8');
    expect(roundTrip).toBe('data');
  });

  it('write_file rejects escape', async () => {
    const result = await writeFileHandler.execute(
      { path: '../x.txt', content: 'data' },
      makeContext(dir),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('tool.write_file.path_escape');
  });
});
