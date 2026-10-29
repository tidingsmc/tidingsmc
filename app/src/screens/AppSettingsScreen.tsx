// Only the version is bundled: Vite tree-shakes named imports from JSON.
import { version } from '../../package.json';
import type { ReactNode } from 'react';
import { Moon, Smartphone, Sun } from 'pixelarticons/react';
import { Screen } from '../components';
import { paths } from '../lib/router';
import { useTheme, type Theme } from '../lib/theme';

const themes: Record<Theme, { label: string; icon: ReactNode; next: Theme }> = {
  system: { label: 'System', icon: <Smartphone />, next: 'light' },
  light: { label: 'Light', icon: <Sun />, next: 'dark' },
  dark: { label: 'Dark', icon: <Moon />, next: 'system' },
};

/** Settings for the app itself, on this device; each server's are on its own settings screen. */
export function AppSettingsScreen() {
  const [theme, setTheme] = useTheme();
  const { label, next } = themes[theme];

  return (
    <Screen title="Settings" back={paths.servers}>
      <div className="info-row">
        Theme
        <button className="button theme-button" aria-label={`Theme: ${label}`} onClick={() => setTheme(next)}>
          {/* All stacked, only the current one shown: the button keeps the widest one's width as it changes. */}
          {Object.entries(themes).map(([value, { label, icon }]) => (
            <span key={value} className="theme-option" hidden={value !== theme}>
              {icon} {label}
            </span>
          ))}
        </button>
      </div>

      <p className="info-row">
        Version <span className="muted">{version}</span>
      </p>

      {/* Required by Minecraft's usage guidelines for anything using its name. */}
      <p className="muted small footer-note">
        Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
      </p>
    </Screen>
  );
}
