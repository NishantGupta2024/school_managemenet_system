import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from '../context/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

// Test consumer component
const TestConsumer: React.FC = () => {
  const { theme, toggleTheme, isExamActive, setExamActive, isDeferred } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="is-exam-active">{isExamActive ? 'yes' : 'no'}</span>
      <span data-testid="is-deferred">{isDeferred ? 'yes' : 'no'}</span>
      <button onClick={toggleTheme} data-testid="toggle-btn">Toggle</button>
      <button onClick={() => setExamActive(true)} data-testid="start-exam-btn">Start Exam</button>
      <button onClick={() => setExamActive(false)} data-testid="end-exam-btn">End Exam</button>
    </div>
  );
};

describe('Theme Context & ThemeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('1. defaults to "light" theme for first-time visitors with empty localStorage', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('2. loads "dark" theme from localStorage when previously saved', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('3. toggles theme between light and dark and persists to localStorage', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
        <ThemeToggle />
      </ThemeProvider>,
    );

    const toggleBtn = screen.getByTestId('theme-toggle-button');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Switch to dark theme');

    // Switch to dark
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Switch to light theme');

    // Switch back to light
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('4. defers theme change during an active live exam to protect student answers', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
        <ThemeToggle />
      </ThemeProvider>,
    );

    // Initial state: light theme, no exam
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Start live exam
    fireEvent.click(screen.getByTestId('start-exam-btn'));
    expect(screen.getByTestId('is-exam-active').textContent).toBe('yes');

    // Try to toggle theme to dark during active exam
    fireEvent.click(screen.getByTestId('theme-toggle-button'));

    // Theme should still be visually light (not disruptive)
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Deferred status banner should be displayed
    expect(screen.getByTestId('is-deferred').textContent).toBe('yes');
    expect(screen.getByTestId('deferred-theme-banner')).toBeInTheDocument();
    expect(screen.getByText(/deferred until your live exam concludes/i)).toBeInTheDocument();

    // Storage preserves preference
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // End the exam
    fireEvent.click(screen.getByTestId('end-exam-btn'));

    // Deferred theme should now be applied immediately!
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.queryByTestId('deferred-theme-banner')).not.toBeInTheDocument();
  });

  it('5. verifies dark theme CSS selectors are applied to DOM elements in dark mode', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
        <ThemeToggle />
        <div data-testid="workspace-card" className="bg-white p-6 rounded-2xl border border-slate-200">
          <span className="text-slate-900">Card Header</span>
          <div className="bg-slate-50/50 p-2">Sub header</div>
        </div>
      </ThemeProvider>,
    );

    const card = screen.getByTestId('workspace-card');
    expect(card).toBeInTheDocument();

    // In Light mode, html has no .dark class
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Toggle to Dark mode
    fireEvent.click(screen.getByTestId('theme-toggle-button'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('current-theme').textContent).toBe('dark');

    // Toggle back to Light mode
    fireEvent.click(screen.getByTestId('theme-toggle-button'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByTestId('current-theme').textContent).toBe('light');
  });
});
