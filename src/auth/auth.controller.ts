import { Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('spotify/start')
  startSpotifyAuth(
    @Query('client') client?: 'mobile' | 'web',
    @Body() body?: { clientType?: 'mobile' | 'web'; redirectOrigin?: string },
  ) {
    return this.authService.createSpotifyAuthStart({
      clientType: client ?? body?.clientType,
      redirectOrigin: body?.redirectOrigin,
    });
  }

  @Post('spotify/login')
  loginSpotifyAuth(
    @Query('client') client?: 'mobile' | 'web',
    @Body() body?: { clientType?: 'mobile' | 'web'; redirectOrigin?: string },
  ) {
    return this.startSpotifyAuth(client, body);
  }

  @Get('spotify/callback')
  async handleSpotifyCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('code_verifier') codeVerifier?: string,
    @Res() res?: Response,
  ) {
    let result: { redirectUrl: string };
    try {
      result = await this.authService.handleSpotifyCallbackRedirect({
        code,
        state,
        codeVerifier,
      });
    } catch (error: any) {
      if (
        res &&
        typeof error?.message === 'string' &&
        error.message.includes('HOST_WEB_ORIGIN is required')
      ) {
        return res
          .status(500)
          .type('text/plain')
          .send(
            'HOST_WEB_ORIGIN not set; start Expo Web and set HOST_WEB_ORIGIN to its URL.',
          );
      }
      throw error;
    }

    if (!res) {
      return result;
    }
    return res.redirect(302, result.redirectUrl);
  }

  @Post('spotify/exchange')
  exchangeSpotifyCode(
    @Body() body: { code: string; state: string; codeVerifier?: string },
  ) {
    return this.authService.exchangeSpotifyAuthCode({
      code: body.code,
      state: body.state,
      codeVerifier: body.codeVerifier,
    });
  }

  @Get('result')
  getAuthResult(@Query('code') code: string) {
    return this.authService.consumeAuthResult(code);
  }

  @Post('refresh')
  refresh(@Headers('authorization') authorizationHeader?: string) {
    return this.authService.refreshFromJwt(authorizationHeader);
  }

  @Get('spotify/token')
  spotifyToken(@Headers('authorization') authorizationHeader?: string) {
    return this.authService.getSpotifyAccessTokenForSdk(authorizationHeader);
  }

  @Get('spotify/status')
  spotifyStatus(@Headers('authorization') authorizationHeader?: string) {
    return this.authService.getHostSpotifyStatus(authorizationHeader);
  }

  @Get('me')
  me(@Headers('authorization') authorizationHeader?: string) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return {
      id: jwt.sub,
      email: jwt.email,
      role: jwt.role,
    };
  }
}
