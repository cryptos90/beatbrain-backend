import { Injectable, Logger } from '@nestjs/common';
import {
  SpotifyPlaylistMeta,
  SpotifyService,
} from '../spotify/spotify.service';
import { ChoosePlaylist } from './choose.types';

const BEATBRAIN_PLAYLIST_PREFIX = 'beatbrain_';
const BEATBRAIN_DECADE_SUFFIXES = new Set([
  '60s',
  '70s',
  '80s',
  '90s',
  '00s',
  '10s',
  '20s',
]);
const BEATBRAIN_DISPLAY_NAMES: Record<string, string> = {
  '60s': '60s',
  '70s': '70s',
  '80s': '80s',
  '90s': '90s',
  '00s': '00s',
  '10s': '10s',
  '20s': '20s',
  rock: 'Rock',
  hiphop: 'Hip-Hop',
  rnb: 'R&B',
  country: 'Country',
  pop: 'Pop',
  deutsch: 'Deutsch',
};
const BEATBRAIN_PLAYLIST_ORDER = [
  '60s',
  '70s',
  '80s',
  '90s',
  '00s',
  '10s',
  '20s',
  'rock',
  'hiphop',
  'rnb',
  'country',
  'pop',
  'deutsch',
];

function normalizeBeatBrainPlaylistSuffix(name: string) {
  const trimmed = String(name ?? '').trim();
  const lowered = trimmed.toLowerCase();
  if (!lowered.startsWith(BEATBRAIN_PLAYLIST_PREFIX)) {
    return null;
  }

  const suffix = trimmed.slice(BEATBRAIN_PLAYLIST_PREFIX.length).trim();
  if (!suffix) {
    return null;
  }

  return suffix;
}

function normalizeBeatBrainSortKey(name: string) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function buildChoosePlaylistFromBeatBrainMeta(
  playlist: SpotifyPlaylistMeta,
): ChoosePlaylist | null {
  const suffix = normalizeBeatBrainPlaylistSuffix(playlist.name);
  if (!suffix) {
    return null;
  }

  const normalizedSuffix = normalizeBeatBrainSortKey(suffix);
  const isDecade = BEATBRAIN_DECADE_SUFFIXES.has(normalizedSuffix);
  const trackCount =
    typeof playlist.trackCount === 'number' && Number.isFinite(playlist.trackCount)
      ? Math.max(0, Math.floor(playlist.trackCount))
      : undefined;

  return {
    id: String(playlist.id ?? '').trim(),
    name:
      BEATBRAIN_DISPLAY_NAMES[normalizedSuffix] ??
      suffix.replace(/[_-]+/g, ' ').trim(),
    coverUrl: String(playlist.coverUrl ?? '').trim(),
    tags: [
      isDecade ? 'Decade' : 'Genre',
      ...(typeof trackCount === 'number' ? [`${trackCount} Songs`] : []),
    ],
    ...(isDecade ? { decadeTag: normalizedSuffix } : {}),
    categoryType: isDecade ? 'decade' : 'genre',
    ...(typeof trackCount === 'number' ? { trackCount } : {}),
  };
}

@Injectable()
export class ChooseService {
  private readonly logger = new Logger(ChooseService.name);

  constructor(private readonly spotifyService: SpotifyService) {}

  async getUserPlaylists(userId: string): Promise<ChoosePlaylist[]> {
    const cacheKey = String(userId ?? '').trim() || 'global';
    const rawPlaylists = await this.spotifyService.getCurrentUserPlaylistsMeta(userId);
    const playlists = rawPlaylists
      .map((playlist) => {
        const suffix = normalizeBeatBrainPlaylistSuffix(playlist.name);
        const choosePlaylist = buildChoosePlaylistFromBeatBrainMeta(playlist);
        if (!suffix || !choosePlaylist?.id) {
          return null;
        }

        return {
          choosePlaylist,
          sortKey: normalizeBeatBrainSortKey(suffix),
        };
      })
      .filter(
        (
          playlist,
        ): playlist is { choosePlaylist: ChoosePlaylist; sortKey: string } =>
          Boolean(playlist?.choosePlaylist?.id),
      )
      .sort((left, right) => {
        const leftIndex = BEATBRAIN_PLAYLIST_ORDER.indexOf(left.sortKey);
        const rightIndex = BEATBRAIN_PLAYLIST_ORDER.indexOf(right.sortKey);

        const normalizedLeftIndex =
          leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const normalizedRightIndex =
          rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex;
        }

        return left.choosePlaylist.name.localeCompare(right.choosePlaylist.name, 'de');
      })
      .map((playlist) => playlist.choosePlaylist);
    this.logger.log(
      `[choose] loaded beatbrain spotify playlists user=${cacheKey} total=${rawPlaylists.length} matched=${playlists.length}`,
    );

    return playlists.map((playlist) => ({ ...playlist }));
  }
}
