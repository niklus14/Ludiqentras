import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisPreviewStore } from '@/lib/infrastructure/redis/preview-store';
import type { DescriptionValidation } from '@/lib/domain/schemas';

const run = promisify(execFile);
const available = spawnSync('redis-server', ['--version']).status === 0
  && spawnSync('redis-cli', ['--version']).status === 0;
const input = { query: 'co-op horror', candidates: [], validation: {
  status: 'ready', normalizedDescription: 'Co-op horror', confidence: 0.9,
  tags: [{ name: 'Horror', category: 'theme', priority: 'required', basis: 'explicit' },
    { name: 'Co-op', category: 'mode', priority: 'required', basis: 'explicit' }],
  mustHave: ['horror'], avoid: [], multiplayer: true, questions: [],
} satisfies DescriptionValidation };

// Exercise the production Lua against Redis, with independent client instances.
describe.skipIf(!available)('shared Redis previews', () => {
  let directory: string;
  let socket: string;
  let server: ChildProcess;
  const command = async (args: (string | number)[]) => {
    const { stdout } = await run('redis-cli', ['-s', socket, '--json', ...args.map(String)]);
    return JSON.parse(stdout) as unknown;
  };

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ludiqentra-redis-'));
    socket = join(directory, 'redis.sock');
    server = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'],
      { stdio: 'ignore' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if (await command(['PING']) === 'PONG') return; } catch { /* wait for startup */ }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Test Redis did not start');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      const args = JSON.parse(String(options.body)) as (string | number)[];
      return Response.json({ result: await command(args) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    if (server && server.exitCode === null) {
      const closed = new Promise(resolve => server.once('close', resolve));
      server.kill('SIGTERM');
      await closed;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('loads and claims another instance’s preview without changing array shapes', async () => {
    const writer = new RedisPreviewStore('https://redis.test', 'test-token');
    const reader = new RedisPreviewStore('https://redis.test', 'test-token');
    const record = await writer.create(input);
    const claimed = await reader.claim(record.id);
    expect(claimed).toEqual({ ...record, state: 'collecting' });
    expect(claimed.validation.questions).toEqual([]);
    expect((await writer.get(record.id)).state).toBe('collecting');
  });

  it('allows exactly one concurrent claim across clients', async () => {
    const first = new RedisPreviewStore('https://redis.test', 'test-token');
    const second = new RedisPreviewStore('https://redis.test', 'test-token');
    const record = await first.create(input);
    const results = await Promise.allSettled([first.claim(record.id), second.claim(record.id)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'PREVIEW_BUSY' } });
  });

  it('releases failures but prevents replay after completion', async () => {
    const store = new RedisPreviewStore('https://redis.test', 'test-token');
    const record = await store.create(input);
    await store.claim(record.id);
    await store.release(record.id);
    expect((await store.get(record.id)).state).toBe('ready');
    await store.claim(record.id);
    await store.complete(record.id);
    await store.release(record.id);
    await expect(store.claim(record.id)).rejects.toMatchObject({ code: 'PREVIEW_CONSUMED' });
  });

  it('keeps the original expiry when state changes and deletes expired records', async () => {
    const store = new RedisPreviewStore('https://redis.test', 'test-token', 1000);
    const record = await store.create(input);
    await new Promise(resolve => setTimeout(resolve, 100));
    await store.claim(record.id);
    await store.release(record.id);
    const remaining = await command(['PTTL', `ludiqentras:preview:${record.id}`]);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(900);
    await new Promise(resolve => setTimeout(resolve, 1100));
    await expect(store.get(record.id)).rejects.toMatchObject({ code: 'PREVIEW_NOT_FOUND' });
  });

  it('reports storage outages without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private provider error', { status: 401 })));
    const store = new RedisPreviewStore('https://redis.test', 'secret-token');
    await expect(store.create(input)).rejects.toThrow('Preview storage is unavailable');
  });
});
