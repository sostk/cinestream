import React from 'react';
import type { StyleProp } from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import { useAppTheme } from '@/theme/AppThemeProvider';

const logoDarkBg = require('../../assets/logo/dark.png');
const logoLightBg = require('../../assets/logo/light.png');

type Props = {
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
};

/** Brand mark — light logo on dark UI, dark logo on light UI. */
export function AppLogo({ width = 132, height = 34, style }: Props) {
  const { isDark } = useAppTheme();

  return (
    <Image
      source={isDark ? logoDarkBg : logoLightBg}
      style={[{ width, height }, style]}
      contentFit="contain"
      accessibilityLabel="CinePro"
    />
  );
}
