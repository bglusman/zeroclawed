export const MOCK_MODE_STORAGE_KEY = 'zeroclaw:mock-mode';
export const MOCK_BACKEND_STORAGE_KEY = 'zeroclaw:mock-backend';

const truthyValues = new Set(['1', 'true', 'yes', 'on']);

function parseTruthy(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return truthyValues.has(value.trim().toLowerCase());
}

export function isMockModeEnabled(): boolean {
  const envEnabled = parseTruthy(import.meta.env.VITE_MOCK_API);

  if (typeof window === 'undefined') {
    return envEnabled;
  }

  try {
    const queryValue = new URLSearchParams(window.location.search).get('mock');
    if (queryValue !== null) {
      return parseTruthy(queryValue);
    }
  } catch {
    // Ignore malformed search params and continue to storage/env checks.
  }

  try {
    const stored = window.localStorage.getItem(MOCK_MODE_STORAGE_KEY);
    if (stored !== null) {
      return parseTruthy(stored);
    }
  } catch {
    // Ignore storage access errors and fall back to env value.
  }

  return envEnabled;
}

export function isMockBackendEnabled(): boolean {
  const envEnabled = parseTruthy(import.meta.env.VITE_MOCK_BACKEND);

  if (typeof window === 'undefined') {
    return envEnabled;
  }

  try {
    const queryValue = new URLSearchParams(window.location.search).get('mock_backend');
    if (queryValue !== null) {
      return parseTruthy(queryValue);
    }
  } catch {
    // Ignore malformed search params and continue to storage/env checks.
  }

  try {
    const stored = window.localStorage.getItem(MOCK_BACKEND_STORAGE_KEY);
    if (stored !== null) {
      return parseTruthy(stored);
    }
  } catch {
    // Ignore storage access errors and fall back to env value.
  }

  return envEnabled;
}

export function setMockModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (enabled) {
      window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(MOCK_MODE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function setMockBackendEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (enabled) {
      window.localStorage.setItem(MOCK_BACKEND_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(MOCK_BACKEND_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors.
  }
}
