"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "xpchat-theme";
const THEME_CHANGE_EVENT = "xpchat-theme-change";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getServerTheme(): Theme {
  return "light";
}

function getClientTheme(): Theme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function setTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getClientTheme,
    getServerTheme
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
