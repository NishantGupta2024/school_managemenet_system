import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  effectiveTheme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  isExamActive: boolean;
  setExamActive: (active: boolean) => void;
  isDeferred: boolean;
  deferredTheme: Theme | null;
  clearDeferredNotification: () => void;
}

export const THEME_STORAGE_KEY = 'theme_preference';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Initial theme: default to 'light' for first-time visitors
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
    return 'light'; // Light is default for first-time visitors
  });

  const [isExamActive, setIsExamActiveState] = useState<boolean>(false);
  const [deferredTheme, setDeferredTheme] = useState<Theme | null>(null);
  const [showDeferredBanner, setShowDeferredBanner] = useState<boolean>(false);

  const isExamActiveRef = useRef(isExamActive);
  isExamActiveRef.current = isExamActive;

  // Apply theme to document element
  const applyThemeToDOM = useCallback((newTheme: Theme) => {
    const root = document.documentElement;
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  // Sync DOM on mount and on theme change
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme, applyThemeToDOM]);

  // Set theme handler with live exam safety
  const setTheme = useCallback((newTheme: Theme) => {
    // If an exam is currently active, defer applying the visual theme
    if (isExamActiveRef.current) {
      setDeferredTheme(newTheme);
      setShowDeferredBanner(true);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch {}
      return;
    }

    setThemeState(newTheme);
    applyThemeToDOM(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
  }, [applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    const targetTheme = (deferredTheme || theme) === 'dark' ? 'light' : 'dark';
    setTheme(targetTheme);
  }, [theme, deferredTheme, setTheme]);

  // When exam ends, apply any deferred theme immediately
  const setExamActive = useCallback((active: boolean) => {
    setIsExamActiveState(active);
    isExamActiveRef.current = active;

    if (!active && deferredTheme) {
      const target = deferredTheme;
      setDeferredTheme(null);
      setShowDeferredBanner(false);
      setThemeState(target);
      applyThemeToDOM(target);
    }
  }, [deferredTheme, applyThemeToDOM]);

  const clearDeferredNotification = useCallback(() => {
    setShowDeferredBanner(false);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        effectiveTheme: theme,
        toggleTheme,
        setTheme,
        isExamActive,
        setExamActive,
        isDeferred: showDeferredBanner && deferredTheme !== null,
        deferredTheme,
        clearDeferredNotification,
      }}
    >
      {children}
      {showDeferredBanner && deferredTheme && (
        <div
          role="status"
          aria-live="polite"
          data-testid="deferred-theme-banner"
          className="fixed bottom-4 right-4 z-50 max-w-sm p-3.5 bg-slate-900 text-white rounded-xl shadow-2xl border border-indigo-500/50 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>Theme change to <strong>{deferredTheme}</strong> is deferred until your live exam concludes.</span>
          </div>
          <button
            onClick={clearDeferredNotification}
            className="text-slate-400 hover:text-white p-1 rounded focus:outline-none focus:ring-1 focus:ring-white shrink-0"
            aria-label="Dismiss deferred theme notice"
          >
            ✕
          </button>
        </div>
      )}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const useOptionalTheme = (): ThemeContextType | null => {
  return useContext(ThemeContext) || null;
};
