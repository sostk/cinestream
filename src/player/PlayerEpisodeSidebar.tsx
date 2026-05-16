import React, { useCallback } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { TmdbEpisode } from '@/api/types/tmdb';
import { FocusSurface } from '@/tv/FocusSurface';
import { tmdbImg } from '@/services/tmdbImages';

type Props = {
  visible: boolean;
  onClose: () => void;
  seasonLabel: string;
  showTitle?: string;
  episodes: TmdbEpisode[];
  currentEpisode?: number;
  resumeByEpisode?: Record<number, number>;
  loading?: boolean;
  onSelectEpisode: (episodeNumber: number, episodeTitle: string) => void;
};

export function PlayerEpisodeSidebar({
  visible,
  onClose,
  seasonLabel,
  showTitle,
  episodes,
  currentEpisode,
  resumeByEpisode,
  loading,
  onSelectEpisode,
}: Props) {
  const insets = useSafeAreaInsets();

  const renderItem = useCallback(
    ({ item }: { item: TmdbEpisode }) => {
      const active = item.episode_number === currentEpisode;
      const resumeSec = resumeByEpisode?.[item.episode_number];
      const thumb = tmdbImg(item.still_path, 'w342');

      return (
        <FocusSurface
          className={`mx-3 mb-2.5 rounded-2xl overflow-hidden border ${
            active ? 'bg-accent/20 border-accent' : 'bg-white/8 border-white/12 active:bg-white/14'
          }`}
          onPress={() => onSelectEpisode(item.episode_number, item.name)}
          accessibilityLabel={`Episode ${item.episode_number} ${item.name}`}
          accessibilityState={{ selected: active }}
        >
          <View className="flex-row items-center gap-3 p-2.5">
            <View className="w-[88px] h-[50px] rounded-xl overflow-hidden bg-white/10">
              {thumb ? (
                <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-white/40 text-xs font-bold">E{item.episode_number}</Text>
                </View>
              )}
            </View>
            <View className="flex-1 min-w-0 gap-0.5">
              <Text
                className={`font-bold text-[14px] ${active ? 'text-accent' : 'text-white'}`}
                numberOfLines={2}
              >
                {item.episode_number}. {item.name}
              </Text>
              {resumeSec != null && resumeSec > 30 ? (
                <Text className="text-accent/80 text-[11px] font-semibold">Resume</Text>
              ) : null}
            </View>
            {active ? <Ionicons name="play-circle" color="#e50914" size={22} /> : null}
          </View>
        </FocusSurface>
      );
    },
    [currentEpisode, onSelectEpisode, resumeByEpisode]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 flex-row">
        <Pressable className="flex-1 bg-black/65" onPress={onClose} accessibilityLabel="Close episode list" />
        <View
          className="h-full bg-[#0b0c12] border-l border-white/14"
          style={{
            width: '84%',
            maxWidth: 400,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View className="px-4 pb-3 flex-row items-center gap-3 border-b border-white/10">
            <FocusSurface
              className="rounded-full bg-white/12 border border-white/14 p-2.5 active:bg-white/20"
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" color="#fff" size={22} />
            </FocusSurface>
            <View className="flex-1 min-w-0">
              <Text className="text-white/50 text-[11px] font-bold uppercase tracking-wider" numberOfLines={1}>
                {showTitle ?? 'Series'}
              </Text>
              <Text className="text-white text-lg font-bold" numberOfLines={2}>
                {seasonLabel}
              </Text>
            </View>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator color="#e50914" size="large" />
              <Text className="text-white/50 text-sm">Loading episodes…</Text>
            </View>
          ) : (
            <FlashList
              data={episodes}
              renderItem={renderItem}
              keyExtractor={(e) => String(e.id)}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
              ListEmptyComponent={
                <Text className="text-white/45 text-center px-6 py-8 text-sm">No episodes in this season.</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
