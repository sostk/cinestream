import React from 'react';
import { Text, View } from 'react-native';
import { FocusSurface } from '@/tv/FocusSurface';
import Ionicons from '@expo/vector-icons/Ionicons';

type Props = {
  onOpenSettings?: () => void;
};

export function MissingKeysBanner({ onOpenSettings }: Props) {
  return (
    <View className="mx-4 mb-5 rounded-3xl overflow-hidden border border-amber-500/30 bg-[#12131c]">
      <View className="p-4 flex-row gap-3">
        <View className="w-11 h-11 rounded-2xl bg-amber-500/15 items-center justify-center border border-amber-500/25">
          <Ionicons name="key-outline" color="#fbbf24" size={22} />
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-base">TMDB API key missing</Text>
          <Text className="text-white/65 text-sm mt-1.5 leading-5">
            Add EXPO_PUBLIC_TMDB_API_KEY to your .env and restart Metro. TMDB powers the catalog; CinePro Core handles
            streams (OMSS).
          </Text>
          {onOpenSettings ? (
            <FocusSurface
              className="mt-4 self-start rounded-xl bg-accent px-5 py-2.5 flex-row items-center gap-2"
              onPress={onOpenSettings}
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" color="#fff" size={18} />
              <Text className="text-white font-bold text-sm">Open settings</Text>
            </FocusSurface>
          ) : null}
        </View>
      </View>
    </View>
  );
}
