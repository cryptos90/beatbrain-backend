import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

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

const PLAYLIST_TRACKS_CACHE_TTL_MS = 60_000;
const MAX_RATE_LIMIT_RETRY_DELAY_SECONDS = 3;

@Injectable()
export class SpotifyService {
  private readonly playlistTracksCache = new Map<string, CachedPlaylistTracks>();
  private readonly playlistTracksInFlight = new Map<
    string,
    Promise<NonNullable<SpotifyPlaylistTrackItem['track']>[]>
  >();

  constructor(private readonly authService: AuthService) {}

  private async spotifyApiFetch<T>(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
    retryAfterRateLimit = true,
  ): Promise<T> {
    const accessToken = await this.authService.getValidHostSpotifyAccessToken();
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : `https://api.spotify.com/v1${pathOrUrl}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401 && retryAfterRefresh) {
      await this.authService.forceRefreshAfterUnauthorized();
      return this.spotifyApiFetch<T>(pathOrUrl, options, false, retryAfterRateLimit);
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;

      if (
        retryAfterRateLimit &&
        typeof retryAfterSeconds === 'number' &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds >= 0 &&
        retryAfterSeconds <= MAX_RATE_LIMIT_RETRY_DELAY_SECONDS
      ) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
        return this.spotifyApiFetch<T>(pathOrUrl, options, retryAfterRefresh, false);
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Spotify API rate limit reached',
          retryAfterSeconds:
            typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)
              ? retryAfterSeconds
              : undefined,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as any;
      throw new UnauthorizedException(
        payload?.error?.message ??
          `Spotify API request failed (${response.status})`,
      );
    }

    return (await response.json()) as T;
  }

  async resolvePlaylists(playlistIds: string[]) {
    const uniqueIds = [...new Set(playlistIds.map((id) => id.trim()).filter(Boolean))];
    const results = await Promise.all(
      uniqueIds.map(async (id) => {
        const playlist = await this.spotifyApiFetch<SpotifyPlaylistSummary>(
          `/playlists/${encodeURIComponent(id)}?fields=id,name,images(url)`,
        );
        return {
          id: playlist.id,
          title: playlist.name,
          imageUrl: playlist.images?.[0]?.url ?? '',
        };
      }),
    );
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
