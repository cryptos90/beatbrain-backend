import {
  BadRequestException,
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
    uri?: string;
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

export type MinimalTrack = {
  id: string;
  uri: string;
  name: string;
  artistName: string;
  albumName: string;
  coverUrl: string;
  year: string;
  explicit: boolean;
  popularity: number;
};

export type PlaylistTrackPageMinimalStats = {
  itemsCount: number;
  nullTrackCount: number;
  localTrackCount: number;
  missingIdOrUriCount: number;
};

export type PlaylistTrackPageMinimalResult = {
  total: number;
  next: string | null;
  mappedTracks: MinimalTrack[];
  stats: PlaylistTrackPageMinimalStats;
};

export type SpotifyPlaylistMeta = {
  id: string;
  name: string;
  coverUrl: string;
};

type PlaylistTracksPage = {
  items: SpotifyPlaylistTrackItem[];
  next: string | null;
};

type PlaylistTrackTotalResponse = {
  tracks?: {
    total?: number;
  };
};

type PlaylistTracksMinimalPage = {
  items?: Array<{
    track?: {
      id?: string;
      uri?: string;
      name?: string;
      artists?: { name?: string }[];
      album?: {
        name?: string;
        release_date?: string;
        images?: { url?: string }[];
      };
    };
  }>;
  total?: number;
  next?: string | null;
};

type SpotifyDevicesResponse = {
  devices?: SpotifyPlaybackDevice[];
};

export type SpotifyPlaybackDevice = {
  id: string;
  is_active: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
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

  private parseRetryAfterSeconds(response: Response) {
    const retryAfterHeader = response.headers.get('Retry-After');
    if (!retryAfterHeader) {
      return undefined;
    }
    const parsed = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }
    return parsed;
  }

  private extractReleaseYear(rawDate: string | undefined) {
    const value = String(rawDate ?? '').trim();
    if (!value) {
      return '';
    }

    const maybeYear = value.slice(0, 4);
    if (!/^\d{4}$/.test(maybeYear)) {
      return '';
    }
    return maybeYear;
  }

  private async spotifyApiRequest(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
  ): Promise<Response> {
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
      if (
        error instanceof SpotifyUnauthorizedError &&
        error.status === 401 &&
        retryAfterRefresh
      ) {
        await this.authService.forceRefreshAfterUnauthorized();
        return this.spotifyApiRequest(pathOrUrl, options, false);
      }
      if (error instanceof SpotifyUnauthorizedError && error.status === 401) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof SpotifyUnauthorizedError) {
        throw new HttpException(
          {
            statusCode: error.status,
            message: `Spotify API authorization failed (${error.status})`,
          },
          error.status,
        );
      }
      throw error;
    }

    return response;
  }

  private async spotifyApiFetch<T>(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
  ): Promise<T> {
    const response = await this.spotifyApiRequest(
      pathOrUrl,
      options,
      retryAfterRefresh,
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
      const retryAfterSeconds = this.parseRetryAfterSeconds(response);

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

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
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

      try {
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
      } catch (error) {
        if (
          error instanceof HttpException &&
          (error.getStatus() === 400 || error.getStatus() === 404)
        ) {
          this.logger.warn(
            `[resolve] playlist not found/inaccessible/invalid, skipping id=${id}`,
          );
          continue;
        }
        throw error;
      }
    }

    return results;
  }

  async getPlaylist(playlistId: string) {
    const playlist = await this.getPlaylistMeta(playlistId);
    return {
      id: playlist.id,
      title: playlist.name,
      imageUrl: playlist.coverUrl,
    };
  }

  async getPlaylistMeta(playlistId: string): Promise<SpotifyPlaylistMeta> {
    const normalizedPlaylistId = (playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const playlist = await this.spotifyApiFetch<SpotifyPlaylistSummary>(
      `/playlists/${encodeURIComponent(normalizedPlaylistId)}?fields=id,name,images(url)`,
    );
    return {
      id: String(playlist.id ?? normalizedPlaylistId),
      name: String(playlist.name ?? ''),
      coverUrl: String(playlist.images?.[0]?.url ?? ''),
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

  async getPlaylistTrackTotal(playlistId: string) {
    const normalizedPlaylistId = (playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const payload = await this.spotifyApiFetch<PlaylistTrackTotalResponse>(
      `/playlists/${encodeURIComponent(normalizedPlaylistId)}?fields=tracks.total`,
    );
    return Number(payload?.tracks?.total ?? 0);
  }

  async getPlaylistTrackPageMinimal(
    playlistId: string,
    offset: number,
    limit: number,
  ): Promise<PlaylistTrackPageMinimalResult> {
    const normalizedPlaylistId = (playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

    const page = await this.spotifyApiFetch<PlaylistTracksMinimalPage>(
      `/playlists/${encodeURIComponent(
        normalizedPlaylistId,
      )}/tracks?limit=${safeLimit}&offset=${safeOffset}&market=from_token&fields=items(track(id,uri,name,artists(name),album(name,release_date,images(url)))),total,next`,
    );

    const stats: PlaylistTrackPageMinimalStats = {
      itemsCount: 0,
      nullTrackCount: 0,
      localTrackCount: 0,
      missingIdOrUriCount: 0,
    };
    const mappedTracks: MinimalTrack[] = [];
    const items = Array.isArray(page.items) ? page.items : [];
    stats.itemsCount = items.length;

    for (const item of items) {
      const track = item?.track;
      if (!track) {
        stats.nullTrackCount += 1;
        continue;
      }

      const uri = String(track.uri ?? '').trim();
      if (uri.toLowerCase().startsWith('spotify:local:')) {
        stats.localTrackCount += 1;
        continue;
      }

      const id = String(track.id ?? '').trim();
      if (!id || !uri) {
        stats.missingIdOrUriCount += 1;
        continue;
      }

      mappedTracks.push({
        id,
        uri,
        name: String(track.name ?? ''),
        artistName: String(track.artists?.[0]?.name ?? ''),
        albumName: String(track.album?.name ?? ''),
        coverUrl: String(track.album?.images?.[0]?.url ?? ''),
        year: this.extractReleaseYear(track.album?.release_date),
        explicit: false,
        popularity: 0,
      });
    }

    return {
      total: Number(page.total ?? 0),
      next: page.next ?? null,
      mappedTracks,
      stats,
    };
  }

  async getDevices() {
    const payload = await this.spotifyApiFetch<SpotifyDevicesResponse>('/me/player/devices');
    return (payload.devices ?? []).map((device) => ({
      id: String(device.id ?? ''),
      is_active: Boolean(device.is_active),
      is_restricted: Boolean(device.is_restricted),
      name: String(device.name ?? ''),
      type: String(device.type ?? ''),
    }));
  }

  async startPlayback(trackUri: string, deviceId?: string) {
    const normalizedTrackUri = String(trackUri ?? '').trim();
    if (!normalizedTrackUri) {
      throw new BadRequestException('Missing track URI');
    }

    let resolvedDeviceId = String(deviceId ?? '').trim();
    if (!resolvedDeviceId) {
      try {
        const devices = await this.getDevices();
        const preferred =
          devices.find((device) => device.is_active) ??
          devices.find((device) => !device.is_restricted);
        if (preferred?.id) {
          resolvedDeviceId = preferred.id;
        }
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 401) {
          throw new UnauthorizedException('Spotify authorization failed. Please login again.');
        }
        if (error instanceof HttpException && error.getStatus() === 403) {
          throw new HttpException(
            {
              statusCode: 403,
              message: 'Playback requires Spotify Premium / missing scope.',
            },
            403,
          );
        }
        throw error;
      }
    }

    const query = resolvedDeviceId
      ? `?device_id=${encodeURIComponent(resolvedDeviceId)}`
      : '';
    const path = `/me/player/play${query}`;

    try {
      const response = await this.spotifyApiRequest(path, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: [normalizedTrackUri],
          position_ms: 0,
        }),
      });

      if (response.status === 404) {
        throw new HttpException(
          {
            statusCode: 404,
            message: 'No active Spotify device. Open Spotify and start playing something once.',
          },
          404,
        );
      }

      if (response.status === 403) {
        throw new HttpException(
          {
            statusCode: 403,
            message: 'Playback requires Spotify Premium / missing scope.',
          },
          403,
        );
      }

      if (response.status === 401) {
        throw new UnauthorizedException('Spotify authorization failed. Please login again.');
      }

      if (response.status === 429) {
        const retryAfterSeconds = this.parseRetryAfterSeconds(response);
        throw new HttpException(
          {
            statusCode: 429,
            message: 'Spotify API rate limit reached',
            retryAfterSeconds,
          },
          429,
        );
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
        throw new HttpException(
          {
            statusCode: response.status,
            message:
              payload?.error?.message ??
              payload?.message ??
              `Spotify playback request failed (${response.status})`,
          },
          response.status,
        );
      }

      return {
        ok: true,
        deviceId: resolvedDeviceId || null,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        if (error.getStatus() === 404) {
          throw new HttpException(
            {
              statusCode: 404,
              message: 'No active Spotify device. Open Spotify and start playing something once.',
            },
            404,
          );
        }
        if (error.getStatus() === 403) {
          throw new HttpException(
            {
              statusCode: 403,
              message: 'Playback requires Spotify Premium / missing scope.',
            },
            403,
          );
        }
      }
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException('Spotify authorization failed. Please login again.');
      }
      throw error;
    }
  }
}
