import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Video, { SelectedTrackType, TextTrackType } from 'react-native-video';
import type { VideoRef, TextTracks } from 'react-native-video';
import { useKeepAwake } from 'expo-keep-awake';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { CineProApi } from '@/api/cineproClient';
import { qk } from '@/api/queryKeys';
import {
  pickAutoSource,
  resolveProxyUrl,
  sortSourcesByQualityDesc,
  isPlayableType,
} from '@/utils/stream';
import { useSettingsStore } from '@/store/settingsStore';
import {
  useLibraryStore,
  mediaStorageKey,
  type ContinuePlayback,
} from '@/store/libraryStore';
import { FocusSurface } from '@/tv/FocusSurface';
import { useAndroidTVBack } from '@/hooks/useAndroidTVBack';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import Ionicons from '@expo/vector-icons/Ionicons';

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export function PlayerScreen() {
  useKeepAwake();
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const params = route.params;
  const insets = useSafeAreaInsets();

  const videoRef = useRef<VideoRef>(null);
  const progressBarWidth = useRef(1);
  const hudHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoQuality = useSettingsStore((s) => s.autoQuality);
  const defaultRate = useSettingsStore((s) => s.defaultPlaybackRate);
  const cineproBaseUrl = useSettingsStore((s) => s.cineproBaseUrl);

  const omss = useQuery({
    queryKey:
      params.mediaType === 'movie'
        ? qk.movieSources(params.tmdbId)
        : qk.tvSources(params.tmdbId, params.season ?? 1, params.episode ?? 1),
    queryFn: () =>
      params.mediaType === 'movie'
        ? CineProApi.movieSources(params.tmdbId)
        : CineProApi.tvEpisodeSources({
            tmdbShowId: params.tmdbId,
            season: params.season ?? 1,
            episode: params.episode ?? 1,
          }),
    enabled: !!cineproBaseUrl.trim(),
    retry: (c, err: unknown) => {
      const status =
        typeof err === 'object' && err && 'status' in err ? (err as { status?: number }).status : undefined;
      if (status === 404) return false;
      return c < 2;
    },
  });

  const sorted = useMemo(() => {
    const list = omss.data?.sources ?? [];
    return sortSourcesByQualityDesc(list.filter((s) => isPlayableType(s.type)));
  }, [omss.data?.sources]);

  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    if (!sorted.length) return;
    if (autoQuality) {
      const bestIdx = sorted.findIndex((s) => s === pickAutoSource(sorted));
      setSourceIndex(bestIdx >= 0 ? bestIdx : 0);
    } else {
      setSourceIndex(0);
    }
  }, [autoQuality, sorted]);

  const activeSource = sorted[sourceIndex];

  const textTracks = useMemo(() => {
    const subs = omss.data?.subtitles ?? [];
    return subs.map((s) => ({
      title: `${s.label} (${s.format})`,
      language: 'en',
      type: TextTrackType.VTT,
      uri: resolveProxyUrl(s.url),
    })) as TextTracks;
  }, [omss.data?.subtitles]);

  const [subtitleTrack, setSubtitleTrack] = useState<number>(-1);
  const [rate, setRate] = useState(defaultRate);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [position, setPosition] = useState(0);
  const [playableDuration, setPlayableDuration] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hud, setHud] = useState(Platform.isTV);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captionsExpanded, setCaptionsExpanded] = useState(false);
  const [streamExpanded, setStreamExpanded] = useState(false);
  const upsertContinue = useLibraryStore((s) => s.upsertContinue);

  const mediaKey = useMemo(
    () =>
      mediaStorageKey({
        mediaType: params.mediaType,
        tmdbId: params.tmdbId,
        season: params.season,
        episode: params.episode,
      }),
    [params.episode, params.mediaType, params.season, params.tmdbId]
  );

  const introEnd = useLibraryStore(
    (s) => s.continueWatching.find((c) => c.mediaKey === mediaKey)?.introSkipEndSec ?? null
  );

  const persistTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const persistProgress = useCallback(() => {
    if (!duration) return;
    const row: ContinuePlayback = {
      mediaKey,
      mediaType: params.mediaType,
      tmdbId: params.tmdbId,
      title: params.title,
      posterPath: params.posterPath,
      backdropPath: params.backdropPath,
      season: params.season,
      episode: params.episode,
      episodeTitle: params.episodeTitle,
      positionSec: position,
      durationSec: duration,
      updatedAt: Date.now(),
      introSkipEndSec: introEnd ?? undefined,
    };
    upsertContinue(row);
  }, [
    duration,
    introEnd,
    mediaKey,
    params.backdropPath,
    params.episode,
    params.episodeTitle,
    params.mediaType,
    params.posterPath,
    params.season,
    params.title,
    params.tmdbId,
    position,
    upsertContinue,
  ]);

  useEffect(() => {
    persistTimer.current = setInterval(persistProgress, 9000);
    return () => {
      if (persistTimer.current) clearInterval(persistTimer.current);
      persistProgress();
    };
  }, [persistProgress]);

  const clearHudTimer = useCallback(() => {
    if (hudHideTimer.current) {
      clearTimeout(hudHideTimer.current);
      hudHideTimer.current = null;
    }
  }, []);

  const scheduleHudHide = useCallback(() => {
    clearHudTimer();
    if (Platform.isTV || settingsOpen || paused) return;
    hudHideTimer.current = setTimeout(() => setHud(false), 5500);
  }, [clearHudTimer, paused, settingsOpen]);

  useEffect(() => {
    if (!hud || Platform.isTV || settingsOpen || paused) {
      clearHudTimer();
      return;
    }
    scheduleHudHide();
    return clearHudTimer;
  }, [hud, paused, scheduleHudHide, settingsOpen, clearHudTimer]);

  useAndroidTVBack(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    navigation.goBack();
    return true;
  });

  useEffect(() => {
    if (!settingsOpen) {
      setCaptionsExpanded(false);
      setStreamExpanded(false);
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!params.next) return;
    if (!duration) return;
    const left = duration - position;
    if (left > 22 || left < 0) return;
    const id = setTimeout(() => {
      const n = params.next!;
      navigation.replace('Player', {
        title: `${n.showTitle ?? ''} · ${n.episodeTitle ?? `Episode ${n.episode}`}`,
        mediaType: 'tv',
        tmdbId: n.tmdbId,
        season: n.season,
        episode: n.episode,
        episodeTitle: n.episodeTitle,
        posterPath: n.posterPath,
        backdropPath: n.backdropPath,
      });
    }, 11000);
    return () => clearTimeout(id);
  }, [duration, navigation, params.next, position]);

  const seekTo = useCallback((seconds: number) => {
    const ref = videoRef.current;
    if (!ref || !duration) return;
    const next = Math.max(0, Math.min(duration, seconds));
    ref.seek(next);
    setPosition(next);
  }, [duration]);

  const seekBy = useCallback(
    (delta: number) => {
      seekTo(position + delta);
    },
    [position, seekTo]
  );

  const seekFromProgressTap = useCallback(
    (locationX: number) => {
      if (!duration || progressBarWidth.current <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
      seekTo(ratio * duration);
    },
    [duration, seekTo]
  );

  const progressPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !Platform.isTV,
        onMoveShouldSetPanResponder: (_, g) =>
          !Platform.isTV && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderGrant: (e) => seekFromProgressTap(e.nativeEvent.locationX),
        onPanResponderMove: (e) => seekFromProgressTap(e.nativeEvent.locationX),
      }),
    [seekFromProgressTap]
  );

  const togglePlayback = useCallback(() => {
    setPaused((p) => !p);
    if (!Platform.isTV) scheduleHudHide();
  }, [scheduleHudHide]);

  const uri = activeSource ? resolveProxyUrl(activeSource.url) : '';

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const bufferedProgress =
    duration > 0 ? Math.min(1, Math.max(0, playableDuration / duration)) : 0;

  const chromeBottomPad = Math.max(insets.bottom, 16);
  const chromeTopPad = Math.max(insets.top, 10);

  const pillBtn =
    'rounded-2xl px-4 py-3.5 bg-white/12 border border-white/18 active:bg-white/22';
  const iconRound =
    'rounded-full w-11 h-11 items-center justify-center bg-black/40 border border-white/20 active:bg-white/15';

  const openSettings = () => {
    setSettingsOpen(true);
    clearHudTimer();
  };

  const captionSettingsSummary =
    subtitleTrack < 0 ? 'Off' : textTracks[subtitleTrack]?.title ?? 'On';

  const streamSettingsSummary =
    sorted.length === 0
      ? 'None available'
      : sorted[sourceIndex]
        ? `${sorted[sourceIndex].quality} · ${sorted[sourceIndex].provider.name}`
        : `${sorted[0].quality} · ${sorted[0].provider.name}`;

  return (
    <View className="flex-1 bg-black">
      <Pressable
        className="flex-1"
        onPress={() => {
          if (settingsOpen) return;
          setHud((h) => !h);
        }}
      >
        {uri ? (
          <Video
            ref={videoRef}
            source={{ uri }}
            style={{ flex: 1 }}
            resizeMode="contain"
            paused={paused}
            rate={rate}
            progressUpdateInterval={400}
            onLoad={(data) => {
              setDuration(data.duration);
              setPlayableDuration(0);
              setBuffering(false);
              const start = params.resumeSec ?? 0;
              if (start > 3) {
                videoRef.current?.seek(start);
                setPosition(start);
              }
            }}
            onProgress={(ev) => {
              setPosition(ev.currentTime);
              setPlayableDuration(ev.playableDuration ?? 0);
            }}
            onBuffer={(ev) => setBuffering(ev.isBuffering)}
            textTracks={textTracks}
            selectedTextTrack={
              subtitleTrack >= 0
                ? { type: SelectedTrackType.INDEX, value: subtitleTrack }
                : { type: SelectedTrackType.DISABLED }
            }
            preventsDisplaySleepDuringVideoPlayback
            renderLoader={() => (
              <View className="absolute inset-0 items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            )}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-10 gap-5">
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(0,0,0,0)']}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: '55%',
                opacity: 0.85,
              }}
            />
            <View className="w-[88px] h-[88px] rounded-full bg-white/8 border border-white/15 items-center justify-center">
              <Ionicons
                name={omss.isLoading ? 'hourglass-outline' : omss.isError ? 'alert-circle-outline' : 'film-outline'}
                color="rgba(255,255,255,0.85)"
                size={40}
              />
            </View>
            <View className="items-center gap-2">
              <Text className="text-white text-center text-xl font-bold tracking-tight">
                {omss.isLoading
                  ? 'Preparing playback'
                  : omss.isError
                    ? 'Could not load sources'
                    : 'Nothing to play'}
              </Text>
              <Text className="text-white/55 text-center text-[15px] leading-[22px] max-w-[320px]">
                {omss.isLoading
                  ? 'Hang tight while we find streams for this title.'
                  : omss.isError
                    ? 'Check your Core connection or try again in a moment.'
                    : 'There are no playable streams for this title right now.'}
              </Text>
            </View>
            {!omss.isLoading ? (
              <Pressable
                onPress={() => omss.refetch()}
                className="rounded-full bg-accent px-8 py-3.5 active:opacity-90 shadow-lg"
                accessibilityLabel="Retry loading streams"
              >
                <Text className="text-white font-bold text-[15px]">Try again</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {buffering && uri ? (
          <View className="absolute inset-0 items-center justify-center pointer-events-none">
            <BlurView intensity={22} tint="dark" className="rounded-3xl overflow-hidden border border-white/12 px-8 py-6">
              <View className="flex-row items-center gap-4">
                <ActivityIndicator size="large" color="#fff" />
                <Text className="text-white/90 text-[15px] font-semibold">Buffering…</Text>
              </View>
            </BlurView>
          </View>
        ) : null}

        {!Platform.isTV && hud && paused ? (
          <Pressable
            className="absolute inset-0 items-center justify-center"
            onPress={() => setPaused(false)}
            accessibilityLabel="Play"
          >
            <View className="w-[92px] h-[92px] rounded-full bg-black/60 border-2 border-white/35 items-center justify-center shadow-2xl">
              <View className="absolute inset-2 rounded-full border border-white/10" pointerEvents="none" />
              <Ionicons name="play" color="#fff" size={46} style={{ marginLeft: 6 }} />
            </View>
          </Pressable>
        ) : null}

        {hud ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.72)', 'transparent']}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 140,
              }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.94)']}
              locations={[0, 0.45, 1]}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 320,
              }}
            />

            <View
              style={{ paddingTop: chromeTopPad, paddingHorizontal: 18 }}
              className="absolute left-0 right-0 top-0 flex-row items-center gap-3"
            >
              <FocusSurface
                className={iconRound}
                onPress={() => navigation.goBack()}
                accessibilityLabel="Close player"
              >
                <Ionicons name="chevron-down" color="#fff" size={26} />
              </FocusSurface>
              <View className="flex-1 rounded-2xl bg-black/35 border border-white/10 px-3 py-2.5">
                <Text className="text-white font-semibold text-[16px] leading-[22px]" numberOfLines={2}>
                  {params.title}
                </Text>
                {activeSource ? (
                  <Text className="text-white/50 text-[11px] mt-1 font-medium" numberOfLines={1}>
                    {activeSource.quality.toUpperCase()} · {activeSource.type.toUpperCase()} ·{' '}
                    {activeSource.provider.name}
                  </Text>
                ) : null}
              </View>
              <FocusSurface className={iconRound} onPress={openSettings} accessibilityLabel="Playback settings">
                <Ionicons name="settings-outline" color="#fff" size={21} />
              </FocusSurface>
            </View>

            <View
              style={{ paddingBottom: chromeBottomPad, paddingHorizontal: 18 }}
              className="absolute left-0 right-0 bottom-0 gap-3"
            >
              {introEnd != null && introEnd > 0 && position < introEnd ? (
                <FocusSurface
                  className="self-center flex-row items-center gap-2 rounded-full bg-accent pl-5 pr-6 py-3.5 shadow-lg border border-white/15"
                  onPress={() => seekTo(introEnd)}
                  accessibilityLabel="Skip intro"
                >
                  <Ionicons name="play-forward" color="#fff" size={18} />
                  <Text className="text-white font-bold text-[13px] tracking-wide">Skip intro</Text>
                </FocusSurface>
              ) : null}

              <View className="gap-3">
                <View className="flex-row justify-between items-baseline">
                  <Text className="text-white text-sm font-semibold tabular-nums">{formatDuration(position)}</Text>
                  <Text className="text-white/45 text-xs tabular-nums font-medium">
                    −{formatDuration(Math.max(0, duration - position))}
                  </Text>
                </View>
                {Platform.isTV ? (
                  <Pressable
                    onLayout={(e) => {
                      progressBarWidth.current = e.nativeEvent.layout.width;
                    }}
                    onPress={(e) => seekFromProgressTap(e.nativeEvent.locationX)}
                    className="h-11 justify-center"
                    accessibilityLabel="Seek along timeline"
                    accessibilityRole="adjustable"
                  >
                    <PlayerProgressTrack progress={progress} bufferedProgress={bufferedProgress} />
                  </Pressable>
                ) : (
                  <View
                    onLayout={(e) => {
                      progressBarWidth.current = e.nativeEvent.layout.width;
                    }}
                    {...progressPanResponder.panHandlers}
                    className="h-11 justify-center"
                    accessibilityLabel="Seek — drag or tap the timeline"
                    accessibilityRole="adjustable"
                  >
                    <PlayerProgressTrack progress={progress} bufferedProgress={bufferedProgress} />
                  </View>
                )}
                {!Platform.isTV ? (
                  <Text className="text-center text-white/35 text-[11px] -mt-1">Tap or drag to seek</Text>
                ) : null}
              </View>

              <BlurView intensity={56} tint="dark" className="rounded-[26px] overflow-hidden border border-white/14">
                <View className="px-3 pt-4 pb-4 gap-4 bg-black/30">
                  <View className="flex-row items-center justify-between px-0.5 gap-1">
                    <FocusSurface
                      className="rounded-full min-w-[44px] h-11 px-2 items-center justify-center bg-white/10 border border-white/14"
                      onPress={() => seekBy(-30)}
                      accessibilityLabel="Back 30 seconds"
                    >
                      <Text className="text-white text-[11px] font-bold">−30s</Text>
                    </FocusSurface>
                    <FocusSurface
                      className="rounded-full w-[54px] h-[54px] items-center justify-center bg-white/14 border border-white/18"
                      onPress={() => seekBy(-10)}
                      accessibilityLabel="Back 10 seconds"
                    >
                      <View className="items-center">
                        <Ionicons name="play-back" color="#fff" size={24} />
                        <Text className="text-white text-[10px] font-bold mt-px">10</Text>
                      </View>
                    </FocusSurface>

                    <FocusSurface
                      className="rounded-full w-[76px] h-[76px] items-center justify-center bg-white border-2 border-accent/40 shadow-xl shadow-black/40"
                      onPress={togglePlayback}
                      accessibilityLabel={paused ? 'Play' : 'Pause'}
                    >
                      <Ionicons
                        name={paused ? 'play' : 'pause'}
                        color="#0a0b10"
                        size={38}
                        style={paused ? { marginLeft: 5 } : undefined}
                      />
                    </FocusSurface>

                    <FocusSurface
                      className="rounded-full w-[54px] h-[54px] items-center justify-center bg-white/14 border border-white/18"
                      onPress={() => seekBy(10)}
                      accessibilityLabel="Forward 10 seconds"
                    >
                      <View className="items-center">
                        <Ionicons name="play-forward" color="#fff" size={24} />
                        <Text className="text-white text-[10px] font-bold mt-px">10</Text>
                      </View>
                    </FocusSurface>

                    <FocusSurface
                      className="rounded-full min-w-[44px] h-11 px-2 items-center justify-center bg-white/10 border border-white/14"
                      onPress={() => seekBy(30)}
                      accessibilityLabel="Forward 30 seconds"
                    >
                      <Text className="text-white text-[11px] font-bold">+30s</Text>
                    </FocusSurface>
                  </View>

                  <View className="flex-row flex-wrap justify-center gap-2.5 px-1">
                    <FocusSurface
                      className={`${pillBtn} flex-row items-center gap-2`}
                      onPress={() =>
                        setSubtitleTrack((v) => {
                          if (!textTracks.length) return -1;
                          if (v < 0) return 0;
                          if (v >= textTracks.length - 1) return -1;
                          return v + 1;
                        })
                      }
                      accessibilityLabel="Subtitles"
                    >
                      <Ionicons name="text-outline" color="#fff" size={18} />
                      <Text className="text-white text-[13px] font-semibold" numberOfLines={1}>
                        {subtitleTrack < 0 ? 'Captions off' : textTracks[subtitleTrack]?.title ?? 'Captions'}
                      </Text>
                    </FocusSurface>
                    <FocusSurface
                      className={`${pillBtn} flex-row items-center gap-2`}
                      onPress={openSettings}
                      accessibilityLabel="Quality and speed"
                    >
                      <Ionicons name="options-outline" color="#fff" size={18} />
                      <Text className="text-white text-[13px] font-semibold">
                        {rate}x · {activeSource?.quality ?? 'Auto'}
                      </Text>
                    </FocusSurface>
                  </View>

                  {params.next && duration - position < 28 ? (
                    <View className="flex-row items-center justify-center gap-2 px-2 py-2 rounded-xl bg-white/6 border border-white/8">
                      <Ionicons name="play-skip-forward-outline" color="rgba(255,255,255,0.75)" size={16} />
                      <Text className="text-center text-white/75 text-[12px] leading-[18px]">
                        Next episode starts automatically soon.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </BlurView>
            </View>
          </>
        ) : null}
      </Pressable>

      <Modal
        visible={settingsOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/75" onPress={() => setSettingsOpen(false)} />
          <View
            className="mx-3 rounded-[28px] overflow-hidden border border-white/16 bg-[#0e0f14] max-h-[78%] shadow-2xl"
            style={{ marginBottom: Math.max(insets.bottom, 12) }}
          >
            <View className="items-center pt-3 pb-2">
              <View className="w-12 h-1 rounded-full bg-white/35" />
            </View>
            <View className="px-5 pb-3 flex-row items-center justify-between border-b border-white/10">
              <View className="flex-row items-center gap-3 flex-1">
                <View className="w-10 h-10 rounded-2xl bg-accent/20 items-center justify-center border border-accent/25">
                  <Ionicons name="options-outline" color="#fff" size={22} />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xl font-bold">Playback</Text>
                  <Text className="text-white/45 text-xs mt-0.5">Speed, captions & stream quality</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setSettingsOpen(false)}
                className="rounded-full bg-white/14 p-2.5 border border-white/12 active:bg-white/22"
                accessibilityLabel="Close settings"
              >
                <Ionicons name="close" color="#fff" size={22} />
              </Pressable>
            </View>
            <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="speedometer-outline" color="rgba(255,255,255,0.45)" size={17} />
                <Text className="text-white/45 text-[11px] uppercase tracking-widest font-bold">Speed</Text>
              </View>
              <View className="flex-row flex-wrap gap-2 mb-7">
                {RATES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRate(r)}
                    className={`rounded-2xl px-5 py-3.5 border min-w-[72px] items-center ${
                      rate === r ? 'bg-accent border-accent' : 'bg-white/8 border-white/12 active:bg-white/14'
                    }`}
                  >
                    <Text className="text-white font-bold text-[15px]">{r}x</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => setCaptionsExpanded((v) => !v)}
                className={`rounded-2xl px-4 py-3.5 border border-white/14 bg-white/6 flex-row items-center justify-between active:bg-white/12 ${captionsExpanded ? 'mb-2' : 'mb-7'}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: captionsExpanded }}
                accessibilityLabel="Captions options"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <Ionicons name="text-outline" color="rgba(255,255,255,0.55)" size={20} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-white/45 text-[11px] uppercase tracking-widest font-bold">Captions</Text>
                    <Text className="text-white font-semibold text-[15px] mt-0.5" numberOfLines={1}>
                      {captionSettingsSummary}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={captionsExpanded ? 'chevron-up' : 'chevron-down'}
                  color="rgba(255,255,255,0.55)"
                  size={22}
                />
              </Pressable>
              {captionsExpanded ? (
                <View className="mb-7">
                  <Pressable
                    onPress={() => setSubtitleTrack(-1)}
                    className={`rounded-2xl px-4 py-3.5 mb-2 border flex-row items-center justify-between ${
                      subtitleTrack < 0 ? 'bg-accent/95 border-accent' : 'bg-white/8 border-white/12 active:bg-white/14'
                    }`}
                  >
                    <Text className="text-white font-semibold text-[15px]">Off</Text>
                    {subtitleTrack < 0 ? <Ionicons name="checkmark-circle" color="#fff" size={22} /> : null}
                  </Pressable>
                  {textTracks.map((t, idx) => (
                    <Pressable
                      key={`${t.title}-${idx}`}
                      onPress={() => setSubtitleTrack(idx)}
                      className={`rounded-2xl px-4 py-3.5 mb-2 border flex-row items-center justify-between gap-3 ${
                        subtitleTrack === idx ? 'bg-accent/95 border-accent' : 'bg-white/8 border-white/12 active:bg-white/14'
                      }`}
                    >
                      <Text className="text-white font-medium text-[15px] flex-1" numberOfLines={2}>
                        {t.title}
                      </Text>
                      {subtitleTrack === idx ? <Ionicons name="checkmark-circle" color="#fff" size={22} /> : null}
                    </Pressable>
                  ))}
                  {!textTracks.length ? (
                    <Text className="text-white/40 text-sm leading-5">
                      No caption tracks were reported for this stream.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Pressable
                onPress={() => setStreamExpanded((v) => !v)}
                className={`rounded-2xl px-4 py-3.5 border border-white/14 bg-white/6 flex-row items-center justify-between active:bg-white/12 ${streamExpanded ? 'mb-2' : 'mb-7'}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: streamExpanded }}
                accessibilityLabel="Stream and server options"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <Ionicons name="server-outline" color="rgba(255,255,255,0.55)" size={20} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-white/45 text-[11px] uppercase tracking-widest font-bold">Stream source</Text>
                    <Text className="text-white font-semibold text-[15px] mt-0.5" numberOfLines={2}>
                      {streamSettingsSummary}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={streamExpanded ? 'chevron-up' : 'chevron-down'}
                  color="rgba(255,255,255,0.55)"
                  size={22}
                />
              </Pressable>
              {streamExpanded ? (
                <View className="mb-7">
                  {!sorted.length ? (
                    <Text className="text-white/40 text-sm leading-5 mb-2">No alternate qualities or servers available.</Text>
                  ) : null}
                  {sorted.map((s, idx) => (
                    <Pressable
                      key={`${s.provider.id}-${idx}-${s.quality}`}
                      onPress={() => setSourceIndex(idx)}
                      className={`rounded-2xl px-4 py-3.5 mb-2 border flex-row items-center justify-between gap-3 ${
                        idx === sourceIndex ? 'bg-accent/95 border-accent' : 'bg-white/8 border-white/12 active:bg-white/14'
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-white font-bold text-[15px]">
                          {s.quality} · {s.type.toUpperCase()}
                        </Text>
                        <Text className="text-white/50 text-xs mt-1">{s.provider.name}</Text>
                      </View>
                      {idx === sourceIndex ? <Ionicons name="checkmark-circle" color="#fff" size={22} /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View className="flex-row items-center gap-2 mb-3 mt-5">
                <Ionicons name="timer-outline" color="rgba(255,255,255,0.45)" size={17} />
                <Text className="text-white/45 text-[11px] uppercase tracking-widest font-bold">Intro skip</Text>
              </View>
              <Pressable
                onPress={() => {
                  const introSec = Math.floor(position);
                  upsertContinue({
                    mediaKey,
                    mediaType: params.mediaType,
                    tmdbId: params.tmdbId,
                    title: params.title,
                    posterPath: params.posterPath,
                    backdropPath: params.backdropPath,
                    season: params.season,
                    episode: params.episode,
                    episodeTitle: params.episodeTitle,
                    positionSec: position,
                    durationSec: duration || Math.max(1, position),
                    updatedAt: Date.now(),
                    introSkipEndSec: introSec,
                  });
                  setSettingsOpen(false);
                }}
                className="rounded-2xl px-4 py-4 bg-white/10 border border-white/14 mb-10 active:bg-white/16"
              >
                <Text className="text-white font-bold text-[15px]">Mark intro end here</Text>
                <Text className="text-white/48 text-[13px] mt-1.5 leading-[19px]">
                  Uses your current playback position as where intros usually finish. You will see “Skip intro” on future
                  plays.
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerProgressTrack({
  progress,
  bufferedProgress,
}: {
  progress: number;
  bufferedProgress: number;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const b = Math.max(0, Math.min(1, bufferedProgress));
  return (
    <View className="relative justify-center py-2">
      <View className="h-[7px] rounded-full bg-white/14 overflow-hidden">
        <View
          className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full"
          style={{ width: `${b * 100}%` }}
        />
        <View className="absolute left-0 top-0 bottom-0 rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
      </View>
      <View
        pointerEvents="none"
        className="absolute w-[18px] h-[18px] rounded-full bg-white border-[3px] border-accent"
        style={{
          left: `${p * 100}%`,
          marginLeft: -9,
          top: '50%',
          marginTop: -9,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 4,
          elevation: 5,
        }}
      />
    </View>
  );
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
