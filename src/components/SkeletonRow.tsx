import React, { memo } from 'react';
import { View } from 'react-native';
import { SectionHeader } from '@/theme/themedPrimitives';
import { useAppTheme } from '@/theme/AppThemeProvider';

type Props = {
  title: string;
  eyebrow?: string;
  cardW: number;
  cardH: number;
};

export const SkeletonRow = memo(function SkeletonRow({ title, eyebrow, cardW, cardH }: Props) {
  const { colors } = useAppTheme();
  const placeholders = Array.from({ length: 8 });
  return (
    <View className="mb-7">
      <View className="px-4">
        <SectionHeader title={title} eyebrow={eyebrow} />
      </View>
      <View className="flex-row px-4 gap-3">
        {placeholders.map((_, i) => (
          <View
            key={i}
            style={{
              width: cardW,
              height: cardH,
              borderRadius: 16,
              backgroundColor: colors.skeleton,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
});
