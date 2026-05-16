import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme } from 'nativewind';
import { useSettingsStore } from '@/store/settingsStore';
import { darkTheme, lightTheme, themeColorsFor, type AppThemeColors, type ThemeMode } from '@/theme/colors';

type AppThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppThemeColors;
  navTheme: NavTheme;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function buildNavTheme(mode: ThemeMode, colors: AppThemeColors): NavTheme {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.ink,
      card: colors.surface,
      primary: colors.accent,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.themeMode);
  const { setColorScheme } = useColorScheme();

  const colors = useMemo(() => themeColorsFor(mode), [mode]);
  const isDark = mode === 'dark';
  const navTheme = useMemo(() => buildNavTheme(mode, colors), [colors, mode]);

  useEffect(() => {
    setColorScheme(mode);
    void SystemUI.setBackgroundColorAsync(colors.ink);
  }, [colors.ink, mode, setColorScheme]);

  const value = useMemo(
    () => ({ mode, isDark, colors, navTheme }),
    [colors, isDark, mode, navTheme]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    return {
      mode: 'dark',
      isDark: true,
      colors: darkTheme,
      navTheme: buildNavTheme('dark', darkTheme),
    };
  }
  return ctx;
}
