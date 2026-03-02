import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getPublicHealth, pair } from './api';
import {
  MOCK_BACKEND_STORAGE_KEY,
  MOCK_MODE_STORAGE_KEY,
} from './mockMode';
import { clearToken, setToken } from './auth';

afterEach(() => {
  vi.restoreAllMocks();
  clearToken();
  window.localStorage.removeItem(MOCK_MODE_STORAGE_KEY);
  window.localStorage.removeItem(MOCK_BACKEND_STORAGE_KEY);
  window.history.pushState({}, '', '/');
});

describe('api backend mock mode', () => {
  it('sends backend mock header for /api requests', async () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');
    setToken('tok_test_backend_mock');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ provider: 'openai' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const data = await apiFetch<{ provider: string }>('/api/status');
    expect(data.provider).toBe('openai');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-ZeroClaw-Mock')).toBe('1');
    expect(headers.get('Authorization')).toBe('Bearer tok_test_backend_mock');
  });

  it('uses real /pair request in backend mock mode', async () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ token: 'pair-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const result = await pair('123456');
    expect(result.token).toBe('pair-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/pair');
  });

  it('uses real /health request in backend mock mode', async () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ require_pairing: true, paired: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const payload = await getPublicHealth();
    expect(payload.require_pairing).toBe(true);
    expect(payload.paired).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/health');
  });
});
