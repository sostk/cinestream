import React, { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { MediaCardModel } from '@/components/MediaCard';
import { MediaCard } from '@/components/MediaCard';
import { SkeletonRow } from '@/components/SkeletonRow';

type Props = {
  title: string;
  /** Small uppercase label above the title (e.g. THIS WEEK) */
  eyebrow?: string;
  data: MediaCardModel[];
  posterW: number;
  posterH: number;
  isLoading?: boolean;
  onSelect: (item: MediaCardModel) => void;
};

export const MediaRow = memo(function MediaRow({
  title,
  eyebrow,
  data,
  posterW,
  posterH,
  isLoading,
  onSelect,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: MediaCardModel }) => (
      <View style={{ marginRight: 14 }}>
        <MediaCard
          item={item}
          width={posterW}
          height={posterH}
          onPress={() => onSelect(item)}
        />
      </View>
    ),
    [onSelect, posterH, posterW]
  );

  if (isLoading) {
    return <SkeletonRow title={title} eyebrow={eyebrow} cardW={posterW} cardH={posterH} />;
  }

  if (!data.length) return null;

  return (
    <View className="mb-7">
      <View className="px-4 mb-3">
        {eyebrow ? (
          <Text className="text-white/40 text-[11px] font-bold tracking-[0.2em] mb-1">{eyebrow}</Text>
        ) : null}
        <Text className="text-white text-xl font-bold tracking-tight">{title}</Text>
      </View>
      <FlashList
        horizontal
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        style={{ height: posterH + 8 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 2 }}
      />
    </View>
  );
});
