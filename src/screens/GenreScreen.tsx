import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';
import { TmdbApi } from '@/api/tmdbClient';
import { MediaCard } from '@/components/MediaCard';
import type { MediaCardModel } from '@/components/MediaCard';
import { useResponsive } from '@/hooks/useResponsive';
import { GRID_LIST_SIDE_PADDING, GRID_ROW_GAP, gridPosterSlotDimensions } from '@/utils/layout';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { MissingKeysBanner } from '@/components/MissingKeysBanner';
import { useHasConfiguredTmdbKey } from '@/utils/tmdbCredentials';
import { ThemedBackButton, ThemedScreen, ThemedText } from '@/theme/themedPrimitives';
import { useAppTheme } from '@/theme/AppThemeProvider';

export function GenreScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Genre'>>();
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const { overscanX, gridColumns: numColumns, windowWidth } = useResponsive();
  const { posterW, posterH, slotW } = gridPosterSlotDimensions(windowWidth, overscanX, numColumns);
  const { genreId, genreName, mediaType } = route.params;

  const hasTmdb = useHasConfiguredTmdbKey();

  const query = useInfiniteQuery({
    queryKey: ['tmdb', 'genreInfinite', mediaType, genreId] as const,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      if (mediaType === 'movie') {
        return TmdbApi.discoverMovies({ page, genreId });
      }
      return TmdbApi.discoverTv({ page, genreId });
    },
    getNextPageParam: (last) => {
      const lp = last as { page: number; total_pages: number };
      return lp.page < lp.total_pages ? lp.page + 1 : undefined;
    },
    enabled: hasTmdb,
  });

  const flat: MediaCardModel[] = useMemo(() => {
    const rows: MediaCardModel[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.results) {
        if ('title' in item) {
          rows.push({
            id: item.id,
            title: item.title,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            subtitle: item.release_date?.slice(0, 4),
            mediaType: 'movie',
          });
        } else {
          rows.push({
            id: item.id,
            title: item.name,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            subtitle: item.first_air_date?.slice(0, 4),
            mediaType: 'tv',
          });
        }
      }
    }
    return rows;
  }, [query.data?.pages]);

  const onSelect = useCallback(
    (item: MediaCardModel) => {
      if (item.mediaType === 'tv') navigation.navigate('TvDetail', { id: item.id });
      else navigation.navigate('MovieDetail', { id: item.id });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: MediaCardModel }) => (
      <View style={{ width: slotW, alignItems: 'center', paddingBottom: GRID_ROW_GAP }}>
        <MediaCard item={item} width={posterW} height={posterH} onPress={() => onSelect(item)} />
      </View>
    ),
    [onSelect, posterH, posterW, slotW]
  );

  if (!hasTmdb) {
    return (
      <ThemedScreen className="px-4 pt-16">
        <MissingKeysBanner />
      </ThemedScreen>
    );
  }

  const listPad = GRID_LIST_SIDE_PADDING + overscanX;

  return (
    <ThemedScreen className="pt-14">
      <View style={{ paddingHorizontal: listPad }} className="flex-row items-center mb-4 gap-3">
        <ThemedBackButton onPress={() => navigation.goBack()} />
        <ThemedText variant="title" className="text-3xl flex-1">
          {genreName}
        </ThemedText>
      </View>
      {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      <FlashList
        data={flat}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        numColumns={numColumns}
        extraData={`${numColumns}-${posterW}-${windowWidth}`}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: listPad, paddingBottom: 32, paddingTop: 8 }}
        onEndReached={() => query.fetchNextPage()}
        onEndReachedThreshold={0.65}
      />
    </ThemedScreen>
  );
}
