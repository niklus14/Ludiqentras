export function grokModelId(): string {
  return process.env.XAI_MODEL?.trim() || 'grok-4.6';
}
