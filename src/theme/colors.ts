export type ThemeMode = 'light' | 'dark';

/** Primary brand red — use for CTAs, progress, focus, and highlights. */
export const BRAND_ACCENT = '#e50914';
export const BRAND_ACCENT_MUTED = '#ff5c66';

export type AppThemeColors = {
  ink: string;
  surface: string;
  elevated: string;
  card: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textOnAccent: string;
  border: string;
  borderStrong: string;
  inputBg: string;
  accent: string;
  accentMuted: string;
  accentSoft: string;
  accentBorder: string;
  skeleton: string;
  overlay: string;
  scrim: string;
  heroGradient: [string, string, string];
  posterGradient: [string, string];
  badgeBg: string;
  badgeText: string;
  shadow: string;
  success: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  gradientHero: [string, string, string];
  statusBar: 'light' | 'dark';
  switchTrackFalse: string;
  /** Semi-opaque chrome over video — readable in light & dark app themes */
  playerHud: string;
  playerHudBorder: string;
  playerHudText: string;
  playerHudMuted: string;
};

export const darkTheme: AppThemeColors = {
  ink: '#07080d',
  surface: '#0f111a',
  elevated: '#161929',
  card: '#12131c',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.58)',
  textFaint: 'rgba(255,255,255,0.4)',
  textOnAccent: '#ffffff',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.16)',
  inputBg: 'rgba(255,255,255,0.1)',
  accent: BRAND_ACCENT,
  accentMuted: BRAND_ACCENT_MUTED,
  accentSoft: 'rgba(229,9,20,0.2)',
  accentBorder: 'rgba(229,9,20,0.45)',
  skeleton: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.65)',
  scrim: 'rgba(7,8,13,0.92)',
  heroGradient: ['rgba(7,8,13,0.2)', 'rgba(7,8,13,0.55)', 'rgba(7,8,13,0.95)'],
  posterGradient: ['transparent', 'rgba(7,8,13,0.9)'],
  badgeBg: 'rgba(0,0,0,0.55)',
  badgeText: '#ffffff',
  shadow: '#000000',
  success: '#34d399',
  warning: '#fbbf24',
  warningSoft: 'rgba(251,191,36,0.12)',
  warningBorder: 'rgba(251,191,36,0.3)',
  gradientHero: ['#161929', '#07080d', '#07080d'],
  statusBar: 'light',
  switchTrackFalse: 'rgba(255,255,255,0.2)',
  playerHud: 'rgba(11,12,18,0.88)',
  playerHudBorder: 'rgba(255,255,255,0.16)',
  playerHudText: '#ffffff',
  playerHudMuted: 'rgba(255,255,255,0.55)',
};

export const lightTheme: AppThemeColors = {
  ink: '#f0f1f6',
  surface: '#ffffff',
  elevated: '#e4e7f0',
  card: '#ffffff',
  text: '#0b0c12',
  textMuted: 'rgba(11,12,18,0.62)',
  textFaint: 'rgba(11,12,18,0.42)',
  textOnAccent: '#ffffff',
  border: 'rgba(11,12,18,0.1)',
  borderStrong: 'rgba(11,12,18,0.16)',
  inputBg: 'rgba(11,12,18,0.05)',
  accent: BRAND_ACCENT,
  accentMuted: BRAND_ACCENT_MUTED,
  accentSoft: 'rgba(229,9,20,0.1)',
  accentBorder: 'rgba(229,9,20,0.35)',
  skeleton: 'rgba(11,12,18,0.07)',
  overlay: 'rgba(11,12,18,0.45)',
  scrim: 'rgba(240,241,246,0.94)',
  heroGradient: ['rgba(240,241,246,0.15)', 'rgba(240,241,246,0.55)', 'rgba(240,241,246,0.96)'],
  posterGradient: ['transparent', 'rgba(240,241,246,0.95)'],
  badgeBg: 'rgba(255,255,255,0.92)',
  badgeText: '#0b0c12',
  shadow: 'rgba(11,12,18,0.12)',
  success: '#059669',
  warning: '#d97706',
  warningSoft: 'rgba(217,119,6,0.12)',
  warningBorder: 'rgba(217,119,6,0.28)',
  gradientHero: ['#eef0f8', '#f0f1f6', '#f0f1f6'],
  statusBar: 'dark',
  switchTrackFalse: 'rgba(11,12,18,0.18)',
  playerHud: 'rgba(11,12,18,0.9)',
  playerHudBorder: 'rgba(255,255,255,0.14)',
  playerHudText: '#ffffff',
  playerHudMuted: 'rgba(255,255,255,0.6)',
};

export function themeColorsFor(mode: ThemeMode): AppThemeColors {
  return mode === 'light' ? lightTheme : darkTheme;
}
