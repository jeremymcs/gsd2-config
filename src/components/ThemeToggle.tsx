// GSD2 Config - Theme Toggle (system / dark / light segmented control)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useTheme, type ThemePreference } from "../lib/theme";

const OPTIONS: { value: ThemePreference; label: string; title: string }[] = [
  { value: "system", label: "Auto", title: "Follow system theme" },
  { value: "dark", label: "Dark", title: "Force dark theme" },
  { value: "light", label: "Light", title: "Force light theme" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex rounded-md border border-gsd-border overflow-hidden shrink-0"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            title={opt.title}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-gsd-accent text-gsd-on-accent"
                : "bg-gsd-bg text-gsd-text-dim hover:text-gsd-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
