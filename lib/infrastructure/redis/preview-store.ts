import 'server-only';
import { randomUUID } from 'node:crypto';
import { DiscoveryError } from '@/lib/domain/schemas';
import type { PreviewRecord, PreviewRepository } from '@/lib/application/discovery/preview-store';

// The state check and update must be atomic across separate serverless instances.
const TRANSITION = `
local raw = redis.call('HGET', KEYS[1], 'record')
if not raw then return {'missing', '', ''} end
local record = cjson.decode(raw)
if record.expiresAt <= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return {'expired', '', ''}
end
local action = ARGV[1]
local state = redis.call('HGET', KEYS[1], 'state')
if action == 'claim' then
  if state == 'collecting' then return {'busy', '', ''} end
  if state == 'consumed' then return {'consumed', '', ''} end
  state = 'collecting'
elseif state == 'collecting' then
  if action == 'complete' then state = 'consumed'
  else state = 'ready' end
end
redis.call('HSET', KEYS[1], 'state', state)
return {'ok', raw, state}
`;

const CREATE = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'record', ARGV[1], 'state', 'ready')
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

export class RedisPreviewStore implements PreviewRepository {
  constructor(
    private url: string,
    private token: string,
    private ttlMs = 30 * 60_000,
    private now = () => Date.now(),
  ) {}

  private key(id: string) { return `ludiqentras:preview:${id}`; }

  private async command(args: (string | number)[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Preview storage is unavailable');
    const data = await response.json() as { result?: unknown; error?: string };
    if (data.error) throw new Error('Preview storage command failed');
    return data.result;
  }

  async create(input: Pick<PreviewRecord, 'query' | 'validation' | 'candidates'>): Promise<PreviewRecord> {
    const createdAt = this.now();
    const record: PreviewRecord = { ...input, id: randomUUID(), createdAt,
      expiresAt: createdAt + this.ttlMs, state: 'ready' };
    const result = await this.command(['EVAL', CREATE, 1, this.key(record.id), JSON.stringify(record), this.ttlMs]);
    if (result !== 1) throw new Error('Could not store discovery preview');
    return record;
  }

  async get(id: string): Promise<PreviewRecord> {
    const [raw, state] = await this.command(['HMGET', this.key(id), 'record', 'state']) as [string | null, PreviewRecord['state']];
    if (typeof raw !== 'string') throw new DiscoveryError('PREVIEW_NOT_FOUND', 'Discovery preview was not found');
    const record = JSON.parse(raw) as PreviewRecord;
    if (record.expiresAt <= this.now()) throw new DiscoveryError('PREVIEW_EXPIRED', 'Discovery preview has expired');
    return { ...record, state };
  }

  private async transition(id: string, action: 'claim' | 'complete' | 'release'): Promise<PreviewRecord | null> {
    const [status, raw, state] = await this.command(['EVAL', TRANSITION, 1, this.key(id), action, this.now()]) as [string, string, PreviewRecord['state']];
    if (action !== 'claim' && (status === 'missing' || status === 'expired')) return null;
    if (status === 'missing') throw new DiscoveryError('PREVIEW_NOT_FOUND', 'Discovery preview was not found');
    if (status === 'expired') throw new DiscoveryError('PREVIEW_EXPIRED', 'Discovery preview has expired');
    if (status === 'busy') throw new DiscoveryError('PREVIEW_BUSY', 'Discovery preview is already being collected');
    if (status === 'consumed') throw new DiscoveryError('PREVIEW_CONSUMED', 'Discovery preview has already been used');
    return { ...JSON.parse(raw) as PreviewRecord, state };
  }

  async claim(id: string): Promise<PreviewRecord> { return (await this.transition(id, 'claim'))!; }
  async complete(id: string): Promise<void> { await this.transition(id, 'complete'); }
  async release(id: string): Promise<void> { await this.transition(id, 'release'); }
}
