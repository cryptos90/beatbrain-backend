import { Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SpotifyService } from './spotify.service';

@Controller(['spotify', 'api/spotify'])
export class SpotifyController {
  constructor(
    private readonly authService: AuthService,
    private readonly spotifyService: SpotifyService,
  ) {}

  @Post('playlists/resolve')
  async resolvePlaylists(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: { playlistIds?: string[] },
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    const playlistIds = body.playlistIds ?? [];
    return {
      playlists: await this.spotifyService.resolvePlaylists(jwt.sub, playlistIds),
    };
  }

  @Get('playlists/:id')
  async getPlaylist(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('id') playlistId: string,
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.spotifyService.getPlaylist(playlistId);
  }

  @Get('playlists/:id/tracks')
  async getPlaylistTracks(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('id') playlistId: string,
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    const tracks = await this.spotifyService.getAllPlaylistTracks(playlistId);
    return { tracks };
  }

  @Put('player/play')
  async playTrackMinimal(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: { trackUri?: string; deviceId?: string; positionMs?: number },
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.spotifyService.playTrack({
      trackUri: body.trackUri ?? '',
      deviceId: body.deviceId,
      positionMs: body.positionMs,
      hostUserId: jwt.sub,
    });
  }

  @Put('player/transfer')
  async transferPlayback(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: { deviceId?: string; play?: boolean },
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.spotifyService.transferPlayback({
      deviceId: body.deviceId ?? '',
      play: body.play,
      hostUserId: jwt.sub,
    });
  }

  @Get('player/devices')
  async getPlayerDevices(
    @Headers('authorization') authorizationHeader: string | undefined,
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return {
      devices: await this.spotifyService.getPlayerDevices(),
    };
  }

  @Post('playback/play')
  async playTrack(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: { trackUri?: string; deviceId?: string; positionMs?: number },
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.spotifyService.startPlayback(
      body.trackUri ?? '',
      body.deviceId,
      body.positionMs,
      jwt.sub,
    );
  }

  @Post('playback/pause')
  async pausePlayback(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: { deviceId?: string },
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.spotifyService.pausePlayback(body.deviceId, jwt.sub);
  }
}
