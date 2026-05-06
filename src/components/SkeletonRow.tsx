import React, { memo } from 'react';
import { View, Text } from 'react-native';

type Props = {
  title: string;
  eyebrow?: string;
  cardW: number;
  cardH: number;
};

export const SkeletonRow = memo(function SkeletonRow({ title, eyebrow, cardW, cardH }: Props) {
  const placeholders = Array.from({ length: 8 });
  return (
    <View className="mb-7">
      <View className="px-4 mb-3">
        {eyebrow ? (
          <Text className="text-white/25 text-[11px] font-bold tracking-[0.2em] mb-1">{eyebrow}</Text>
        ) : null}
        <Text className="text-white/35 text-xl font-bold">{title}</Text>
      </View>
      <View className="flex-row px-4 gap-3">
        {placeholders.map((_, i) => (
          <View
            key={i}
            style={{ width: cardW, height: cardH }}
            className="rounded-2xl bg-white/[0.08] border border-white/[0.06]"
          />
        ))}
      </View>
    </View>
  );
});
