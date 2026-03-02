import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { MOCK_MODE_STORAGE_KEY } from '@/lib/mockMode';

afterEach(() => {
  window.localStorage.removeItem(MOCK_MODE_STORAGE_KEY);
  window.history.pushState({}, '', '/');
});

describe('Dashboard', () => {
  it('renders with mock data and supports collapsing every dashboard section', async () => {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, '1');

    render(<Dashboard />);

    expect(await screen.findByText('Electric Runtime Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('openai')).toBeInTheDocument();

    const sectionButtons = [
      screen.getByRole('button', { name: /Cost Pulse/i }),
      screen.getByRole('button', { name: /Channel Activity/i }),
      screen.getByRole('button', { name: /Component Health/i }),
    ];

    for (const sectionButton of sectionButtons) {
      expect(sectionButton).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(sectionButton);
      await waitFor(() => {
        expect(sectionButton).toHaveAttribute('aria-expanded', 'false');
      });

      await userEvent.click(sectionButton);
      await waitFor(() => {
        expect(sectionButton).toHaveAttribute('aria-expanded', 'true');
      });
    }
  });
});
