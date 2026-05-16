import React from 'react';
import { Text, View } from 'react-native';
import { FocusSurface } from '@/tv/FocusSurface';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme/AppThemeProvider';

type Props = {
  onOpenSettings?: () => void;
};

export function MissingKeysBanner({ onOpenSettings }: Props) {
  const { colors } = useAppTheme();

  return (
    <View
      className="mx-4 mb-5 rounded-3xl overflow-hidden border"
      style={{
        borderColor: colors.warningBorder,
        backgroundColor: colors.card,
      }}
    >
      <View className="p-4 flex-row gap-3">
        <View
          className="w-11 h-11 rounded-2xl items-center justify-center border"
          style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningBorder }}
        >
          <Ionicons name="key-outline" color={colors.warning} size={22} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-base" style={{ color: colors.text }}>
            TMDB API key missing
          </Text>
          <Text className="text-sm mt-1.5 leading-5" style={{ color: colors.textMuted }}>
            Open Settings and paste your TMDB API v3 key (stored on this device). You can also re-run setup from
            Settings.
          </Text>
          {onOpenSettings ? (
            <FocusSurface
              className="mt-4 self-start rounded-xl px-5 py-2.5 flex-row items-center gap-2"
              style={{ backgroundColor: colors.accent }}
              onPress={onOpenSettings}
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" color={colors.textOnAccent} size={18} />
              <Text className="font-bold text-sm" style={{ color: colors.textOnAccent }}>
                Open settings
              </Text>
            </FocusSurface>
          ) : null}
        </View>
      </View>
    </View>
  );
}
