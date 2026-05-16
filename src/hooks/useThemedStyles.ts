import { useMemo } from 'react';
import { useAppTheme } from '@/theme/AppThemeProvider';
import type { AppThemeColors } from '@/theme/colors';

export function useThemedStyles() {
  const { colors, isDark, mode } = useAppTheme();

  return useMemo(
    () => ({
      colors,
      isDark,
      mode,
      screen: { flex: 1 as const, backgroundColor: colors.ink },
      surface: { backgroundColor: colors.surface },
      card: {
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
      },
      input: {
        backgroundColor: colors.inputBg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        color: colors.text,
      },
      accentButton: {
        backgroundColor: colors.accent,
        borderRadius: 16,
      },
      secondaryButton: {
        backgroundColor: colors.inputBg,
        borderColor: colors.borderStrong,
        borderWidth: 1,
        borderRadius: 16,
      },
      chip: {
        backgroundColor: colors.inputBg,
        borderColor: colors.borderStrong,
        borderWidth: 1,
        borderRadius: 999,
      },
      chipActive: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: 999,
      },
      divider: { borderTopColor: colors.border, borderTopWidth: 1 },
      placeholder: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(11,12,18,0.38)',
      metaChip: {
        backgroundColor: colors.inputBg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      genreChip: {
        backgroundColor: colors.accentSoft,
        borderColor: colors.accentBorder,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      infoPanel: {
        backgroundColor: colors.inputBg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
      },
      skeletonBlock: {
        backgroundColor: colors.skeleton,
        borderRadius: 8,
      },
    }),
    [colors, isDark, mode]
  );
}

export type ThemedStyles = ReturnType<typeof useThemedStyles>;
