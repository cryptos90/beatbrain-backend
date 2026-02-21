import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { QuizSongMinimal } from '../quiz/types/quizSong';
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
    preview_url?: string | null;
    duration_ms?: number;
    popularity?: number;
    explicit?: boolean;
    artists?: { id?: string; name?: string }[];
    album: {
      id?: string;
      name?: string;
      release_date?: string;
      images?: { url?: string }[];
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

type PlaylistTracksSeedSongsPage = {
  items?: SpotifyPlaylistTrackItem[];
  total?: number;
};

type SpotifyMeResponse = {
  id?: string;
};

type SpotifyPlaylistOwnerResponse = {
  owner?: {
    id?: string;
  };
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

type SpotifyRequestContext = {
  playlistId?: string;
  skipForbiddenDiagnostics?: boolean;
};

type PlaylistForbiddenDiagnosis = {
  reason: string;
  tokenUserId?: string;
  playlistOwnerId?: string;
  spotifyMessage?: string;
};

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
      throw error;
    }

    return response;
  }

  private async spotifyApiFetch<T>(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
    context?: SpotifyRequestContext,
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
          message: this.extractSpotifyErrorMessage(payload, response.status),
        },
        response.status,
      );
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private extractSpotifyErrorMessage(
    payload: Record<string, any> | undefined,
    status: number,
  ) {
    const raw =
      payload?.error?.message ??
      payload?.message ??
      payload?.error_description ??
      payload?.error;
    const normalized = String(raw ?? '').trim();
    return normalized || `Spotify API request failed (${status})`;
  }

  private async tryResolveSpotifyTokenUserId() {
    try {
      const me = await this.spotifyApiFetch<SpotifyMeResponse>(
        '/me?fields=id',
        undefined,
        true,
        { skipForbiddenDiagnostics: true },
      );
      const id = String(me?.id ?? '').trim();
      return id || null;
    } catch {
      return null;
    }
  }

  private extractHttpExceptionMessage(error: HttpException) {
    const payload = error.getResponse();
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const message = (payload as Record<string, any>).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && typeof message[0] === 'string') {
        return message[0];
      }
    }
    return undefined;
  }

  private async diagnosePlaylistForbidden(
    playlistId: string,
    spotifyMessage?: string,
  ): Promise<PlaylistForbiddenDiagnosis> {
    const normalizedPlaylistId = String(playlistId ?? '').trim();
    const normalizedMessage = String(spotifyMessage ?? '').trim();

    const tokenUserId = await this.tryResolveSpotifyTokenUserId();
    const playlistOwnerId = normalizedPlaylistId
      ? await this.tryResolvePlaylistOwnerId(normalizedPlaylistId)
      : null;

    const lcMessage = normalizedMessage.toLowerCase();
    let reason = 'UNKNOWN_FORBIDDEN';
    if (lcMessage.includes('scope') || lcMessage.includes('insufficient')) {
      reason = 'INSUFFICIENT_SCOPE';
    } else if (
      tokenUserId &&
      playlistOwnerId &&
      tokenUserId !== playlistOwnerId
    ) {
      reason = 'ACCOUNT_MISMATCH';
    } else if (
      lcMessage.includes('not accessible') ||
      lcMessage.includes('not found')
    ) {
      reason = 'PLAYLIST_NOT_ACCESSIBLE';
    }

    return {
      reason,
      ...(tokenUserId ? { tokenUserId } : {}),
      ...(playlistOwnerId ? { playlistOwnerId } : {}),
      ...(normalizedMessage ? { spotifyMessage: normalizedMessage } : {}),
    };
  }

  private async tryResolvePlaylistOwnerId(playlistId: string) {
    const normalizedPlaylistId = String(playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      return null;
    }

    try {
      const payload = await this.spotifyApiFetch<SpotifyPlaylistOwnerResponse>(
        `/playlists/${encodeURIComponent(normalizedPlaylistId)}?fields=owner(id)`,
        undefined,
        true,
        {
          playlistId: normalizedPlaylistId,
          skipForbiddenDiagnostics: true,
        },
      );
      const ownerId = String(payload?.owner?.id ?? '').trim();
      return ownerId || null;
    } catch {
      return null;
    }
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
          undefined,
          true,
          { playlistId: id },
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
      undefined,
      true,
      { playlistId: normalizedPlaylistId },
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
      const page = await this.spotifyApiFetch<PlaylistTracksPage>(
        url,
        undefined,
        true,
        { playlistId },
      );
      allItems.push(...(page.items ?? []));
      url = page.next;
    }

    return allItems
      .map((item) => item.track)
      .filter((track): track is NonNullable<typeof track> => Boolean(track?.id));
  }

  mapPlaylistTrackItemToQuizSongMinimal(
    item: SpotifyPlaylistTrackItem,
  ): QuizSongMinimal | null {
    const track = item?.track;
    if (!track) {
      return null;
    }

    const spotifyTrackId = String(track.id ?? '').trim();
    if (!spotifyTrackId) {
      return null;
    }

    const uri = String(track.uri ?? '').trim().toLowerCase();
    if (uri.startsWith('spotify:local:')) {
      return null;
    }

    const artists = Array.isArray(track.artists)
      ? track.artists
          .map((artist) => String(artist?.name ?? '').trim())
          .filter(Boolean)
      : [];

    const albumImageUrl = String(track.album?.images?.[0]?.url ?? '').trim();
    const albumName = String(track.album?.name ?? '').trim();
    const releaseDate = String(track.album?.release_date ?? '').trim();
    const previewUrl = String(track.preview_url ?? '').trim();
    const explicit = track.explicit;
    const popularity = track.popularity;

    return {
      spotifyTrackId,
      name: String(track.name ?? '').trim(),
      artists,
      albumName,
      ...(albumImageUrl ? { coverUrl: albumImageUrl } : {}),
      ...(releaseDate ? { releaseDate } : {}),
      durationMs:
        typeof track.duration_ms === 'number' && Number.isFinite(track.duration_ms)
          ? Math.max(0, Math.floor(track.duration_ms))
          : 0,
      ...(previewUrl ? { previewUrl } : {}),
      ...(typeof explicit === 'boolean' ? { explicit } : {}),
      ...(typeof popularity === 'number' ? { popularity } : {}),
    };
  }

  async getPlaylistQuizSeedSongs(
    playlistId: string,
    questionCount: number,
  ): Promise<QuizSongMinimal[]> {
    const normalizedPlaylistId = String(playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const safeQuestionCount = Number.isFinite(questionCount)
      ? Math.max(1, Math.floor(questionCount))
      : 1;
    const limit = Math.max(1, Math.min(100, safeQuestionCount * 4));

    let page: PlaylistTracksSeedSongsPage;
    const songs: QuizSongMinimal[] = [];
    const seenTrackIds = new Set<string>();

    try {
      page = await this.spotifyApiFetch<PlaylistTracksSeedSongsPage>(
        `/playlists/${encodeURIComponent(
          normalizedPlaylistId,
        )}/tracks?limit=${limit}&offset=0&market=from_token&fields=items(track(id,uri,name,artists(name),album(name,images(url),release_date),duration_ms,preview_url,explicit,popularity)),total`,
        undefined,
        true,
        { playlistId: normalizedPlaylistId },
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 403) {
        const extractedMessage = this.extractHttpExceptionMessage(error);
        const diagnose = await this.diagnosePlaylistForbidden(
          normalizedPlaylistId,
          extractedMessage,
        );
        throw new HttpException(
          {
            statusCode: 409,
            message: 'Spotify re-auth required',
            reason: diagnose.reason,
            spotifyStatus: 403,
            spotifyMessage: diagnose.spotifyMessage ?? extractedMessage,
            tokenUserId: diagnose.tokenUserId,
            playlistOwnerId: diagnose.playlistOwnerId,
            playlistId: normalizedPlaylistId,
          },
          409,
        );
      }
      throw error;
    }

    const items = Array.isArray(page.items) ? page.items : [];
    for (const item of items) {
      const song = this.mapPlaylistTrackItemToQuizSongMinimal(item);
      if (!song) {
        continue;
      }
      if (seenTrackIds.has(song.spotifyTrackId)) {
        continue;
      }
      seenTrackIds.add(song.spotifyTrackId);
      songs.push(song);
    }

    this.logger.log(
      `[seed-load] playlist=${normalizedPlaylistId} requested=${limit} loaded=${songs.length} total=${Number(
        page.total ?? 0,
      )}`,
    );

    return songs;
  }

  async getPlaylistTrackTotal(playlistId: string) {
    const normalizedPlaylistId = (playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    let payload: PlaylistTrackTotalResponse;
    try {
      payload = await this.spotifyApiFetch<PlaylistTrackTotalResponse>(
        `/playlists/${encodeURIComponent(normalizedPlaylistId)}?fields=tracks.total`,
        undefined,
        true,
        { playlistId: normalizedPlaylistId },
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 403) {
        const extractedMessage = this.extractHttpExceptionMessage(error);
        const diagnose = await this.diagnosePlaylistForbidden(
          normalizedPlaylistId,
          extractedMessage,
        );
        throw new HttpException(
          {
            statusCode: 409,
            message: 'Spotify re-auth required',
            reason: diagnose.reason,
            spotifyStatus: 403,
            spotifyMessage: diagnose.spotifyMessage ?? extractedMessage,
            tokenUserId: diagnose.tokenUserId,
            playlistOwnerId: diagnose.playlistOwnerId,
            playlistId: normalizedPlaylistId,
          },
          409,
        );
      }
      throw error;
    }
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

    let page: PlaylistTracksMinimalPage;
    try {
      page = await this.spotifyApiFetch<PlaylistTracksMinimalPage>(
        `/playlists/${encodeURIComponent(
          normalizedPlaylistId,
        )}/tracks?limit=${safeLimit}&offset=${safeOffset}&market=from_token&fields=items(track(id,uri,name,artists(name),album(name,release_date,images(url)))),total,next`,
        undefined,
        true,
        { playlistId: normalizedPlaylistId },
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 403) {
        const extractedMessage = this.extractHttpExceptionMessage(error);
        const diagnose = await this.diagnosePlaylistForbidden(
          normalizedPlaylistId,
          extractedMessage,
        );
        throw new HttpException(
          {
            statusCode: 409,
            message: 'Spotify re-auth required',
            reason: diagnose.reason,
            spotifyStatus: 403,
            spotifyMessage: diagnose.spotifyMessage ?? extractedMessage,
            tokenUserId: diagnose.tokenUserId,
            playlistOwnerId: diagnose.playlistOwnerId,
            playlistId: normalizedPlaylistId,
          },
          409,
        );
      }
      throw error;
    }

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
