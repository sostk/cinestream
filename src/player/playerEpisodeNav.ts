import type { TmdbEpisode } from '@/api/types/tmdb';
import type { PlayerEpisodeRef, PlayerRouteParams } from '@/navigation/types';

type EpisodeLike = Pick<TmdbEpisode, 'episode_number' | 'name'>;

export function toPlayerEpisodeRef(
  ep: EpisodeLike,
  ctx: {
    tmdbId: number;
    season: number;
    showTitle: string;
    posterPath?: string | null;
    backdropPath?: string | null;
  }
): PlayerEpisodeRef {
  return {
    mediaType: 'tv',
    tmdbId: ctx.tmdbId,
    season: ctx.season,
    episode: ep.episode_number,
    episodeTitle: ep.name,
    showTitle: ctx.showTitle,
    posterPath: ctx.posterPath,
    backdropPath: ctx.backdropPath,
  };
}

export function buildTvPlayerParams(input: {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  showTitle: string;
  episodes: EpisodeLike[];
  posterPath?: string | null;
  backdropPath?: string | null;
  resumeSec?: number;
}): PlayerRouteParams {
  const idx = input.episodes.findIndex((e) => e.episode_number === input.episodeNumber);
  const prevEp = idx > 0 ? input.episodes[idx - 1] : undefined;
  const nextEp = idx >= 0 && idx < input.episodes.length - 1 ? input.episodes[idx + 1] : undefined;

  const ctx = {
    tmdbId: input.tmdbId,
    season: input.seasonNumber,
    showTitle: input.showTitle,
    posterPath: input.posterPath,
    backdropPath: input.backdropPath,
  };

  return {
    title: `${input.showTitle} · ${input.episodeTitle}`,
    mediaType: 'tv',
    tmdbId: input.tmdbId,
    season: input.seasonNumber,
    episode: input.episodeNumber,
    episodeTitle: input.episodeTitle,
    showTitle: input.showTitle,
    posterPath: input.posterPath,
    backdropPath: input.backdropPath,
    resumeSec: input.resumeSec,
    prev: prevEp ? toPlayerEpisodeRef(prevEp, ctx) : undefined,
    next: nextEp ? toPlayerEpisodeRef(nextEp, ctx) : undefined,
  };
}

export function resolveTvNeighbors(
  params: PlayerRouteParams,
  episodes: EpisodeLike[]
): { prev?: PlayerEpisodeRef; next?: PlayerEpisodeRef } {
  if (params.mediaType !== 'tv' || params.season == null || params.episode == null || !episodes.length) {
    return { prev: params.prev, next: params.next };
  }

  const showTitle =
    params.showTitle ?? params.title.split(' · ')[0]?.trim() ?? 'Series';

  const built = buildTvPlayerParams({
    tmdbId: params.tmdbId,
    seasonNumber: params.season,
    episodeNumber: params.episode,
    episodeTitle: params.episodeTitle ?? `Episode ${params.episode}`,
    showTitle,
    episodes,
    posterPath: params.posterPath,
    backdropPath: params.backdropPath,
  });

  return {
    prev: params.prev ?? built.prev,
    next: params.next ?? built.next,
  };
}
