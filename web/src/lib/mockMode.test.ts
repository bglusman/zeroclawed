import { afterEach, describe, expect, it } from 'vitest';
import {
  isMockBackendEnabled,
  isMockModeEnabled,
  MOCK_BACKEND_STORAGE_KEY,
  MOCK_MODE_STORAGE_KEY,
  setMockBackendEnabled,
  setMockModeEnabled,
} from './mockMode';

afterEach(() => {
  window.localStorage.removeItem(MOCK_BACKEND_STORAGE_KEY);
  window.localStorage.removeItem(MOCK_MODE_STORAGE_KEY);
  window.history.pushState({}, '', '/');
});

describe('mockMode', () => {
  it('defaults to disabled', () => {
    expect(isMockModeEnabled()).toBe(false);
  });

  it('enables from localStorage', () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    expect(isMockModeEnabled()).toBe(true);
  });

  it('uses query param override when present', () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    window.history.pushState({}, '', '/?mock=0');
    expect(isMockModeEnabled()).toBe(false);

    window.history.pushState({}, '', '/?mock=true');
    expect(isMockModeEnabled()).toBe(true);
  });

  it('setMockModeEnabled persists and clears values', () => {
    setMockModeEnabled(true);
    expect(window.localStorage.getItem(MOCK_MODE_STORAGE_KEY)).toBe('1');

    setMockModeEnabled(false);
    expect(window.localStorage.getItem(MOCK_MODE_STORAGE_KEY)).toBeNull();
  });

  it('mock backend defaults to disabled and can be enabled from storage', () => {
    expect(isMockBackendEnabled()).toBe(false);
    window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');
    expect(isMockBackendEnabled()).toBe(true);
  });

  it('mock backend query param overrides localStorage', () => {
    window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');
    window.history.pushState({}, '', '/?mock_backend=0');
    expect(isMockBackendEnabled()).toBe(false);

    window.history.pushState({}, '', '/?mock_backend=1');
    expect(isMockBackendEnabled()).toBe(true);
  });

  it('setMockBackendEnabled persists and clears values', () => {
    setMockBackendEnabled(true);
    expect(window.localStorage.getItem(MOCK_BACKEND_STORAGE_KEY)).toBe('1');

    setMockBackendEnabled(false);
    expect(window.localStorage.getItem(MOCK_BACKEND_STORAGE_KEY)).toBeNull();
  });
});
