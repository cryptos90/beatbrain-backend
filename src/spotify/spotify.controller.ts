import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SpotifyService } from './spotify.service';

@Controller('spotify')
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
}
