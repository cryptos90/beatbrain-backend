import {
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SpotifyUnauthorizedError, spotifyFetch } from './spotifyHttp';

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  images: { url: string }[];
};

export type SpotifyPlaylistTrackItem = {
  track?: {
    id: string;
    name: string;
    preview_url: string | null;
    popularity: number;
    explicit: boolean;
    artists: { name: string }[];
    album: {
      name: string;
      release_date: string;
      images: { url: string }[];
    };
  };
};

type PlaylistTracksPage = {
  items: SpotifyPlaylistTrackItem[];
  next: string | null;
};

type CachedPlaylistTracks = {
  tracks: NonNullable<SpotifyPlaylistTrackItem['track']>[];
  expiresAt: number;
};

type CachedResolvedPlaylist = {
  playlist: {
    id: string;
    title: string;
    imageUrl: string;
  };
  expiresAt: number;
};

const PLAYLIST_TRACKS_CACHE_TTL_MS = 60_000;
const RESOLVE_PLAYLIST_CACHE_TTL_MS = 30_000;

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private readonly playlistTracksCache = new Map<string, CachedPlaylistTracks>();
  private readonly resolvePlaylistCache = new Map<string, CachedResolvedPlaylist>();
  private readonly playlistTracksInFlight = new Map<
    string,
    Promise<NonNullable<SpotifyPlaylistTrackItem['track']>[]>
  >();

  constructor(private readonly authService: AuthService) {}

  private async spotifyApiFetch<T>(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
  ): Promise<T> {
    const accessToken = await this.authService.getValidHostSpotifyAccessToken();
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : `https://api.spotify.com/v1${pathOrUrl}`;

    let response: Response;
    try {
      response = await spotifyFetch(url, options, {
        accessToken,
        endpointPath: pathOrUrl,
        logger: this.logger,
      });
    } catch (error) {
      if (error instanceof SpotifyUnauthorizedError && retryAfterRefresh) {
        await this.authService.forceRefreshAfterUnauthorized();
        return this.spotifyApiFetch<T>(pathOrUrl, options, false);
      }
      if (error instanceof SpotifyUnauthorizedError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;

      if (response.status === 429) {
        throw new HttpException(
          {
            statusCode: 429,
            message: payload?.error?.message ?? 'Spotify API rate limit reached',
            retryAfterSeconds:
              typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
                ? retryAfterSeconds
                : undefined,
          },
          429,
        );
      }

      throw new HttpException(
        {
          statusCode: response.status,
          message:
            payload?.error?.message ?? `Spotify API request failed (${response.status})`,
        },
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  private resolvePlaylistCacheKey(hostUserId: string, playlistId: string) {
    return `${hostUserId}:${playlistId}`;
  }

  async resolvePlaylists(hostUserId: string, playlistIds: string[]) {
    const uniqueIds = [...new Set(playlistIds.map((id) => id.trim()).filter(Boolean))];
    const now = Date.now();
    const results: Array<{ id: string; title: string; imageUrl: string }> = [];

    for (const id of uniqueIds) {
      const cacheKey = this.resolvePlaylistCacheKey(hostUserId, id);
      const cached = this.resolvePlaylistCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        results.push(cached.playlist);
        continue;
      }

      const playlist = await this.spotifyApiFetch<SpotifyPlaylistSummary>(
        `/playlists/${encodeURIComponent(id)}?fields=id,name,images(url)`,
      );
      const normalized = {
        id: playlist.id,
        title: playlist.name,
        imageUrl: playlist.images?.[0]?.url ?? '',
      };
      this.resolvePlaylistCache.set(cacheKey, {
        playlist: normalized,
        expiresAt: Date.now() + RESOLVE_PLAYLIST_CACHE_TTL_MS,
      });
      results.push(normalized);
    }

    return results;
  }

  async getPlaylist(playlistId: string) {
    const playlist = await this.spotifyApiFetch<SpotifyPlaylistSummary>(
      `/playlists/${encodeURIComponent(playlistId)}?fields=id,name,images(url)`,
    );
    return {
      id: playlist.id,
      title: playlist.name,
      imageUrl: playlist.images?.[0]?.url ?? '',
    };
  }

  async getAllPlaylistTracks(playlistId: string) {
    const now = Date.now();
    const cached = this.playlistTracksCache.get(playlistId);
    if (cached && cached.expiresAt > now) {
      return cached.tracks;
    }

    const inFlight = this.playlistTracksInFlight.get(playlistId);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.fetchAllPlaylistTracksUncached(playlistId);
    this.playlistTracksInFlight.set(playlistId, requestPromise);

    try {
      const tracks = await requestPromise;
      this.playlistTracksCache.set(playlistId, {
        tracks,
        expiresAt: Date.now() + PLAYLIST_TRACKS_CACHE_TTL_MS,
      });
      return tracks;
    } finally {
      this.playlistTracksInFlight.delete(playlistId);
    }
  }

  private async fetchAllPlaylistTracksUncached(playlistId: string) {
    let url: string | null = `/playlists/${encodeURIComponent(
      playlistId,
    )}/tracks?limit=100&fields=items(track(id,name,preview_url,popularity,explicit,artists(name),album(name,release_date,images(url)))),next`;
    const allItems: SpotifyPlaylistTrackItem[] = [];

    while (url) {
      const page = await this.spotifyApiFetch<PlaylistTracksPage>(url);
      allItems.push(...(page.items ?? []));
      url = page.next;
    }

    return allItems
      .map((item) => item.track)
      .filter((track): track is NonNullable<typeof track> => Boolean(track?.id));
  }
}
