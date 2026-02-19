import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SpotifyUnauthorizedError, spotifyFetch } from '../spotify/spotifyHttp';

const DEFAULT_TEST_PLAYLIST_ID = '37i9dQZF1DXcBWIGoYBM5M';

type PlaylistTestBody = {
  playlistId?: string;
};

type SpotifyErrorResult = {
  ok: false;
  status: number;
  reason: string;
  retryAfterSeconds?: number;
};

type SpotifyFetchResult = {
  response: Response;
  json: any;
};

@Controller('dev/spotify')
export class DevSpotifyController {
  private readonly logger = new Logger(DevSpotifyController.name);

  constructor(private readonly authService: AuthService) {}

  private isDevMode() {
    return process.env.NODE_ENV !== 'production';
  }

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

  private isSpotifyErrorResult(
    result: SpotifyFetchResult | SpotifyErrorResult,
  ): result is SpotifyErrorResult {
    return (result as SpotifyErrorResult).ok === false;
  }

  private async spotifyRequest(
    pathOrUrl: string,
    retryAfterUnauthorized = true,
  ): Promise<SpotifyFetchResult | SpotifyErrorResult> {
    let accessToken: string;
    try {
      accessToken = await this.authService.getValidHostSpotifyAccessToken();
    } catch {
      return { ok: false, status: 401, reason: 'no/expired token' };
    }

    const url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `https://api.spotify.com/v1${pathOrUrl}`;

    let response: Response;
    try {
      response = await spotifyFetch(
        url,
        {
          method: 'GET',
        },
        {
          accessToken,
          endpointPath: pathOrUrl,
          logger: this.logger,
        },
      );
    } catch (error) {
      if (error instanceof SpotifyUnauthorizedError && retryAfterUnauthorized) {
        try {
          await this.authService.forceRefreshAfterUnauthorized();
        } catch {
          return { ok: false, status: 401, reason: 'no/expired token' };
        }
        return this.spotifyRequest(pathOrUrl, false);
      }

      if (error instanceof SpotifyUnauthorizedError) {
        return { ok: false, status: error.status, reason: 'no/expired token' };
      }

      return { ok: false, status: 500, reason: 'spotify_request_failed' };
    }

    if ((response.status === 401 || response.status === 403) && retryAfterUnauthorized) {
      try {
        await this.authService.forceRefreshAfterUnauthorized();
      } catch {
        return { ok: false, status: response.status, reason: 'no/expired token' };
      }
      return this.spotifyRequest(pathOrUrl, false);
    }

    if (response.status === 429) {
      const retryAfterSeconds = this.parseRetryAfterSeconds(response);
      return {
        ok: false,
        status: 429,
        reason: 'rate_limited',
        ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
      };
    }

    if (!response.ok) {
      return { ok: false, status: response.status, reason: 'spotify_request_failed' };
    }

    const json = (await response.json().catch(() => ({}))) as any;
    return { response, json };
  }

  @Get('ping')
  async ping() {
    if (!this.isDevMode()) {
      return { ok: false, status: 403, reason: 'dev_endpoint_disabled' };
    }

    const me = await this.spotifyRequest('/me');
    if (this.isSpotifyErrorResult(me)) {
      return me;
    }

    return {
      ok: true,
      id: String(me.json?.id ?? ''),
      display_name: String(me.json?.display_name ?? ''),
    };
  }

  @Post('playlistTest')
  async playlistTest(@Body() body?: PlaylistTestBody) {
    if (!this.isDevMode()) {
      return { ok: false, status: 403, reason: 'dev_endpoint_disabled' };
    }

    const playlistId = body?.playlistId?.trim() || DEFAULT_TEST_PLAYLIST_ID;

    const playlistInfo = await this.spotifyRequest(
      `/playlists/${encodeURIComponent(playlistId)}?fields=name,tracks.total`,
    );
    if (this.isSpotifyErrorResult(playlistInfo)) {
      return playlistInfo;
    }

    const trackSample = await this.spotifyRequest(
      `/playlists/${encodeURIComponent(
        playlistId,
      )}/tracks?limit=5&fields=items(track(name,artists(name)))`,
    );
    if (this.isSpotifyErrorResult(trackSample)) {
      return trackSample;
    }

    const sampleTracks = Array.isArray(trackSample.json?.items)
      ? trackSample.json.items
          .map((item: any) => ({
            name: String(item?.track?.name ?? ''),
            artists: Array.isArray(item?.track?.artists)
              ? item.track.artists
                  .map((artist: any) => String(artist?.name ?? '').trim())
                  .filter(Boolean)
              : [],
          }))
          .filter((track: { name: string }) => Boolean(track.name))
          .slice(0, 5)
      : [];

    return {
      ok: true,
      playlistId,
      playlistName: String(playlistInfo.json?.name ?? ''),
      totalTracks: Number(playlistInfo.json?.tracks?.total ?? 0),
      sampleTracks,
    };
  }

  @Get('mePlaylists')
  async mePlaylists() {
    if (!this.isDevMode()) {
      return { ok: false, status: 403, reason: 'dev_endpoint_disabled' };
    }

    const result = await this.spotifyRequest(
      '/me/playlists?limit=5&fields=items(id,name,tracks(total))',
    );
    if (this.isSpotifyErrorResult(result)) {
      return result;
    }

    const items = Array.isArray(result.json?.items)
      ? result.json.items.map((item: any) => ({
          id: String(item?.id ?? ''),
          name: String(item?.name ?? ''),
          totalTracks: Number(item?.tracks?.total ?? 0),
        }))
      : [];

    return {
      ok: true,
      playlists: items,
    };
  }
}
