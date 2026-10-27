"use client";
import { Contrast } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Menu } from "@/components/ui/overlay";
import { SHELL } from "@/lib/copy";

export type ThemeChoice = "light" | "dark" | "system";

export function applyTheme(t: ThemeChoice) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("pp-theme", t);
  } catch {
    /* storage can be blocked; the theme still applies for this page */
  }
}

export function ThemeToggle() {
  return (
    <Menu
      label={SHELL.theme}
      trigger={
        <IconButton label={SHELL.theme} data-testid="theme-toggle">
          <Contrast />
        </IconButton>
      }
      entries={[
        { type: "item", id: "light", label: SHELL.themeLight, onSelect: () => applyTheme("light") },
        { type: "item", id: "dark", label: SHELL.themeDark, onSelect: () => applyTheme("dark") },
        { type: "item", id: "system", label: SHELL.themeSystem, onSelect: () => applyTheme("system") },
      ]}
    />
  );
}
