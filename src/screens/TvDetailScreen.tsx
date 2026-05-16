import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { qk } from '@/api/queryKeys';
import { TmdbApi } from '@/api/tmdbClient';
import { MediaRow } from '@/components/MediaRow';
import type { MediaCardModel } from '@/components/MediaCard';
import { useResponsive } from '@/hooks/useResponsive';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  resolveStreamReadyState,
  streamAvailabilityDetailLine,
} from '@/player/streamAvailability';
import { buildTvPlayerParams } from '@/player/playerEpisodeNav';
import { usePlayTvEpisode } from '@/player/usePlayTvEpisode';
import { useHasConfiguredTmdbKey } from '@/utils/tmdbCredentials';
import { FocusSurface } from '@/tv/FocusSurface';
import { tmdbImg } from '@/services/tmdbImages';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { TmdbSeasonSummary } from '@/api/types/tmdb';

const OVERVIEW_PREVIEW_LINES = 5;

function seasonChipLabel(season: TmdbSeasonSummary): string {
  if (season.season_number === 0) return 'Specials';
  if (/season/i.test(season.name)) return season.name;
  return `S${season.season_number}`;
}

export function TvDetailScreen() {
  const navigation = useAppNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'TvDetail'>>();
  const { id } = route.params;
  const { posterW, posterH, overscanX, sectionGap, heroH } = useResponsive();
  const insets = useSafeAreaInsets();
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const hasTmdb = useHasConfiguredTmdbKey();
  const cineproBaseUrl = useSettingsStore((s) => s.cineproBaseUrl);
  const coreConfigured = !!cineproBaseUrl.trim();

  const detail = useQuery({
    queryKey: qk.tvDetail(id),
    queryFn: () => TmdbApi.tvDetail(id),
    enabled: hasTmdb,
  });

  const rec = useQuery({
    queryKey: qk.recTv(id, 1),
    queryFn: () => TmdbApi.recommendationsTv(id, 1),
    enabled: !!detail.data && hasTmdb,
  });

  const toggleWatchlist = useLibraryStore((s) => s.toggleWatchlist);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const continueWatching = useLibraryStore((s) => s.continueWatching);

  const inWatchlist = useLibraryStore((s) =>
    s.watchlist.some((w) => w.mediaType === 'tv' && w.tmdbId === id)
  );
  const inFavorites = useLibraryStore((s) =>
    s.favorites.some((w) => w.mediaType === 'tv' && w.tmdbId === id)
  );

  const seasons = detail.data?.seasons ?? [];

  const playableSeasons = useMemo(
    () => [...seasons.filter((s) => s.season_number >= 0)].sort((a, b) => a.season_number - b.season_number),
    [seasons]
  );

  const continueEpisode = useMemo(() => {
    const rows = continueWatching
      .filter((c) => c.mediaType === 'tv' && c.tmdbId === id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return rows[0];
  }, [continueWatching, id]);

  const preferredSeasonNumber = useMemo(() => {
    if (continueEpisode?.season != null) {
      const match = playableSeasons.find((s) => s.season_number === continueEpisode.season);
      if (match) return match.season_number;
    }
    const s1 = playableSeasons.find((s) => s.season_number === 1);
    return s1?.season_number ?? playableSeasons[0]?.season_number ?? 1;
  }, [continueEpisode?.season, playableSeasons]);

  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(preferredSeasonNumber);

  useEffect(() => {
    setSelectedSeasonNumber(preferredSeasonNumber);
  }, [id, preferredSeasonNumber]);

  const selectedSeasonSummary = useMemo(
    () => playableSeasons.find((s) => s.season_number === selectedSeasonNumber),
    [playableSeasons, selectedSeasonNumber]
  );

  const seasonDetail = useQuery({
    queryKey: qk.tvSeason(id, selectedSeasonNumber),
    queryFn: () => TmdbApi.tvSeason(id, selectedSeasonNumber),
    enabled: hasTmdb && selectedSeasonNumber >= 0,
  });

  const seasonEpisodes = seasonDetail.data?.episodes ?? [];
  const showTitle = detail.data?.name ?? 'Series';

  const { playEpisode, episodeQueryByNumber, readyCount } = usePlayTvEpisode({
    tmdbId: id,
    seasonNumber: selectedSeasonNumber,
    episodes: seasonEpisodes,
    showTitle,
    posterPath: detail.data?.poster_path,
    backdropPath: detail.data?.backdrop_path,
    prefetchEnabled: seasonEpisodes.length > 0,
  });

  const primaryPrefetch = episodeQueryByNumber.get(seasonEpisodes[0]?.episode_number ?? 1);
  const streamState = useMemo(
    () =>
      resolveStreamReadyState(
        coreConfigured,
        primaryPrefetch ?? {
          isPending: seasonDetail.isLoading,
          isFetching: seasonDetail.isFetching,
          isError: seasonDetail.isError,
          error: seasonDetail.error,
          data: undefined,
        }
      ),
    [coreConfigured, primaryPrefetch, seasonDetail.error, seasonDetail.isError, seasonDetail.isFetching, seasonDetail.isLoading]
  );

  const runtimes = detail.data?.episode_run_time?.filter((n) => n > 0) ?? [];
  const avgRuntime =
    runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null;

  const recModels: MediaCardModel[] = useMemo(
    () =>
      (rec.data?.results ?? []).map((m) => ({
        id: m.id,
        title: m.name,
        posterPath: m.poster_path,
        backdropPath: m.backdrop_path,
        subtitle: m.first_air_date?.slice(0, 4),
        mediaType: 'tv' as const,
      })),
    [rec.data?.results]
  );

  const backdropUri = tmdbImg(detail.data?.backdrop_path ?? detail.data?.poster_path, 'w1280');
  const posterUri = tmdbImg(detail.data?.poster_path, 'w500');
  const d = detail.data;

  const openSeasonBrowser = useCallback(() => {
    if (!selectedSeasonSummary) return;
    navigation.navigate('EpisodeBrowser', {
      id,
      seasonNumber: selectedSeasonNumber,
      title: `${showTitle} · ${selectedSeasonSummary.name}`,
    });
  }, [id, navigation, selectedSeasonNumber, selectedSeasonSummary, showTitle]);

  const selectSeason = useCallback((seasonNumber: number) => {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedSeasonNumber(seasonNumber);
  }, []);

  const loading = detail.isPending;

  const toggleOverview = () => {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOverviewExpanded((v) => !v);
  };

  return (
    <ScrollView
      className="flex-1 bg-ink"
      contentContainerStyle={{ paddingBottom: sectionGap * 10 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="relative w-full" style={{ height: heroH }}>
        <Image
          source={backdropUri ? { uri: backdropUri } : undefined}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['rgba(7,8,13,0.15)', 'rgba(7,8,13,0.55)', '#07080d']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            left: overscanX,
            right: overscanX,
            top: insets.top + 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <FocusSurface
            className="rounded-full bg-black/55 border border-white/18 px-3 py-2.5"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" color="#fff" size={24} />
          </FocusSurface>
        </View>
      </View>

      <View style={{ paddingHorizontal: Math.max(overscanX, 16), marginTop: -72 }}>
        <View className="rounded-3xl border border-white/12 bg-[#12131c] overflow-hidden shadow-2xl">
          <LinearGradient
            colors={['rgba(229,9,20,0.08)', 'transparent']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }}
          />

          <View className="p-5">
            {loading ? (
              <View className="gap-4 py-2">
                <View className="flex-row gap-4">
                  <View className="w-[118px] rounded-2xl bg-white/10 aspect-[2/3]" />
                  <View className="flex-1 gap-2 justify-center">
                    <View className="h-6 rounded-lg bg-white/10 w-[90%]" />
                    <View className="h-4 rounded-lg bg-white/10 w-[40%]" />
                  </View>
                </View>
                <ActivityIndicator color="#e50914" style={{ marginTop: 16 }} />
              </View>
            ) : (
              <>
                <View className="flex-row gap-4">
                  <Image
                    source={posterUri ? { uri: posterUri } : undefined}
                    style={{ width: 118, aspectRatio: 2 / 3, borderRadius: 16 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    accessibilityLabel={`Poster for ${d?.name ?? 'series'}`}
                  />
                  <View className="flex-1 justify-center">
                    <Text className="text-white text-[22px] font-bold leading-7" numberOfLines={3}>
                      {d?.name ?? 'Series'}
                    </Text>
                    {d?.tagline ? (
                      <Text className="text-white/45 text-sm italic mt-2" numberOfLines={2}>
                        {d.tagline}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-4 -mx-1"
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
                >
                  {d?.first_air_date ? (
                    <View className="rounded-full bg-white/10 border border-white/12 px-3 py-1.5">
                      <Text className="text-white/90 text-xs font-semibold">
                        Since {d.first_air_date.slice(0, 4)}
                      </Text>
                    </View>
                  ) : null}
                  {d?.number_of_seasons != null ? (
                    <View className="rounded-full bg-white/10 border border-white/12 px-3 py-1.5 flex-row items-center gap-1">
                      <Ionicons name="albums-outline" color="rgba(255,255,255,0.85)" size={14} />
                      <Text className="text-white/90 text-xs font-semibold">
                        {d.number_of_seasons} season{d.number_of_seasons === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ) : null}
                  {avgRuntime != null ? (
                    <View className="rounded-full bg-white/10 border border-white/12 px-3 py-1.5 flex-row items-center gap-1">
                      <Ionicons name="time-outline" color="rgba(255,255,255,0.85)" size={14} />
                      <Text className="text-white/90 text-xs font-semibold">~{avgRuntime} min / ep</Text>
                    </View>
                  ) : null}
                  {d?.vote_average != null ? (
                    <View className="rounded-full bg-white/10 border border-white/12 px-3 py-1.5 flex-row items-center gap-1">
                      <Ionicons name="star" color="#f5c518" size={14} />
                      <Text className="text-white/90 text-xs font-semibold">{d.vote_average.toFixed(1)} TMDB</Text>
                    </View>
                  ) : null}
                  {(d?.genres ?? []).map((g) => (
                    <View key={g.id} className="rounded-full bg-accent/20 border border-accent/35 px-3 py-1.5">
                      <Text className="text-white text-xs font-medium">{g.name}</Text>
                    </View>
                  ))}
                </ScrollView>

                {d?.overview ? (
                  <View className="mt-5">
                    <Text className="text-white/55 text-xs uppercase tracking-widest mb-2">About</Text>
                    <Text
                      className="text-white/85 text-[15px] leading-6"
                      numberOfLines={overviewExpanded ? undefined : OVERVIEW_PREVIEW_LINES}
                    >
                      {d.overview}
                    </Text>
                    {(d.overview?.length ?? 0) > 220 ? (
                      <FocusSurface className="self-start mt-2 py-1" onPress={toggleOverview}>
                        <Text className="text-accent text-sm font-semibold">
                          {overviewExpanded ? 'Show less' : 'Read more'}
                        </Text>
                      </FocusSurface>
                    ) : null}
                  </View>
                ) : null}

                {continueEpisode?.season != null && continueEpisode.episode != null ? (
                  <FocusSurface
                    className="mt-6 rounded-2xl py-4 px-4 flex-row items-center gap-3 bg-accent shadow-lg active:opacity-90"
                    onPress={() => {
                      const epNum = continueEpisode.episode!;
                      const epTitle =
                        continueEpisode.episodeTitle ?? `Episode ${epNum}`;
                      navigation.navigate(
                        'Player',
                        buildTvPlayerParams({
                          tmdbId: id,
                          seasonNumber: continueEpisode.season!,
                          episodeNumber: epNum,
                          episodeTitle: epTitle,
                          showTitle,
                          episodes:
                            continueEpisode.season === selectedSeasonNumber && seasonEpisodes.length
                              ? seasonEpisodes
                              : [{ episode_number: epNum, name: epTitle }],
                          posterPath: d?.poster_path,
                          backdropPath: d?.backdrop_path,
                          resumeSec: continueEpisode.positionSec,
                        })
                      );
                    }}
                    accessibilityLabel="Resume watching"
                  >
                    <Ionicons name="play-circle" color="#fff" size={28} />
                    <View className="flex-1">
                      <Text className="text-white font-bold text-base">Resume</Text>
                      <Text className="text-white/80 text-sm mt-0.5">
                        S{continueEpisode.season} · E{continueEpisode.episode}
                        {continueEpisode.episodeTitle ? ` · ${continueEpisode.episodeTitle}` : ''}
                      </Text>
                    </View>
                  </FocusSurface>
                ) : null}

                <View className="mt-6 gap-3">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-white/55 text-xs uppercase tracking-widest">Seasons</Text>
                    {playableSeasons.length > 0 ? (
                      <FocusSurface className="py-1 px-1 active:opacity-80" onPress={openSeasonBrowser}>
                        <Text className="text-accent text-xs font-bold">Full list</Text>
                      </FocusSurface>
                    ) : null}
                  </View>

                  {playableSeasons.length === 0 ? (
                    <Text className="text-white/45 text-sm">No seasons to show.</Text>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                    >
                      {playableSeasons.map((season) => {
                        const active = season.season_number === selectedSeasonNumber;
                        return (
                          <FocusSurface
                            key={season.id}
                            className={`rounded-full px-4 py-2.5 border ${
                              active ? 'bg-accent border-accent' : 'bg-white/10 border-white/14 active:bg-white/16'
                            }`}
                            onPress={() => selectSeason(season.season_number)}
                            accessibilityLabel={season.name}
                            accessibilityState={{ selected: active }}
                          >
                            <Text
                              className={`font-bold text-sm ${active ? 'text-white' : 'text-white/85'}`}
                              numberOfLines={1}
                            >
                              {seasonChipLabel(season)}
                            </Text>
                          </FocusSurface>
                        );
                      })}
                    </ScrollView>
                  )}

                  <View className="flex-row items-center justify-between mt-1">
                    <Text className="text-white font-semibold text-[15px] flex-1" numberOfLines={1}>
                      {selectedSeasonSummary?.name ?? `Season ${selectedSeasonNumber}`}
                    </Text>
                    {seasonDetail.isLoading ? (
                      <ActivityIndicator color="#e50914" size="small" />
                    ) : (
                      <Text className="text-white/45 text-xs">
                        {seasonEpisodes.length} ep · {readyCount} ready
                      </Text>
                    )}
                  </View>

                  {seasonDetail.isError ? (
                    <View className="rounded-2xl bg-white/8 border border-white/12 py-4 px-4">
                      <Text className="text-white/70 text-center text-sm">
                        Couldn’t load episodes. Check your connection and TMDB key.
                      </Text>
                    </View>
                  ) : seasonDetail.isLoading ? (
                    <View className="py-8 items-center">
                      <ActivityIndicator color="#e50914" size="large" />
                    </View>
                  ) : seasonEpisodes.length === 0 ? (
                    <Text className="text-white/45 text-sm py-4">No episodes in this season.</Text>
                  ) : (
                    <View className="gap-2.5">
                      {seasonEpisodes.map((item) => {
                        const uri = tmdbImg(item.still_path ?? d?.poster_path, 'w500');
                        const epState = resolveStreamReadyState(
                          coreConfigured,
                          episodeQueryByNumber.get(item.episode_number) ?? {
                            isPending: true,
                            isFetching: true,
                            isError: false,
                            error: null,
                            data: undefined,
                          }
                        );
                        const epReady = epState.status === 'ready';
                        const epLoading = epState.status === 'loading';
                        const isContinue =
                          continueEpisode?.season === selectedSeasonNumber &&
                          continueEpisode.episode === item.episode_number;

                        return (
                          <FocusSurface
                            key={item.id}
                            className={`rounded-2xl overflow-hidden border ${
                              isContinue
                                ? 'bg-accent/15 border-accent/40'
                                : 'bg-white/6 border-white/10 active:bg-white/10'
                            }`}
                            onPress={() => playEpisode(item.episode_number, item.name)}
                            accessibilityLabel={`Play episode ${item.episode_number} ${item.name}`}
                          >
                            <View className="flex-row">
                              <Image
                                source={uri ? { uri } : undefined}
                                style={{ width: 128, height: 72 }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                              <View className="flex-1 p-3 justify-center">
                                <View className="flex-row items-center gap-2">
                                  <Text className="text-white font-semibold flex-1" numberOfLines={2}>
                                    E{item.episode_number}: {item.name}
                                  </Text>
                                  {epLoading ? (
                                    <ActivityIndicator color="#e50914" size="small" />
                                  ) : epReady ? (
                                    <Ionicons name="cloud-done-outline" color="#e50914" size={18} />
                                  ) : null}
                                </View>
                                {isContinue ? (
                                  <Text className="text-accent text-[11px] font-bold mt-1 uppercase tracking-wide">
                                    Continue
                                  </Text>
                                ) : item.overview ? (
                                  <Text className="text-white/50 text-xs mt-1.5" numberOfLines={2}>
                                    {item.overview}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          </FocusSurface>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View className="mt-6 gap-3">
                  <View className="flex-row gap-3">
                    <FocusSurface
                      className="flex-1 rounded-2xl bg-white/10 border border-white/14 py-3.5 flex-row items-center justify-center gap-2"
                      onPress={() =>
                        d &&
                        toggleWatchlist({
                          mediaType: 'tv',
                          tmdbId: d.id,
                          title: d.name,
                          posterPath: d.poster_path,
                        })
                      }
                    >
                      <Ionicons
                        name={inWatchlist ? 'bookmark' : 'bookmark-outline'}
                        color="#fff"
                        size={20}
                      />
                      <Text className="text-white font-semibold text-sm">Watchlist</Text>
                    </FocusSurface>
                    <FocusSurface
                      className="flex-1 rounded-2xl bg-white/10 border border-white/14 py-3.5 flex-row items-center justify-center gap-2"
                      onPress={() =>
                        d &&
                        toggleFavorite({
                          mediaType: 'tv',
                          tmdbId: d.id,
                          title: d.name,
                          posterPath: d.poster_path,
                        })
                      }
                    >
                      <Ionicons
                        name={inFavorites ? 'heart' : 'heart-outline'}
                        color={inFavorites ? '#ff5c66' : '#fff'}
                        size={20}
                      />
                      <Text className="text-white font-semibold text-sm">Favorite</Text>
                    </FocusSurface>
                  </View>
                </View>

                {selectedSeasonSummary ? (
                  <View className="mt-5 rounded-2xl bg-white/[0.06] border border-white/10 p-4">
                    <View className="flex-row items-center gap-2 mb-2">
                      <Ionicons
                        name={
                          streamState.status === 'ready'
                            ? 'cloud-done-outline'
                            : streamState.status === 'loading'
                              ? 'cloud-download-outline'
                              : 'cloud-offline-outline'
                        }
                        color="rgba(255,255,255,0.75)"
                        size={20}
                      />
                      <Text className="text-white font-semibold text-[15px]">Streaming availability</Text>
                    </View>
                    <Text className="text-white/65 text-sm leading-5">
                      {streamState.status === 'ready'
                        ? `Prefetching ${selectedSeasonSummary.name} · ${streamAvailabilityDetailLine(
                            streamState,
                            primaryPrefetch?.data?.expiresAt
                          )}`
                        : streamAvailabilityDetailLine(streamState)}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>

        <View style={{ marginTop: sectionGap * 2 }}>
          <MediaRow
            title="Similar series"
            data={recModels}
            posterW={posterW}
            posterH={posterH}
            isLoading={rec.isLoading}
            onSelect={(item) => navigation.navigate('TvDetail', { id: item.id })}
          />
        </View>
      </View>
    </ScrollView>
  );
}
