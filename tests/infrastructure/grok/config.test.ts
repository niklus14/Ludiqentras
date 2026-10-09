import { afterEach, describe, expect, it, vi } from 'vitest';
import { grokModelId } from '@/lib/infrastructure/grok/config';

afterEach(() => vi.unstubAllEnvs());

describe('Grok model configuration', () => {
  it('uses the supported default for missing or blank configuration', () => {
    vi.stubEnv('XAI_MODEL', undefined);
    expect(grokModelId()).toBe('grok-4.6');
    vi.stubEnv('XAI_MODEL', '  ');
    expect(grokModelId()).toBe('grok-4.6');
  });

  it('honors an explicit model override', () => {
    vi.stubEnv('XAI_MODEL', ' grok-4.7 ');
    expect(grokModelId()).toBe('grok-4.7');
  });
});
