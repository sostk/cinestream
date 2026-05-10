import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type Props = {
  progress: number;
  bufferedProgress: number;
  disabled?: boolean;
  isTv?: boolean;
  previewBackdropUri?: string;
  duration: number;
  onSeekRatio: (ratio: number) => void;
  formatDuration: (sec: number) => string;
};

/** OTT-style seek bar with buffered lane, scrub thumb, and time + artwork preview while dragging. */
export const PlayerProgressBar = memo(function PlayerProgressBar({
  progress,
  bufferedProgress,
  disabled,
  isTv,
  previewBackdropUri,
  duration,
  onSeekRatio,
  formatDuration,
}: Props) {
  const barWidth = useRef(1);
  const dragging = useSharedValue(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  const seekFromX = useCallback(
    (x: number) => {
      if (!duration || barWidth.current <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / barWidth.current));
      onSeekRatio(ratio);
    },
    [duration, onSeekRatio]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !isTv,
        onMoveShouldSetPanResponder: (_, g) =>
          !disabled && !isTv && (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3),
        onPanResponderGrant: (e) => {
          dragging.value = 1;
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
          setScrubRatio(r);
          seekFromX(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => {
          const r = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
          setScrubRatio(r);
          seekFromX(e.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          dragging.value = 0;
          setScrubRatio(null);
        },
        onPanResponderTerminate: () => {
          dragging.value = 0;
          setScrubRatio(null);
        },
      }),
    [disabled, dragging, isTv, seekFromX]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(dragging.value ? 1.12 : 1, { damping: 14 }) }],
  }));

  const p = Math.max(0, Math.min(1, progress));
  const b = Math.max(0, Math.min(1, bufferedProgress));
  const previewTime = scrubRatio != null ? scrubRatio * duration : 0;

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidth.current = e.nativeEvent.layout.width;
  };

  const trackContent = (
    <View className="relative justify-center py-2">
      <View className="h-[6px] rounded-full bg-white/12 overflow-hidden">
        <View className="absolute left-0 top-0 bottom-0 bg-white/22 rounded-full" style={{ width: `${b * 100}%` }} />
        <View className="absolute left-0 top-0 bottom-0 rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          thumbStyle,
          {
            position: 'absolute',
            left: `${p * 100}%`,
            marginLeft: -10,
            top: '50%',
            marginTop: -10,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 3,
            borderColor: '#e50914',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 4,
            elevation: 6,
          },
        ]}
      />
    </View>
  );

  return (
    <View className="gap-2">
      {scrubRatio != null && !disabled ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(160)} className="items-center">
          <View className="rounded-2xl overflow-hidden border border-white/20 bg-black/50 h-[72px] w-[124px]">
            {previewBackdropUri ? (
              <Image source={{ uri: previewBackdropUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View className="flex-1 bg-white/8 items-center justify-center">
                <Text className="text-white/45 text-[11px] font-semibold">Scrub</Text>
              </View>
            )}
            <View className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 border border-white/15">
              <Text className="text-white text-[11px] font-bold tabular-nums">{formatDuration(previewTime)}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {isTv ? (
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Seek along timeline"
          className="h-11 justify-center"
          onLayout={onBarLayout}
          onPress={(e) => seekFromX(e.nativeEvent.locationX)}
        >
          <View pointerEvents="none">{trackContent}</View>
        </Pressable>
      ) : (
        <View className="h-11 justify-center" onLayout={onBarLayout} {...pan.panHandlers}>
          {trackContent}
        </View>
      )}
    </View>
  );
});
