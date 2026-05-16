import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { ThemedBackButton } from '@/theme/themedPrimitives';

type Props = {
  backdropUri: string | null | undefined;
  heroHeight: number;
  horizontalPadding: number;
  onBack: () => void;
};

/**
 * Detail backdrop: image bleeds under the status bar; back control stays in the safe area.
 */
export function DetailBackdropHero({ backdropUri, heroHeight, horizontalPadding, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const bleedH = heroHeight + insets.top;

  const bottomFade = isDark
    ? (['transparent', 'rgba(7,8,13,0.5)', colors.ink] as const)
    : (['transparent', 'rgba(240,241,246,0.75)', colors.ink] as const);

  return (
    <View style={{ height: heroHeight, overflow: 'visible' }}>
      <Image
        source={backdropUri ? { uri: backdropUri } : undefined}
        style={{
          position: 'absolute',
          top: -insets.top,
          left: 0,
          right: 0,
          height: bleedH,
        }}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0.24)', 'transparent']}
        locations={[0, 0.55, 1]}
        style={{
          position: 'absolute',
          top: -insets.top,
          left: 0,
          right: 0,
          height: insets.top + 80,
        }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[...bottomFade]}
        locations={[0, 0.55, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.min(heroHeight * 0.62, 220),
        }}
        pointerEvents="none"
      />
      <View
        style={{
          position: 'absolute',
          left: horizontalPadding,
          top: insets.top + 10,
        }}
      >
        <ThemedBackButton variant="onMedia" onPress={onBack} />
      </View>
    </View>
  );
}
