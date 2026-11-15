import React from 'react';
import { useOptionalTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export interface ThemeToggleProps {
  className?: string;
  variant?: 'header' | 'compact' | 'pill';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
}) => {
  const themeContext = useOptionalTheme();
  const theme = themeContext?.theme || 'light';
  const toggleTheme = themeContext?.toggleTheme || (() => {});
  const isExamActive = themeContext?.isExamActive || false;
  const isDeferred = themeContext?.isDeferred || false;
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={
        isExamActive
          ? 'Exam in progress: Theme change will apply when exam ends'
          : isDark
          ? 'Switch to Light theme'
          : 'Switch to Dark theme'
      }
      className={`relative inline-flex items-center justify-center rounded-xl p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 shrink-0 ${
        isDark
          ? 'bg-slate-800/80 text-amber-300 hover:text-amber-200 hover:bg-slate-700/80 border border-slate-700/60'
          : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200/80 border border-slate-200'
      } ${className}`}
      data-testid="theme-toggle-button"
    >
      <span className="sr-only">
        {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      </span>
      {isDark ? (
        <Sun className="w-4 h-4 transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 transition-transform duration-200 hover:-rotate-12" />
      )}
      {isDeferred && (
        <span
          className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-slate-900"
          title="Deferred until exam ends"
          data-testid="deferred-dot"
        />
      )}
    </button>
  );
};
