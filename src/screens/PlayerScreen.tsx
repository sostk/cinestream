import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Video, {
  BufferingStrategyType,
  SelectedTrackType,
  SelectedVideoTrackType,
  TextTrackType,
  ViewType,
} from 'react-native-video';
import type { VideoRef, TextTracks, OnLoadData, OnVideoErrorData } from 'react-native-video';
import { useKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import type { RootStackParamList, PlayerRouteParams } from '@/navigation/types';
import {
  pickAutoSource,
  resolveProxyUrl,
  videoSourceContentType,
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
import { tmdbImg } from '@/services/tmdbImages';
import { playbackLogger } from '@/player/playbackLogger';
import { usePlayerOrientation } from '@/player/usePlayerOrientation';
import { usePlaybackSources } from '@/player/usePlaybackSources';
import { sourceSignature, sniffDrmHint } from '@/player/streamUtils';
import { loadPlayerSelection, savePlayerSelection } from '@/player/selectionsStorage';
import { PlayerProgressBar } from '@/player/PlayerProgressBar';
import { PlayerSettingsModal } from '@/player/PlayerSettingsModal';

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

/** Shimmer-style blocks while OMSS streams resolve — avoids blank black screen. */
function PlayerFetchSkeleton({ wide }: { wide: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [p]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.35, 0.65]),
  }));
  return (
    <View className="flex-1 px-8 justify-center gap-5">
      <Animated.View style={a} className={`rounded-[26px] bg-white/10 ${wide ? 'h-56' : 'h-44'} border border-white/10`} />
      <Animated.View style={a} className="h-3 rounded-full bg-white/10 w-[88%]" />
      <Animated.View style={a} className="h-3 rounded-full bg-white/10 w-[55%]" />
      <View className="flex-row gap-3 mt-4">
        <Animated.View style={a} className="h-12 flex-1 rounded-2xl bg-white/8" />
        <Animated.View style={a} className="h-12 flex-1 rounded-2xl bg-white/8" />
      </View>
    </View>
  );
}

export function PlayerScreen() {
  useKeepAwake();
  usePlayerOrientation(true);
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const params = route.params;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWideLayout = width >= 840 || (width > height && width >= 640);
  const nextPosterUri =
    params.next?.posterPath != null ? tmdbImg(params.next.posterPath, 'w342') : undefined;

  const videoRef = useRef<VideoRef>(null);
  const hudHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsToken = useRef(0);
  const saveSelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoQuality = useSettingsStore((s) => s.autoQuality);
  const defaultRate = useSettingsStore((s) => s.defaultPlaybackRate);
  const cineproBaseUrl = useSettingsStore((s) => s.cineproBaseUrl);
  const autoplayNextEpisode = useSettingsStore((s) => s.autoplayNextEpisode);
  const setDefaultPlaybackRate = useSettingsStore((s) => s.setDefaultPlaybackRate);

  /** ExoPlayer does not send browser-like Referer/UA; some OMSS proxies require them (web works without this). */
  const nativeStreamHeaders = useMemo((): Record<string, string> | undefined => {
    if (Platform.OS === 'web') return undefined;
    const base = cineproBaseUrl.trim();
    if (!base) return undefined;
    const referer = base.endsWith('/') ? base : `${base}/`;
    let origin = '';
    try {
      origin = new URL(base.includes('://') ? base : `http://${base}`).origin;
    } catch {
      return { Referer: referer };
    }
    return {
      Referer: referer,
      Origin: origin,
      'User-Agent': Platform.select({
        ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        default:
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      })!,
    };
  }, [cineproBaseUrl]);

  const { omss, sorted, sourceIndex, setSourceIndex, activeSource, sortedKey } = usePlaybackSources({
    enabled: !!cineproBaseUrl.trim(),
    mediaType: params.mediaType,
    tmdbId: params.tmdbId,
    season: params.season,
    episode: params.episode,
  });

  const [subtitleTrack, setSubtitleTrack] = useState(-1);
  const [rate, setRate] = useState(defaultRate);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [position, setPosition] = useState(0);
  const [playableDuration, setPlayableDuration] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hud, setHud] = useState(Platform.isTV);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [streamFailed, setStreamFailed] = useState(false);
  const [nativeAudioTracks, setNativeAudioTracks] = useState<OnLoadData['audioTracks']>([]);
  const [nativeVideoTracks, setNativeVideoTracks] = useState<NonNullable<OnLoadData['videoTracks']>>([]);
  const [preferredAudioIdx, setPreferredAudioIdx] = useState(0);
  const [preferredVideoIdx, setPreferredVideoIdx] = useState(-1);
  const [gestureHud, setGestureHud] = useState<{ kind: 'brightness' | 'volume'; value: number } | null>(null);
  const volGestureStart = useRef(1);
  const brightnessGestureStart = useRef(1);

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

  useEffect(() => {
    setRate(defaultRate);
  }, [defaultRate]);

  useEffect(() => {
    const t = ++prefsToken.current;
    if (!sorted.length) return;
    void loadPlayerSelection(mediaKey).then((p) => {
      if (t !== prefsToken.current) return;
      if (p?.subtitleIdx != null && p.subtitleIdx >= -1) setSubtitleTrack(p.subtitleIdx);
      if (p?.audioIdx != null && p.audioIdx >= 0) setPreferredAudioIdx(p.audioIdx);
      if (p?.videoTrackIdx != null && p.videoTrackIdx >= -1) setPreferredVideoIdx(p.videoTrackIdx);

      if (p?.sourceSig) {
        const idx = sorted.findIndex((s) => sourceSignature(s) === p.sourceSig);
        if (idx >= 0) {
          setSourceIndex(idx);
          return;
        }
      }
      if (autoQuality) {
        const pick = pickAutoSource(sorted);
        const idx = pick ? sorted.indexOf(pick) : 0;
        setSourceIndex(idx >= 0 ? idx : 0);
      } else {
        setSourceIndex(0);
      }
    });
  }, [autoQuality, mediaKey, setSourceIndex, sorted, sortedKey]);

  const backdropUri = useMemo(
    () => tmdbImg(params.backdropPath ?? params.posterPath, 'w500'),
    [params.backdropPath, params.posterPath]
  );

  const textTracks = useMemo(() => {
    const subs = omss.data?.subtitles ?? [];
    return subs.map((s) => ({
      title: `${s.label} (${s.format})`,
      language: 'en' as const,
      type: TextTrackType.VTT,
      uri: resolveProxyUrl(s.url),
    })) as TextTracks;
  }, [omss.data?.subtitles]);

  const uri = activeSource ? resolveProxyUrl(activeSource.url) : '';

  useEffect(() => {
    if (activeSource && sniffDrmHint(activeSource.url)) {
      playbackLogger.warn('Stream URL hints at DRM; player has no license config for this title.', {
        type: activeSource.type,
      });
    }
  }, [activeSource]);

  useEffect(() => {
    setStreamFailed(false);
    setBuffering(true);
    setNativeAudioTracks([]);
    setNativeVideoTracks([]);
    setPreferredAudioIdx(0);
    setPreferredVideoIdx(-1);
  }, [uri]);

  const videoSource = useMemo(() => {
    if (!uri || !activeSource) return undefined;
    const contentType = videoSourceContentType(activeSource.type);
    return {
      uri,
      ...(nativeStreamHeaders ? { headers: nativeStreamHeaders } : {}),
      ...(contentType ? { type: contentType } : {}),
      minLoadRetryCount: 2,
      bufferConfig: {
        minBufferMs: 20_000,
        maxBufferMs: 60_000,
        bufferForPlaybackMs: 2200,
        bufferForPlaybackAfterRebufferMs: 4800,
      },
    };
  }, [activeSource, nativeStreamHeaders, uri]);

  const selectedAudioTrack = useMemo(() => {
    if (!nativeAudioTracks.length) return { type: SelectedTrackType.SYSTEM } as const;
    const idx = Math.min(preferredAudioIdx, nativeAudioTracks.length - 1);
    const v = nativeAudioTracks[idx]?.index;
    return { type: SelectedTrackType.INDEX, value: v ?? idx } as const;
  }, [nativeAudioTracks, preferredAudioIdx]);

  const selectedVideoTrack = useMemo(() => {
    if (preferredVideoIdx < 0 || !nativeVideoTracks.length) {
      return { type: SelectedVideoTrackType.AUTO } as const;
    }
    const idx = Math.min(preferredVideoIdx, nativeVideoTracks.length - 1);
    const v = nativeVideoTracks[idx]?.index;
    return { type: SelectedVideoTrackType.INDEX, value: v ?? idx } as const;
  }, [nativeVideoTracks, preferredVideoIdx]);

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

  const persistTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    persistTimer.current = setInterval(persistProgress, 9000);
    return () => {
      if (persistTimer.current) clearInterval(persistTimer.current);
      persistProgress();
    };
  }, [persistProgress]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') persistProgress();
    });
    return () => sub.remove();
  }, [persistProgress]);

  useEffect(() => {
    if (!activeSource) return;
    if (saveSelTimer.current) clearTimeout(saveSelTimer.current);
    saveSelTimer.current = setTimeout(() => {
      void savePlayerSelection(mediaKey, {
        sourceSig: sourceSignature(activeSource),
        subtitleIdx: subtitleTrack,
        audioIdx: preferredAudioIdx,
        videoTrackIdx: preferredVideoIdx,
      });
    }, 450);
    return () => {
      if (saveSelTimer.current) clearTimeout(saveSelTimer.current);
    };
  }, [activeSource, mediaKey, preferredAudioIdx, preferredVideoIdx, subtitleTrack]);

  const clearHudTimer = useCallback(() => {
    if (hudHideTimer.current) {
      clearTimeout(hudHideTimer.current);
      hudHideTimer.current = null;
    }
  }, []);

  const scheduleHudHide = useCallback(() => {
    clearHudTimer();
    if (Platform.isTV || settingsOpen || paused || controlsLocked) return;
    hudHideTimer.current = setTimeout(() => setHud(false), 5200);
  }, [clearHudTimer, controlsLocked, paused, settingsOpen]);

  useEffect(() => {
    if (!hud || Platform.isTV || settingsOpen || paused || controlsLocked) {
      clearHudTimer();
      return;
    }
    scheduleHudHide();
    return clearHudTimer;
  }, [controlsLocked, hud, paused, scheduleHudHide, settingsOpen, clearHudTimer]);

  useAndroidTVBack(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    navigation.goBack();
    return true;
  });

  useEffect(() => {
    if (!params.next || !autoplayNextEpisode) return;
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
    }, 11_000);
    return () => clearTimeout(id);
  }, [autoplayNextEpisode, duration, navigation, params.next, position]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        videoRef.current?.seek(Math.max(0, position - 10));
      } else if (e.code === 'ArrowRight') {
        videoRef.current?.seek(Math.min(duration || 0, position + 10));
      } else if (e.code === 'KeyM') {
        setVolume((v) => (v > 0.05 ? 0 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, position]);

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

  const seekRatio = useCallback(
    (ratio: number) => {
      if (!duration) return;
      seekTo(ratio * duration);
    },
    [duration, seekTo]
  );

  const togglePlayback = useCallback(() => {
    setPaused((p) => !p);
    if (!Platform.isTV) scheduleHudHide();
  }, [scheduleHudHide]);

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

  const onPlaybackError = useCallback(
    (e: OnVideoErrorData) => {
      playbackLogger.error('Playback error', { error: e.error });
      setSourceIndex((i) => {
        if (i < sorted.length - 1) {
          playbackLogger.info('Falling back to next stream source', { nextIndex: i + 1 });
          return i + 1;
        }
        setTimeout(() => setStreamFailed(true), 0);
        return i;
      });
    },
    [sorted.length, setSourceIndex]
  );

  const brightnessStripPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !controlsLocked && !Platform.isTV && !!uri,
        onMoveShouldSetPanResponder: (_, g) => !controlsLocked && !Platform.isTV && Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          void (async () => {
            try {
              if (await Brightness.isAvailableAsync()) {
                const p = await Brightness.requestPermissionsAsync();
                if (p.granted) {
                  brightnessGestureStart.current = await Brightness.getBrightnessAsync();
                }
              }
            } catch {
              /* gesture optional */
            }
          })();
        },
        onPanResponderMove: (_, g) => {
          void (async () => {
            try {
              const next = Math.max(
                0,
                Math.min(1, brightnessGestureStart.current - g.dy / 480)
              );
              await Brightness.setBrightnessAsync(next);
              setGestureHud({ kind: 'brightness', value: next });
            } catch {
              /* ignore */
            }
          })();
        },
        onPanResponderRelease: () => setGestureHud(null),
        onPanResponderTerminate: () => setGestureHud(null),
      }),
    [controlsLocked, uri]
  );

  const volumeStripPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !controlsLocked && !Platform.isTV && !!uri,
        onMoveShouldSetPanResponder: (_, g) => !controlsLocked && !Platform.isTV && Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          volGestureStart.current = volume;
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(0, Math.min(1, volGestureStart.current - g.dy / 480));
          setVolume(next);
          setGestureHud({ kind: 'volume', value: next });
        },
        onPanResponderRelease: () => setGestureHud(null),
        onPanResponderTerminate: () => setGestureHud(null),
      }),
    [controlsLocked, uri, volume]
  );

  const [miniMetaVisible, setMiniMetaVisible] = useState(true);
  useEffect(() => {
    if (hud || controlsLocked || !uri) {
      setMiniMetaVisible(false);
      return;
    }
    setMiniMetaVisible(true);
    const id = setTimeout(() => setMiniMetaVisible(false), 4200);
    return () => clearTimeout(id);
  }, [controlsLocked, hud, uri, params.title]);

  return (
    <View className="flex-1 bg-black">
      <StatusBar hidden />

      {uri ? (
        <View className="flex-1" collapsable={false}>
          <Video
            ref={videoRef}
            key={activeSource ? sourceSignature(activeSource) : 'no-source'}
            source={videoSource}
            style={{ flex: 1 }}
            viewType={Platform.OS === 'android' ? ViewType.TEXTURE : undefined}
            resizeMode="contain"
            paused={paused}
            rate={rate}
            volume={volume}
            progressUpdateInterval={450}
            bufferingStrategy={BufferingStrategyType.DEFAULT}
            onLoad={(data: OnLoadData) => {
              setDuration(data.duration);
              setPlayableDuration(0);
              setBuffering(false);
              setStreamFailed(false);
              setNativeAudioTracks(data.audioTracks ?? []);
              setNativeVideoTracks(data.videoTracks ?? []);
              playbackLogger.info('Video loaded', {
                audioTracks: data.audioTracks?.length ?? 0,
                videoTracks: data.videoTracks?.length ?? 0,
                duration: data.duration,
              });
              if (data.audioTracks?.length) {
                const idx = Math.min(preferredAudioIdx, data.audioTracks.length - 1);
                setPreferredAudioIdx(Math.max(0, idx));
              }
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
            onBuffer={(ev) => {
              setBuffering(ev.isBuffering);
              if (ev.isBuffering) {
                playbackLogger.debug('Buffering', { position, playableDuration });
              }
            }}
            onError={onPlaybackError}
            textTracks={textTracks}
            selectedTextTrack={
              subtitleTrack >= 0
                ? { type: SelectedTrackType.INDEX, value: subtitleTrack }
                : { type: SelectedTrackType.DISABLED }
            }
            selectedAudioTrack={selectedAudioTrack}
            selectedVideoTrack={selectedVideoTrack}
            preventsDisplaySleepDuringVideoPlayback
            renderLoader={() => (
              <View className="absolute inset-0 items-center justify-center">
                <View className="rounded-2xl overflow-hidden border border-white/12">
                  <BlurView intensity={28} tint="dark" className="px-8 py-5">
                    <ActivityIndicator color="#fff" />
                    <Text className="text-white/80 text-xs font-semibold mt-3">Starting…</Text>
                  </BlurView>
                </View>
              </View>
            )}
          />

          {!Platform.isTV ? (
            <>
              <View
                {...brightnessStripPan.panHandlers}
                pointerEvents="box-only"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 76, zIndex: 3 }}
              />
              <View
                {...volumeStripPan.panHandlers}
                pointerEvents="box-only"
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 76, zIndex: 3 }}
              />
            </>
          ) : null}

          {!Platform.isTV && miniMetaVisible ? (
            <Animated.View
              entering={undefined}
              style={[StyleSheet.absoluteFillObject, { zIndex: 4 }]}
              pointerEvents="none"
              className="justify-start"
            >
              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'transparent']}
                style={{ paddingTop: chromeTopPad, paddingHorizontal: 18, paddingBottom: 24 }}
              >
                <View className="rounded-2xl bg-black/45 border border-white/12 px-4 py-3 max-w-[88%]">
                  <Text className="text-white text-[15px] font-bold" numberOfLines={2}>
                    {params.title}
                  </Text>
                  {params.mediaType === 'tv' && params.episodeTitle ? (
                    <Text className="text-white/55 text-[12px] mt-1 font-medium" numberOfLines={1}>
                      Episode · {params.episodeTitle}
                    </Text>
                  ) : null}
                </View>
              </LinearGradient>
            </Animated.View>
          ) : null}

          {!Platform.isTV && !controlsLocked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show or hide playback controls"
              style={[StyleSheet.absoluteFillObject, { zIndex: 2 }]}
              onPress={() => {
                if (settingsOpen) return;
                setHud((h) => !h);
              }}
            />
          ) : null}

          {controlsLocked && !Platform.isTV ? (
            <Pressable
              style={[StyleSheet.absoluteFillObject, { zIndex: 5 }]}
              onPress={() => setControlsLocked(false)}
              accessibilityLabel="Unlock controls"
            >
              <View
                className="absolute bottom-10 self-center rounded-full bg-black/70 border border-white/25 px-5 py-3 flex-row items-center gap-2"
                style={{ alignSelf: 'center', left: 0, right: 0, marginHorizontal: 'auto' }}
              >
                <Ionicons name="lock-open-outline" color="#fff" size={20} />
                <Text className="text-white font-bold text-sm">Tap to unlock</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : omss.isLoading ? (
        <PlayerFetchSkeleton wide={isWideLayout} />
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
              name={omss.isError ? 'alert-circle-outline' : 'film-outline'}
              color="rgba(255,255,255,0.85)"
              size={40}
            />
          </View>
          <View className="items-center gap-2">
            <Text className="text-white text-center text-xl font-bold tracking-tight">
              {omss.isError ? 'Could not load sources' : 'Nothing to play'}
            </Text>
            <Text className="text-white/55 text-center text-[15px] leading-[22px] max-w-[320px]">
              {omss.isError
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

      {gestureHud ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { zIndex: 25 }]}
          className="items-center justify-center"
        >
          <BlurView intensity={40} tint="dark" className="rounded-2xl overflow-hidden border border-white/18 px-7 py-4">
            <Text className="text-white font-bold text-base">
              {gestureHud.kind === 'brightness' ? 'Brightness' : 'Volume'}{' '}
              {Math.round(gestureHud.value * 100)}%
            </Text>
          </BlurView>
        </View>
      ) : null}

      {streamFailed && uri ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 24 }]} className="items-center justify-center px-8">
          <BlurView intensity={50} tint="dark" className="rounded-3xl overflow-hidden border border-white/15 max-w-[360px] w-full">
            <View className="bg-black/40 px-6 py-6 gap-4">
              <Text className="text-white text-lg font-bold text-center">Stream interrupted</Text>
              <Text className="text-white/55 text-sm text-center leading-5">
                This source failed. Try another stream or reload the session.
              </Text>
              <View className="gap-2">
                {sourceIndex < sorted.length - 1 ? (
                  <Pressable
                    onPress={() => {
                      setStreamFailed(false);
                      setSourceIndex((i) => i + 1);
                    }}
                    className="rounded-2xl bg-accent py-3.5 border border-white/15"
                  >
                    <Text className="text-white text-center font-bold">Next source</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setStreamFailed(false);
                    void omss.refetch();
                  }}
                  className="rounded-2xl bg-white/12 py-3.5 border border-white/15"
                >
                  <Text className="text-white text-center font-bold">Reload streams</Text>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </View>
      ) : null}

      {(buffering && uri) || (!Platform.isTV && hud && paused) || (hud && !controlsLocked) ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 6 }]}>
          {buffering && uri ? (
            <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
              <BlurView
                intensity={22}
                tint="dark"
                className="rounded-3xl overflow-hidden border border-white/12 px-8 py-6"
              >
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

          {hud && !controlsLocked ? (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(0,0,0,0.82)', 'transparent']}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 160,
                }}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.95)']}
                locations={[0, 0.5, 1]}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 340,
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
                <View className="flex-1 rounded-2xl bg-black/40 border border-white/12 px-3 py-2.5">
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
                {!Platform.isTV ? (
                  <FocusSurface
                    className={iconRound}
                    onPress={() => setControlsLocked(true)}
                    accessibilityLabel="Lock controls"
                  >
                    <Ionicons name="lock-closed-outline" color="#fff" size={20} />
                  </FocusSurface>
                ) : null}
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

                <View className="gap-2">
                  <View className="flex-row justify-between items-baseline">
                    <Text className="text-white text-sm font-semibold tabular-nums">{formatDuration(position)}</Text>
                    <Text className="text-white/45 text-xs tabular-nums font-medium">
                      −{formatDuration(Math.max(0, duration - position))}
                    </Text>
                  </View>
                  <PlayerProgressBar
                    progress={progress}
                    bufferedProgress={bufferedProgress}
                    disabled={controlsLocked}
                    isTv={Platform.isTV}
                    previewBackdropUri={backdropUri}
                    duration={duration}
                    onSeekRatio={seekRatio}
                    formatDuration={formatDuration}
                  />
                </View>

                <BlurView
                  intensity={56}
                  tint="dark"
                  className="rounded-[26px] overflow-hidden border border-white/14"
                >
                  <View className="px-3 pt-4 pb-4 gap-4 bg-black/28">
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
                        className={`${pillBtn} flex-row items-center gap-2 max-w-[48%]`}
                        onPress={openSettings}
                        accessibilityLabel="Subtitles and audio"
                      >
                        <Ionicons name="text-outline" color="#fff" size={18} />
                        <Text className="text-white text-[13px] font-semibold" numberOfLines={1}>
                          {subtitleTrack < 0 ? 'Captions off' : 'Captions'}
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

                    {params.next && duration - position < 32 ? (
                      <View className="rounded-2xl overflow-hidden border border-white/12 bg-white/8">
                        <View className="flex-row gap-3 p-3">
                          <View className="w-[72px] h-[48px] rounded-xl overflow-hidden bg-white/10">
                            {nextPosterUri ? (
                              <Image
                                source={{ uri: nextPosterUri }}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                              />
                            ) : (
                              <View className="flex-1 bg-white/10" />
                            )}
                          </View>
                          <View className="flex-1 gap-1">
                            <Text className="text-white/70 text-[11px] font-bold uppercase tracking-wider">
                              Up next
                            </Text>
                            <Text className="text-white font-semibold text-[14px]" numberOfLines={2}>
                              {params.next.episodeTitle ?? `Episode ${params.next.episode}`}
                            </Text>
                            <Text className="text-white/45 text-[11px]">
                              {autoplayNextEpisode
                                ? `Autoplay in ${Math.max(0, Math.ceil(11 - (duration - position)))}s`
                                : 'Autoplay off in Settings'}
                            </Text>
                          </View>
                        </View>
                        <View className="flex-row border-t border-white/10">
                          <Pressable
                            className="flex-1 py-3 border-r border-white/10"
                            onPress={() => {
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
                            }}
                          >
                            <Text className="text-accent text-center font-bold text-[13px]">Play now</Text>
                          </Pressable>
                          <Pressable
                            className="flex-1 py-3"
                            onPress={() =>
                              navigation.setParams({ next: undefined } as Partial<PlayerRouteParams>)
                            }
                          >
                            <Text className="text-white/70 text-center font-semibold text-[13px]">Dismiss</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </BlurView>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <PlayerSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        rates={RATES}
        rate={rate}
        onRateChange={(r) => {
          setRate(r);
          setDefaultPlaybackRate(r);
        }}
        textTracks={textTracks}
        subtitleTrack={subtitleTrack}
        onSubtitleChange={setSubtitleTrack}
        sortedSources={sorted}
        sourceIndex={sourceIndex}
        onSourceChange={setSourceIndex}
        audioTracks={nativeAudioTracks}
        preferredAudioIdx={preferredAudioIdx}
        onAudioIdxChange={setPreferredAudioIdx}
        videoTracks={nativeVideoTracks}
        preferredVideoIdx={preferredVideoIdx}
        onVideoIdxChange={setPreferredVideoIdx}
        onMarkIntroEnd={() => {
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
