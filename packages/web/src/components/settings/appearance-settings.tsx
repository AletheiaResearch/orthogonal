"use client";

import { SunIcon, MoonIcon, MonitorIcon } from "@/components/ui/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useSyntaxHighlightPreferences,
  LIGHT_THEMES,
  DARK_THEMES,
  type ColorSchemeMode,
  type SyntaxHighlightThemeDefinition,
} from "@/hooks/use-syntax-highlight-preferences";

const COLOR_SCHEME_OPTIONS: { value: ColorSchemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

function ThemeRow({
  label,
  description,
  value,
  themes,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  themes: SyntaxHighlightThemeDefinition[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <span className="text-sm text-foreground">{label}</span>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AppearanceSettings() {
  const { colorSchemeMode, preferredLightTheme, preferredDarkTheme, update } =
    useSyntaxHighlightPreferences();

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Appearance</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Customize the appearance of the application.
      </p>

      {/* Code Highlighting section */}
      <div>
        <h3 className="mb-1 text-base font-medium text-foreground">Code highlighting</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Customize how code is displayed in sessions.
        </p>

        <div className="divide-y divide-border-muted rounded-md border border-border">
          {/* Color scheme mode toggle */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="text-sm text-foreground">Color scheme</span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose light, dark, or match your system theme
              </p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={colorSchemeMode}
              onValueChange={(value) => {
                if (value) update({ colorSchemeMode: value as ColorSchemeMode });
              }}
            >
              {COLOR_SCHEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>

          <ThemeRow
            label="Light theme"
            description="Used when color scheme is light"
            value={preferredLightTheme}
            themes={LIGHT_THEMES}
            onChange={(v) => update({ preferredLightTheme: v })}
          />
          <ThemeRow
            label="Dark theme"
            description="Used when color scheme is dark"
            value={preferredDarkTheme}
            themes={DARK_THEMES}
            onChange={(v) => update({ preferredDarkTheme: v })}
          />
        </div>
      </div>
    </div>
  );
}
