import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { QuizSongMinimal } from '../quiz/types/quizSong';
import { AuthService } from '../auth/auth.service';
import { SpotifyUnauthorizedError, spotifyFetch } from './spotifyHttp';

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  images: { url: string }[];
  owner?: {
    id?: string;
  };
  tracks?: {
    total?: number;
  };
};

type SpotifyCurrentUserPlaylistsPage = {
  items?: SpotifyPlaylistSummary[];
  next?: string | null;
  total?: number;
};

export type SpotifyPlaylistTrackEntity = {
  type?: string;
  id?: string;
  uri?: string;
  name?: string;
  preview_url?: string | null;
  duration_ms?: number;
  popularity?: number;
  explicit?: boolean;
  artists?: { id?: string; name?: string }[];
  album?: {
    id?: string;
    name?: string;
    release_date?: string;
    images?: { url?: string }[];
  };
};

export type SpotifyPlaylistTrackItem = {
  item?: SpotifyPlaylistTrackEntity | null;
  track?: SpotifyPlaylistTrackEntity | null;
  is_local?: boolean;
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
  items?: SpotifyPlaylistTrackItem[];
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

export type SpotifyPlayerDeviceSummary = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

type CachedPlaylistTracks = {
  tracks: SpotifyPlaylistTrackEntity[];
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
const LAST_KNOWN_PLAYBACK_DEVICE_TTL_MS = 30 * 60_000;

type SpotifyRequestContext = {
  playlistId?: string;
  skipForbiddenDiagnostics?: boolean;
  action?: 'spotify_meta' | 'spotify_items';
};

type PlaylistForbiddenDiagnosis = {
  reason: string;
  tokenUserId?: string;
  playlistOwnerId?: string;
  spotifyMessage?: string;
};

type SpotifyApiRequestResult = {
  response: Response;
  endpointPath: string;
  tokenFingerprint: string;
};

@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private readonly playlistTracksCache = new Map<string, CachedPlaylistTracks>();
  private readonly resolvePlaylistCache = new Map<string, CachedResolvedPlaylist>();
  private readonly lastSeedOffsetByPlaylist = new Map<string, number>();
  private readonly playbackDeviceByHost = new Map<
    string,
    { id: string; expiresAt: number }
  >();
  private readonly playlistTracksInFlight = new Map<
    string,
    Promise<SpotifyPlaylistTrackEntity[]>
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

  private async getUserSpotifyAccessTokenOrThrow(): Promise<string> {
    const token = await this.authService.getValidHostSpotifyAccessToken();
    const normalized = String(token ?? '').trim();
    if (!normalized) {
      throw new UnauthorizedException('Spotify access token unavailable');
    }
    return normalized;
  }

  private buildTokenFingerprint(accessToken: string) {
    return createHash('sha256').update(accessToken).digest('hex').slice(0, 8);
  }

  private resolveSpotifyEndpointPath(pathOrUrl: string) {
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    if (!isAbsolute) {
      return `/v1${pathOrUrl}`;
    }

    try {
      const parsed = new URL(pathOrUrl);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return pathOrUrl;
    }
  }

  private buildPlaylistItemsEndpoint(playlistId: string, query: string) {
    const normalizedQuery = String(query ?? '').trim();
    const querySuffix = normalizedQuery ? `?${normalizedQuery}` : '';
    return `/playlists/${encodeURIComponent(playlistId)}/items${querySuffix}`;
  }

  private async fetchPlaylistItems<T>(
    playlistId: string,
    query: string,
    context?: SpotifyRequestContext,
  ): Promise<T> {
    const endpoint = this.buildPlaylistItemsEndpoint(playlistId, query);
    return this.spotifyApiFetch<T>(endpoint, undefined, true, context);
  }

  private logSpotifyCallStart(
    context: SpotifyRequestContext | undefined,
    endpointPath: string,
    tokenFingerprint: string,
  ) {
    if (!context?.action) {
      return;
    }

    this.logger.log(
      `[spotify-debug] ${JSON.stringify({
        action: context.action,
        playlistId: context.playlistId ?? null,
        endpointPath,
        tokenFingerprint,
      })}`,
    );
  }

  private async logSpotifyCallError(
    context: SpotifyRequestContext | undefined,
    input: {
      endpointPath: string;
      tokenFingerprint: string;
      statusCode: number;
      spotifyMessage?: string;
    },
  ) {
    if (!context?.action) {
      return;
    }

    const shouldAttachTokenUserId =
      (input.statusCode === 401 || input.statusCode === 403) &&
      !context.skipForbiddenDiagnostics;
    const tokenUserId = shouldAttachTokenUserId
      ? await this.tryResolveSpotifyTokenUserId()
      : null;

    this.logger.warn(
      `[spotify-debug] ${JSON.stringify({
        action: context.action,
        playlistId: context.playlistId ?? null,
        endpointPath: input.endpointPath,
        statusCode: input.statusCode,
        spotifyMessage: input.spotifyMessage ?? null,
        tokenFingerprint: input.tokenFingerprint,
        tokenUserId: tokenUserId ?? null,
      })}`,
    );
  }

  private async spotifyApiRequest(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
    context?: SpotifyRequestContext,
  ): Promise<SpotifyApiRequestResult> {
    const accessToken = await this.getUserSpotifyAccessTokenOrThrow();
    const tokenFingerprint = this.buildTokenFingerprint(accessToken);
    const endpointPath = this.resolveSpotifyEndpointPath(pathOrUrl);
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute ? pathOrUrl : `https://api.spotify.com${endpointPath}`;

    this.logSpotifyCallStart(context, endpointPath, tokenFingerprint);

    let response: Response;
    try {
      response = await spotifyFetch(url, options, {
        accessToken,
        endpointPath,
        logger: this.logger,
      });
    } catch (error) {
      if (error instanceof SpotifyUnauthorizedError && error.status === 401) {
        await this.logSpotifyCallError(context, {
          endpointPath,
          tokenFingerprint,
          statusCode: 401,
          spotifyMessage: error.message,
        });
      }

      if (
        error instanceof SpotifyUnauthorizedError &&
        error.status === 401 &&
        retryAfterRefresh
      ) {
        await this.authService.forceRefreshAfterUnauthorized();
        return this.spotifyApiRequest(pathOrUrl, options, false, context);
      }
      if (error instanceof SpotifyUnauthorizedError && error.status === 401) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    return {
      response,
      endpointPath,
      tokenFingerprint,
    };
  }

  private async spotifyApiFetch<T>(
    pathOrUrl: string,
    options?: RequestInit,
    retryAfterRefresh = true,
    context?: SpotifyRequestContext,
  ): Promise<T> {
    const { response, endpointPath, tokenFingerprint } = await this.spotifyApiRequest(
      pathOrUrl,
      options,
      retryAfterRefresh,
      context,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let payload: Record<string, any> | undefined;
      if (text) {
        try {
          payload = JSON.parse(text) as Record<string, any>;
        } catch {
          payload = undefined;
        }
      }
      const retryAfterSeconds = this.parseRetryAfterSeconds(response);
      const spotifyMessage = this.extractSpotifyErrorMessage(
        payload,
        response.status,
        response.statusText,
      );

      await this.logSpotifyCallError(context, {
        endpointPath,
        tokenFingerprint,
        statusCode: response.status,
        spotifyMessage,
      });

      if (response.status === 429) {
        throw new HttpException(
          {
            statusCode: 429,
            message: spotifyMessage,
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
          message: spotifyMessage,
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
    statusText?: string,
  ) {
    const raw =
      payload?.error?.message ??
      payload?.message ??
      payload?.error_description ??
      payload?.error;
    const normalized = String(raw ?? '').trim();
    const fallbackStatusText = String(statusText ?? '').trim();
    return normalized || fallbackStatusText || `Spotify API request failed (${status})`;
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

  private buildPlaylistForbiddenHttpException(
    playlistId: string,
    diagnosis: PlaylistForbiddenDiagnosis,
    fallbackMessage?: string,
  ) {
    const reason = String(diagnosis.reason ?? '').trim();
    const spotifyMessage = diagnosis.spotifyMessage ?? fallbackMessage;
    const basePayload = {
      reason,
      spotifyStatus: 403,
      spotifyMessage,
      tokenUserId: diagnosis.tokenUserId,
      playlistOwnerId: diagnosis.playlistOwnerId,
      playlistId,
    };

    if (reason === 'ACCOUNT_MISMATCH' || reason === 'INSUFFICIENT_SCOPE') {
      return new HttpException(
        {
          statusCode: 409,
          message: 'Spotify re-auth required',
          ...basePayload,
        },
        409,
      );
    }

    return new HttpException(
      {
        statusCode: 403,
        message: spotifyMessage || 'Spotify playlist access forbidden',
        ...basePayload,
      },
      403,
    );
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

  async getCurrentUserPlaylistsMeta(
    expectedOwnerUserId?: string,
  ): Promise<SpotifyPlaylistMeta[]> {
    const playlists: SpotifyPlaylistMeta[] = [];
    const seenPlaylistIds = new Set<string>();
    const normalizedExpectedOwnerId = String(expectedOwnerUserId ?? '')
      .trim()
      .toLowerCase();
    const tokenUserId = await this.tryResolveSpotifyTokenUserId();
    const ownerUserId =
      normalizedExpectedOwnerId || String(tokenUserId ?? '').trim().toLowerCase();
    if (!ownerUserId) {
      this.logger.warn(
        '[choose] could not resolve current spotify user id, returning no playable playlists',
      );
      return playlists;
    }

    let nextPath: string | null =
      '/me/playlists?limit=50&fields=items(id,name,images(url),owner(id),tracks(total)),next,total';

    while (nextPath) {
      const page = await this.spotifyApiFetch<SpotifyCurrentUserPlaylistsPage>(
        nextPath,
      );

      const items = Array.isArray(page?.items) ? page.items : [];
      for (const item of items) {
        const id = String(item?.id ?? '').trim();
        const ownerId = String(item?.owner?.id ?? '')
          .trim()
          .toLowerCase();
        if (!ownerId || ownerId !== ownerUserId) {
          continue;
        }
        if (!id || seenPlaylistIds.has(id)) {
          continue;
        }

        const reportedTrackTotal = Number(item?.tracks?.total ?? NaN);
        let hasPlayableTracks = Number.isFinite(reportedTrackTotal)
          ? reportedTrackTotal > 0
          : false;

        // Spotify can report tracks.total=0 for some user playlists even though items exist.
        // Fallback probe keeps choose-list usable for those playlists.
        if (!hasPlayableTracks) {
          try {
            hasPlayableTracks = await this.playlistHasPlayableTracks(id);
          } catch {
            hasPlayableTracks = false;
          }
        }

        if (!hasPlayableTracks) {
          continue;
        }

        seenPlaylistIds.add(id);
        playlists.push({
          id,
          name: String(item?.name ?? '').trim(),
          coverUrl: String(item?.images?.[0]?.url ?? '').trim(),
        });
      }

      const rawNextPath = String(page?.next ?? '').trim();
      nextPath = rawNextPath || null;
    }

    return playlists;
  }

  private async playlistHasPlayableTracks(playlistId: string) {
    const query =
      'limit=1&offset=0&market=from_token&fields=items(item(type,id,uri)),total,next';
    const page = await this.fetchPlaylistItems<PlaylistTracksMinimalPage>(playlistId, query, {
      playlistId,
    });

    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      const track = this.resolvePlaylistTrackEntity(item);
      if (!track) {
        continue;
      }

      const id = String(track.id ?? '').trim();
      const uri = String(track.uri ?? '').trim().toLowerCase();
      if (id && uri && !uri.startsWith('spotify:local:')) {
        return true;
      }
    }

    return false;
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

    const endpointPath = `/playlists/${encodeURIComponent(
      normalizedPlaylistId,
    )}?fields=id,name,images(url)`;
    const playlist = await this.spotifyApiFetch<SpotifyPlaylistSummary>(
      endpointPath,
      undefined,
      true,
      { playlistId: normalizedPlaylistId, action: 'spotify_meta' },
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
    const query =
      'limit=100&fields=items(item(type,id,uri,name,preview_url,duration_ms,popularity,explicit,artists(name),album(name,release_date,images(url)))),next';
    const allItems: SpotifyPlaylistTrackItem[] = [];
    let page = await this.fetchPlaylistItems<PlaylistTracksPage>(playlistId, query, {
      playlistId,
    });

    while (true) {
      allItems.push(...(page.items ?? []));
      const nextUrl = String(page.next ?? '').trim();
      if (!nextUrl) {
        break;
      }
      page = await this.spotifyApiFetch<PlaylistTracksPage>(nextUrl, undefined, true, {
        playlistId,
      });
    }

    return allItems
      .map((item) => this.resolvePlaylistTrackEntity(item))
      .filter((track): track is SpotifyPlaylistTrackEntity => Boolean(track?.id));
  }

  private resolvePlaylistTrackEntity(item: SpotifyPlaylistTrackItem): SpotifyPlaylistTrackEntity | null {
    const candidate = item?.item ?? item?.track ?? null;
    if (!candidate) {
      return null;
    }

    const type = String(candidate.type ?? '').trim().toLowerCase();
    if (type && type !== 'track') {
      return null;
    }

    return candidate;
  }

  mapPlaylistTrackItemToQuizSongMinimal(
    item: SpotifyPlaylistTrackItem,
  ): QuizSongMinimal | null {
    const track = this.resolvePlaylistTrackEntity(item);
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
    const parsedReleaseYear = /^\d{4}/.test(releaseDate)
      ? Number.parseInt(releaseDate.slice(0, 4), 10)
      : null;
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
      ...(typeof parsedReleaseYear === 'number' && Number.isFinite(parsedReleaseYear)
        ? { releaseYear: parsedReleaseYear }
        : {}),
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
    const totalTracks = await this.getPlaylistTrackTotal(normalizedPlaylistId);
    const maxOffset = Math.max(0, totalTracks - limit);
    const candidateOffsets: number[] = [];
    if (maxOffset <= 0) {
      candidateOffsets.push(0);
    } else {
      for (let offset = 0; offset <= maxOffset; offset += limit) {
        candidateOffsets.push(offset);
      }
      if (candidateOffsets[candidateOffsets.length - 1] !== maxOffset) {
        candidateOffsets.push(maxOffset);
      }
    }
    let randomOffset =
      candidateOffsets[Math.floor(Math.random() * candidateOffsets.length)] ?? 0;
    const lastOffset = this.lastSeedOffsetByPlaylist.get(normalizedPlaylistId);
    if (
      candidateOffsets.length > 1 &&
      typeof lastOffset === 'number' &&
      Number.isFinite(lastOffset) &&
      randomOffset === lastOffset
    ) {
      const alternatives = candidateOffsets.filter((value) => value !== lastOffset);
      randomOffset =
        alternatives[Math.floor(Math.random() * alternatives.length)] ?? randomOffset;
    }
    this.lastSeedOffsetByPlaylist.set(normalizedPlaylistId, randomOffset);

    let page: PlaylistTracksSeedSongsPage;
    const songs: QuizSongMinimal[] = [];
    const seenTrackIds = new Set<string>();
    const query =
      `limit=${limit}&offset=${randomOffset}&market=from_token&` +
      'fields=items(item(type,id,uri,name,artists(name),album(name,images(url),release_date),duration_ms,preview_url,explicit,popularity)),total,next,limit,offset';

    try {
      page = await this.fetchPlaylistItems<PlaylistTracksSeedSongsPage>(
        normalizedPlaylistId,
        query,
        { playlistId: normalizedPlaylistId, action: 'spotify_items' },
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 403) {
        const extractedMessage = this.extractHttpExceptionMessage(error);
        const diagnose = await this.diagnosePlaylistForbidden(
          normalizedPlaylistId,
          extractedMessage,
        );
        throw this.buildPlaylistForbiddenHttpException(
          normalizedPlaylistId,
          diagnose,
          extractedMessage,
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
      `[seed-load] playlist=${normalizedPlaylistId} requested=${limit} offset=${randomOffset} loaded=${songs.length} total=${Number(
        page.total ?? totalTracks ?? 0,
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
        throw this.buildPlaylistForbiddenHttpException(
          normalizedPlaylistId,
          diagnose,
          extractedMessage,
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
    const query =
      `limit=${safeLimit}&offset=${safeOffset}&market=from_token&` +
      'fields=items(item(type,id,uri,name,artists(name),album(name,release_date,images(url)))),total,next';

    let page: PlaylistTracksMinimalPage;
    try {
      page = await this.fetchPlaylistItems<PlaylistTracksMinimalPage>(
        normalizedPlaylistId,
        query,
        { playlistId: normalizedPlaylistId },
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 403) {
        const extractedMessage = this.extractHttpExceptionMessage(error);
        const diagnose = await this.diagnosePlaylistForbidden(
          normalizedPlaylistId,
          extractedMessage,
        );
        throw this.buildPlaylistForbiddenHttpException(
          normalizedPlaylistId,
          diagnose,
          extractedMessage,
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
      const track = this.resolvePlaylistTrackEntity(item);
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

  private normalizeHostUserId(hostUserId?: string) {
    return String(hostUserId ?? '').trim();
  }

  private getCachedPlaybackDeviceId(hostUserId?: string) {
    const hostKey = this.normalizeHostUserId(hostUserId);
    if (!hostKey) {
      return null;
    }

    const cached = this.playbackDeviceByHost.get(hostKey);
    if (!cached) {
      return null;
    }

    if (Date.now() >= cached.expiresAt) {
      this.playbackDeviceByHost.delete(hostKey);
      return null;
    }

    const normalizedId = String(cached.id ?? '').trim();
    if (!normalizedId) {
      this.playbackDeviceByHost.delete(hostKey);
      return null;
    }

    return normalizedId;
  }

  private setCachedPlaybackDeviceId(hostUserId: string | undefined, deviceId: string) {
    const hostKey = this.normalizeHostUserId(hostUserId);
    const normalizedDeviceId = String(deviceId ?? '').trim();
    if (!hostKey || !normalizedDeviceId) {
      return;
    }

    this.playbackDeviceByHost.set(hostKey, {
      id: normalizedDeviceId,
      expiresAt: Date.now() + LAST_KNOWN_PLAYBACK_DEVICE_TTL_MS,
    });
  }

  private clearCachedPlaybackDeviceId(
    hostUserId: string | undefined,
    deviceIdToMatch?: string,
  ) {
    const hostKey = this.normalizeHostUserId(hostUserId);
    if (!hostKey) {
      return;
    }

    const cached = this.playbackDeviceByHost.get(hostKey);
    if (!cached) {
      return;
    }

    const maybeMatch = String(deviceIdToMatch ?? '').trim();
    if (!maybeMatch || cached.id === maybeMatch) {
      this.playbackDeviceByHost.delete(hostKey);
    }
  }

  private async parseSpotifyResponsePayload<T = Record<string, any>>(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) {
      return undefined as T | undefined;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T | undefined;
    }
  }

  private throwPlaybackError(params: {
    statusCode: number;
    code: string;
    message: string;
    retryAfterSeconds?: number;
  }): never {
    throw new HttpException(
      {
        statusCode: params.statusCode,
        code: params.code,
        message: params.message,
        ...(typeof params.retryAfterSeconds === 'number' &&
        Number.isFinite(params.retryAfterSeconds)
          ? { retryAfterSeconds: params.retryAfterSeconds }
          : {}),
      },
      params.statusCode,
    );
  }

  private handlePlaybackRequestException(error: unknown): never {
    if (error instanceof UnauthorizedException) {
      this.throwPlaybackError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Spotify authorization failed. Please login again.',
      });
    }
    throw error;
  }

  private async sendPlaybackStartRequest(params: {
    trackUri: string;
    deviceId?: string;
    positionMs?: number;
  }) {
    const normalizedDeviceId = String(params.deviceId ?? '').trim();
    const normalizedTrackUri = String(params.trackUri ?? '').trim();
    const rawPositionMs = Number(params.positionMs ?? 0);
    const includePositionMs = Number.isFinite(rawPositionMs) && rawPositionMs >= 0;
    const positionMs = includePositionMs ? Math.floor(rawPositionMs) : 0;
    const query = normalizedDeviceId
      ? `?device_id=${encodeURIComponent(normalizedDeviceId)}`
      : '';

    const { response } = await this.spotifyApiRequest(`/me/player/play${query}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uris: [normalizedTrackUri],
        ...(includePositionMs ? { position_ms: positionMs } : {}),
      }),
    });

    return response;
  }

  private async sendPlaybackPauseRequest(deviceId?: string) {
    const normalizedDeviceId = String(deviceId ?? '').trim();
    const query = normalizedDeviceId
      ? `?device_id=${encodeURIComponent(normalizedDeviceId)}`
      : '';
    const { response } = await this.spotifyApiRequest(`/me/player/pause${query}`, {
      method: 'PUT',
    });
    return response;
  }

  private resolvePlaybackDeviceId(inputDeviceId?: string, hostUserId?: string) {
    const explicit = String(inputDeviceId ?? '').trim();
    if (explicit) {
      return explicit;
    }
    return this.getCachedPlaybackDeviceId(hostUserId) ?? '';
  }

  async getPlayerDevices(): Promise<SpotifyPlayerDeviceSummary[]> {
    let response: Response;
    try {
      ({ response } = await this.spotifyApiRequest('/me/player/devices', {
        method: 'GET',
      }));
    } catch (error) {
      this.handlePlaybackRequestException(error);
    }

    if (response.status === 403) {
      this.throwPlaybackError({
        statusCode: 403,
        code: 'FORBIDDEN_OR_SCOPE',
        message: 'Playback requires Spotify Premium / missing scope.',
      });
    }

    if (response.status === 429) {
      this.throwPlaybackError({
        statusCode: 429,
        code: 'RATE_LIMIT',
        message: 'Spotify API rate limit reached',
        retryAfterSeconds: this.parseRetryAfterSeconds(response),
      });
    }

    if (!response.ok) {
      const payload = await this.parseSpotifyResponsePayload<Record<string, any>>(response);
      this.throwPlaybackError({
        statusCode: response.status,
        code: 'SPOTIFY_DEVICES_FAILED',
        message: this.extractSpotifyErrorMessage(
          payload,
          response.status,
          response.statusText,
        ),
      });
    }

    const payload = await this.parseSpotifyResponsePayload<SpotifyDevicesResponse>(response);
    const devices = Array.isArray(payload?.devices) ? payload.devices : [];
    return devices
      .map((device) => ({
        id: String(device?.id ?? '').trim(),
        name: String(device?.name ?? '').trim(),
        type: String(device?.type ?? '').trim(),
        is_active: Boolean(device?.is_active),
      }))
      .filter((device) => Boolean(device.id));
  }

  async getDevices() {
    return this.getPlayerDevices();
  }

  async playTrack(input: {
    trackUri: string;
    deviceId?: string;
    positionMs?: number;
    hostUserId?: string;
  }) {
    const normalizedTrackUri = String(input.trackUri ?? '').trim();
    if (!normalizedTrackUri) {
      throw new BadRequestException('Missing track URI');
    }

    const normalizedHostUserId = this.normalizeHostUserId(input.hostUserId);
    const resolvedDeviceId = this.resolvePlaybackDeviceId(
      input.deviceId,
      normalizedHostUserId,
    );

    let response: Response;
    try {
      response = await this.sendPlaybackStartRequest({
        trackUri: normalizedTrackUri,
        deviceId: resolvedDeviceId,
        positionMs: input.positionMs,
      });
    } catch (error) {
      this.handlePlaybackRequestException(error);
    }

    if (response.status === 429) {
      this.throwPlaybackError({
        statusCode: 429,
        code: 'RATE_LIMIT',
        message: 'Spotify API rate limit reached',
        retryAfterSeconds: this.parseRetryAfterSeconds(response),
      });
    }

    if (response.status === 403) {
      this.throwPlaybackError({
        statusCode: 403,
        code: 'FORBIDDEN_OR_SCOPE',
        message: 'Playback requires Spotify Premium / missing scope.',
      });
    }

    if (!response.ok) {
      const payload = await this.parseSpotifyResponsePayload<Record<string, any>>(response);
      const spotifyMessage = this.extractSpotifyErrorMessage(
        payload,
        response.status,
        response.statusText,
      );
      const isNoActiveDevice =
        response.status === 404 || spotifyMessage.toLowerCase().includes('no active device');

      if (isNoActiveDevice) {
        this.clearCachedPlaybackDeviceId(normalizedHostUserId, resolvedDeviceId);
        this.throwPlaybackError({
          statusCode: 404,
          code: 'NO_ACTIVE_DEVICE',
          message:
            spotifyMessage ||
            'No active Spotify device. Open Spotify and start playing something once.',
        });
      }

      this.throwPlaybackError({
        statusCode: response.status,
        code: 'SPOTIFY_PLAY_FAILED',
        message: spotifyMessage,
      });
    }

    if (resolvedDeviceId) {
      this.setCachedPlaybackDeviceId(normalizedHostUserId, resolvedDeviceId);
    }

    return {
      ok: true,
      deviceId: resolvedDeviceId || null,
    };
  }

  async startPlayback(
    trackUri: string,
    deviceId?: string,
    positionMs?: number,
    hostUserId?: string,
  ) {
    return this.playTrack({
      trackUri,
      deviceId,
      positionMs,
      hostUserId,
    });
  }

  async pausePlayback(deviceId?: string, hostUserId?: string) {
    const normalizedHostUserId = this.normalizeHostUserId(hostUserId);
    const resolvedDeviceId = this.resolvePlaybackDeviceId(
      deviceId,
      normalizedHostUserId,
    );

    let response: Response;
    try {
      response = await this.sendPlaybackPauseRequest(resolvedDeviceId);
    } catch (error) {
      this.handlePlaybackRequestException(error);
    }

    if (response.status === 404) {
      this.clearCachedPlaybackDeviceId(normalizedHostUserId, resolvedDeviceId);
      return {
        ok: true,
        paused: false,
        deviceId: resolvedDeviceId || null,
      };
    }

    if (response.status === 429) {
      this.throwPlaybackError({
        statusCode: 429,
        code: 'RATE_LIMIT',
        message: 'Spotify API rate limit reached',
        retryAfterSeconds: this.parseRetryAfterSeconds(response),
      });
    }

    if (response.status === 403) {
      this.throwPlaybackError({
        statusCode: 403,
        code: 'FORBIDDEN_OR_SCOPE',
        message: 'Playback requires Spotify Premium / missing scope.',
      });
    }

    if (!response.ok) {
      const payload = await this.parseSpotifyResponsePayload<Record<string, any>>(response);
      this.throwPlaybackError({
        statusCode: response.status,
        code: 'SPOTIFY_PAUSE_FAILED',
        message: this.extractSpotifyErrorMessage(
          payload,
          response.status,
          response.statusText,
        ),
      });
    }

    if (resolvedDeviceId) {
      this.setCachedPlaybackDeviceId(normalizedHostUserId, resolvedDeviceId);
    }

    return {
      ok: true,
      paused: true,
      deviceId: resolvedDeviceId || null,
    };
  }
}
