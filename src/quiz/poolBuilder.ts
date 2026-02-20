import { BadRequestException } from '@nestjs/common';
import {
  MinimalTrack,
  PlaylistTrackPageMinimalStats,
  SpotifyService,
} from '../spotify/spotify.service';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_TARGET_POOL_SIZE = 120;
const DEFAULT_MIN_POOL_SIZE = 30;
const DEFAULT_MAX_PAGES_FETCHED = 10;

type PoolBuildOptions = {
  playlistId: string;
  pageSize?: number;
  targetPoolSize?: number;
  minPoolSize?: number;
  maxPagesFetched?: number;
};

export type PoolBuildDiagnostics = {
  total: number;
  pagesFetched: number;
  itemsCount: number;
  nullTrackCount: number;
  localTrackCount: number;
  missingIdOrUriCount: number;
  uniqueTracks: number;
};

export type BuiltPoolFromPlaylist = {
  tracks: MinimalTrack[];
  total: number;
  pageSize: number;
  pagesFetchedOffsets: number[];
  diagnostics: PoolBuildDiagnostics;
};

function emptyStats(): PlaylistTrackPageMinimalStats {
  return {
    itemsCount: 0,
    nullTrackCount: 0,
    localTrackCount: 0,
    missingIdOrUriCount: 0,
  };
}

function mergeStats(
  total: PlaylistTrackPageMinimalStats,
  next: PlaylistTrackPageMinimalStats,
) {
  total.itemsCount += next.itemsCount;
  total.nullTrackCount += next.nullTrackCount;
  total.localTrackCount += next.localTrackCount;
  total.missingIdOrUriCount += next.missingIdOrUriCount;
}

function buildPoolFailureMessage(
  poolSize: number,
  total: number,
  stats: PlaylistTrackPageMinimalStats,
  pagesFetched: number,
) {
  return `Playlist too small / empty (pool=${poolSize}, total=${total}, items=${stats.itemsCount}, nullTrack=${stats.nullTrackCount}, local=${stats.localTrackCount}, missingId=${stats.missingIdOrUriCount}, pages=${pagesFetched})`;
}

export async function buildPoolFromPlaylist(
  spotifyService: SpotifyService,
  options: PoolBuildOptions,
): Promise<BuiltPoolFromPlaylist> {
  const playlistId = (options.playlistId ?? '').trim();
  if (!playlistId) {
    throw new BadRequestException('Missing playlistId');
  }

  const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)));
  const targetPoolSize = Math.max(1, Math.floor(options.targetPoolSize ?? DEFAULT_TARGET_POOL_SIZE));
  const minPoolSize = Math.max(1, Math.floor(options.minPoolSize ?? DEFAULT_MIN_POOL_SIZE));
  const maxPagesFetched = Math.max(1, Math.floor(options.maxPagesFetched ?? DEFAULT_MAX_PAGES_FETCHED));

  const pagesFetchedOffsets: number[] = [];
  const aggregatedStats = emptyStats();
  const tracksById = new Map<string, MinimalTrack>();

  const firstPage = await spotifyService.getPlaylistTrackPageMinimal(
    playlistId,
    0,
    pageSize,
  );
  pagesFetchedOffsets.push(0);
  mergeStats(aggregatedStats, firstPage.stats);

  for (const track of firstPage.mappedTracks) {
    if (!tracksById.has(track.id)) {
      tracksById.set(track.id, track);
    }
  }

  const total = Number(firstPage.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));

  for (
    let pageIndex = 1;
    pageIndex < totalPages &&
    pageIndex < maxPagesFetched &&
    tracksById.size < targetPoolSize;
    pageIndex += 1
  ) {
    const offset = pageIndex * pageSize;
    const page = await spotifyService.getPlaylistTrackPageMinimal(
      playlistId,
      offset,
      pageSize,
    );
    pagesFetchedOffsets.push(offset);
    mergeStats(aggregatedStats, page.stats);

    for (const track of page.mappedTracks) {
      if (!tracksById.has(track.id)) {
        tracksById.set(track.id, track);
      }
    }
  }

  if (tracksById.size < minPoolSize) {
    throw new BadRequestException(
      buildPoolFailureMessage(
        tracksById.size,
        total,
        aggregatedStats,
        pagesFetchedOffsets.length,
      ),
    );
  }

  return {
    tracks: [...tracksById.values()],
    total,
    pageSize,
    pagesFetchedOffsets,
    diagnostics: {
      total,
      pagesFetched: pagesFetchedOffsets.length,
      itemsCount: aggregatedStats.itemsCount,
      nullTrackCount: aggregatedStats.nullTrackCount,
      localTrackCount: aggregatedStats.localTrackCount,
      missingIdOrUriCount: aggregatedStats.missingIdOrUriCount,
      uniqueTracks: tracksById.size,
    },
  };
}
