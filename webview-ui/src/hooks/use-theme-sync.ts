import { useEffect } from "react";
import { useThemeStore } from "@/store/theme-store";

/** Applies `dark` class on <html> for Tailwind dark mode. */
export function useThemeSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);
}
