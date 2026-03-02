import { describe, expect, it } from 'vitest';
import { mockApiFetch } from './mockData';

describe('mockApiFetch', () => {
  it('returns dashboard status payload', async () => {
    const status = await mockApiFetch<{ provider: string; model: string }>('/api/status');
    expect(status.provider).toBe('openai');
    expect(status.model).toBe('gpt-5.2');
  });

  it('creates cron job from valid payload', async () => {
    const created = await mockApiFetch<{ status: string; job: { command: string } }>('/api/cron', {
      method: 'POST',
      body: JSON.stringify({ command: 'echo test', schedule: '*/5 * * * *' }),
    });

    expect(created.status).toBe('created');
    expect(created.job.command).toBe('echo test');
  });

  it('fails on invalid cron payload', async () => {
    await expect(
      mockApiFetch('/api/cron', {
        method: 'POST',
        body: JSON.stringify({ command: '' }),
      }),
    ).rejects.toThrow(/API 400/);
  });
});
