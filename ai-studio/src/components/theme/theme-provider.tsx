"use client";

import { useEffect } from "react";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  useEffect(() => {
    // This effect runs only on the client after hydration
    // The theme is already set by the inline script in the HTML head
    // This ensures the theme toggle state is synchronized
    const root = document.documentElement;
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = stored ?? (prefersDark ? "dark" : "light");
    root.classList.toggle("dark", current === "dark");
  }, []);

  return <>{children}</>;
};


