import 'server-only';
import { randomUUID } from 'node:crypto';
import { RedisPreviewStore } from '@/lib/infrastructure/redis/preview-store';
import { DiscoveryError, type DescriptionValidation, type PreviewCandidate } from '@/lib/domain/schemas';

export type PreviewRecord = {
  id: string;
  query: string;
  validation: DescriptionValidation;
  candidates: PreviewCandidate[];
  createdAt: number;
  expiresAt: number;
  state: 'ready' | 'collecting' | 'consumed';
};

type MaybePromise<T> = T | Promise<T>;
export interface PreviewRepository {
  create(input: Pick<PreviewRecord, 'query' | 'validation' | 'candidates'>): MaybePromise<PreviewRecord>;
  get(id: string): MaybePromise<PreviewRecord>;
  claim(id: string): MaybePromise<PreviewRecord>;
  complete(id: string): MaybePromise<void>;
  release(id: string): MaybePromise<void>;
}

export class PreviewStore {
  private records = new Map<string, PreviewRecord>();
  constructor(private ttlMs = 30 * 60_000, private maxRecords = 100, private now = () => Date.now()) {}

  create(input: Pick<PreviewRecord, 'query' | 'validation' | 'candidates'>): PreviewRecord {
    this.prune();
    while (this.records.size >= this.maxRecords) this.records.delete(this.records.keys().next().value!);
    const createdAt = this.now();
    const record: PreviewRecord = { ...input, id: randomUUID(), createdAt, expiresAt: createdAt + this.ttlMs, state: 'ready' };
    this.records.set(record.id, record);
    return record;
  }

  get(id: string): PreviewRecord {
    const record = this.records.get(id);
    if (!record) throw new DiscoveryError('PREVIEW_NOT_FOUND', 'Discovery preview was not found');
    if (record.expiresAt <= this.now()) {
      this.records.delete(id);
      throw new DiscoveryError('PREVIEW_EXPIRED', 'Discovery preview has expired');
    }
    return record;
  }

  claim(id: string): PreviewRecord {
    const record = this.get(id);
    if (record.state === 'collecting') throw new DiscoveryError('PREVIEW_BUSY', 'Discovery preview is already being collected');
    if (record.state === 'consumed') throw new DiscoveryError('PREVIEW_CONSUMED', 'Discovery preview has already been used');
    record.state = 'collecting';
    return record;
  }

  complete(id: string) {
    const record = this.records.get(id);
    if (record?.state === 'collecting') record.state = 'consumed';
  }

  release(id: string) {
    const record = this.records.get(id);
    if (record?.state === 'collecting') record.state = 'ready';
  }

  private prune() {
    const now = this.now();
    for (const [id, record] of this.records) if (record.expiresAt <= now) this.records.delete(id);
  }
}

declare global { var __discoveryPreviewStore: PreviewRepository | undefined; }
export const previewStore = globalThis.__discoveryPreviewStore ??= (
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new RedisPreviewStore(process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN)
    : new PreviewStore()
);
