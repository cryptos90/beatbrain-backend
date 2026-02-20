import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { join } from 'path';
import { optionalEnv, requiredEnv } from '../config/env';

type SpotifyMe = {
  id: string;
  email?: string;
  display_name?: string;
};

type PendingAuth = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  clientType: 'mobile' | 'web';
  redirectOrigin?: string;
  createdAt: number;
};

type HostSession = {
  spotifyUserId: string;
  email: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: number;
};

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const AUTH_RESULT_TTL_MS = 60 * 1000;

type AuthResultPayload = {
  appJwt: string;
  spotifyAccessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

type PendingAuthResult = {
  code: string;
  payload: AuthResultPayload;
  createdAt: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly pendingAuthStates = new Map<string, PendingAuth>();
  private readonly pendingAuthResults = new Map<string, PendingAuthResult>();
  private hostSession: HostSession | null = null;
  private readonly devHostSessionCachePath = join(
    process.cwd(),
    '.dev-host-session.json',
  );

  constructor() {
    this.restoreHostSessionFromDevCache();
  }

  private get spotifyClientId(): string {
    return requiredEnv('SPOTIFY_CLIENT_ID');
  }

  private get spotifyRedirectUri(): string {
    return requiredEnv('SPOTIFY_REDIRECT_URI');
  }

  private get spotifyRedirectUriWeb(): string | undefined {
    return optionalEnv('SPOTIFY_REDIRECT_URI_WEB');
  }

  private get isDev(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  private get hostEmail(): string {
    return requiredEnv('HOST_EMAIL').trim().toLowerCase();
  }

  private get hostWebOrigin(): string | undefined {
    return optionalEnv('HOST_WEB_ORIGIN')?.trim();
  }

  private get defaultClientType(): 'mobile' | 'web' {
    const configured = optionalEnv('DEFAULT_CLIENT')?.trim().toLowerCase();
    return configured === 'web' ? 'web' : 'mobile';
  }

  private get jwtSecret(): string {
    return requiredEnv('JWT_SECRET');
  }

  private persistHostSessionToDevCache() {
    if (!this.isDev) {
      return;
    }

    try {
      if (!this.hostSession) {
        if (existsSync(this.devHostSessionCachePath)) {
          unlinkSync(this.devHostSessionCachePath);
        }
        return;
      }

      writeFileSync(
        this.devHostSessionCachePath,
        JSON.stringify(this.hostSession),
        'utf8',
      );
    } catch (error) {
      this.logger.warn('Could not persist host session to dev cache.');
    }
  }

  private restoreHostSessionFromDevCache() {
    if (!this.isDev) {
      return;
    }

    try {
      if (!existsSync(this.devHostSessionCachePath)) {
        return;
      }

      const raw = readFileSync(this.devHostSessionCachePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<HostSession>;

      const hasValidShape =
        typeof parsed.spotifyUserId === 'string' &&
        typeof parsed.email === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        typeof parsed.accessToken === 'string' &&
        typeof parsed.accessTokenExpiresAt === 'number';

      if (!hasValidShape) {
        return;
      }

      this.hostSession = {
        spotifyUserId: parsed.spotifyUserId as string,
        email: parsed.email as string,
        refreshToken: parsed.refreshToken as string,
        accessToken: parsed.accessToken as string,
        accessTokenExpiresAt: parsed.accessTokenExpiresAt as number,
      };
      this.logger.log('Restored host session from dev cache.');
    } catch (error) {
      this.logger.warn('Could not restore host session from dev cache.');
    }
  }

  private cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, entry] of this.pendingAuthStates.entries()) {
      if (now - entry.createdAt > AUTH_STATE_TTL_MS) {
        this.pendingAuthStates.delete(state);
      }
    }
  }

  private cleanupExpiredAuthResults() {
    const now = Date.now();
    for (const [code, entry] of this.pendingAuthResults.entries()) {
      if (now - entry.createdAt > AUTH_RESULT_TTL_MS) {
        this.pendingAuthResults.delete(code);
      }
    }
  }

  private createPkcePair() {
    const codeVerifier = randomBytes(64)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  private isValidMobileRedirectUri(value: string): boolean {
    return value === 'beatbrain-login://callback';
  }

  private isValidWebRedirectUri(value: string): boolean {
    const normalized = value.trim();
    if (!normalized || normalized.startsWith('exp://')) {
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return false;
    }

    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host === 'localhost' || host.startsWith('192.168.')) {
      return false;
    }

    if (protocol === 'http:') {
      const isLoopback = host === '127.0.0.1' || host === '::1' || host === '[::1]';
      return isLoopback && path === '/auth/spotify/callback';
    }

    if (protocol === 'https:') {
      return path.endsWith('/callback');
    }

    return false;
  }

  private resolveRedirectUri(clientType: 'mobile' | 'web'): string {
    if (clientType === 'web') {
      const webRedirect = this.spotifyRedirectUriWeb?.trim();
      if (!webRedirect) {
        throw new BadRequestException(
          'SPOTIFY_REDIRECT_URI_WEB is required for web Spotify login.',
        );
      }
      if (!this.isValidWebRedirectUri(webRedirect)) {
        throw new BadRequestException(
          'Invalid SPOTIFY_REDIRECT_URI_WEB. Use http://127.0.0.1:<PORT>/auth/spotify/callback, http://[::1]:<PORT>/auth/spotify/callback, or https://<domain>/.../callback.',
        );
      }
      return webRedirect;
    }

    const mobileRedirect = this.spotifyRedirectUri.trim();
    if (!this.isValidMobileRedirectUri(mobileRedirect)) {
      throw new BadRequestException(
        'Invalid SPOTIFY_REDIRECT_URI. Use beatbrain-login://callback for mobile.',
      );
    }
    return mobileRedirect;
  }

  private resolvePostAuthRedirect(
    clientType: 'mobile' | 'web',
    redirectOrigin?: string,
  ): string {
    if (clientType === 'mobile') {
      return this.spotifyRedirectUri;
    }

    const hostWebOrigin = redirectOrigin?.trim() || this.hostWebOrigin;
    if (!hostWebOrigin) {
      throw new BadRequestException(
        'HOST_WEB_ORIGIN is required for web Spotify callback redirect.',
      );
    }
    return hostWebOrigin;
  }

  private buildAuthCodeRedirectUrl(baseUrl: string, authCode: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}auth_code=${encodeURIComponent(authCode)}`;
  }

  private createAuthResultCode(payload: AuthResultPayload): string {
    this.cleanupExpiredAuthResults();
    const code = randomBytes(24).toString('hex');
    this.pendingAuthResults.set(code, {
      code,
      payload,
      createdAt: Date.now(),
    });
    return code;
  }

  private completeSpotifyAuthByState(input: {
    code: string;
    state: string;
    codeVerifier?: string;
  }): Promise<{
    payload: AuthResultPayload;
    pending: PendingAuth;
  }> {
    return this.handleSpotifyCallback(input).then((payload) => ({
      payload,
      pending: this.getConsumedPendingAuthState(input.state),
    }));
  }

  private consumedPendingAuthState = new Map<string, PendingAuth>();

  private getConsumedPendingAuthState(state: string): PendingAuth {
    const consumed = this.consumedPendingAuthState.get(state);
    if (!consumed) {
      throw new BadRequestException('Missing consumed auth state metadata');
    }
    this.consumedPendingAuthState.delete(state);
    return consumed;
  }

  private issueAppJwt(payload: { spotifyUserId: string; email: string }) {
    return jwt.sign(
      {
        sub: payload.spotifyUserId,
        email: payload.email,
        role: 'host',
      },
      this.jwtSecret,
      { expiresIn: '12h' },
    );
  }

  private async spotifyTokenRequest(
    body: Record<string, string>,
  ): Promise<Record<string, any>> {
    const form = new URLSearchParams(body);
    form.set('client_id', this.spotifyClientId);

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new UnauthorizedException(
        payload.error_description ?? payload.error ?? 'Spotify token exchange failed',
      );
    }
    return payload;
  }

  private async spotifyMe(accessToken: string): Promise<SpotifyMe> {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new UnauthorizedException(
        payload.error?.message ?? 'Spotify /me request failed',
      );
    }
    return payload as SpotifyMe;
  }

  createSpotifyAuthStart(input?: {
    clientType?: 'mobile' | 'web';
    redirectOrigin?: string;
  }) {
    this.cleanupExpiredStates();
    const state = randomBytes(24).toString('hex');
    const { codeVerifier, codeChallenge } = this.createPkcePair();
    const clientType =
      input?.clientType === 'web'
        ? 'web'
        : input?.clientType === 'mobile'
          ? 'mobile'
          : this.defaultClientType;
    const redirectUri = this.resolveRedirectUri(clientType);
    const redirectOrigin =
      clientType === 'web' ? input?.redirectOrigin?.trim() || undefined : undefined;

    this.pendingAuthStates.set(state, {
      state,
      codeVerifier,
      redirectUri,
      clientType,
      redirectOrigin,
      createdAt: Date.now(),
    });

    if (this.isDev) {
      this.logger.log(
        `Spotify auth start clientType=${clientType} redirect_uri=${redirectUri}`,
      );
    }

    const params = new URLSearchParams({
      client_id: this.spotifyClientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      scope:
        'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-modify-playback-state user-read-playback-state user-read-currently-playing',
    });

    return {
      authorizeUrl: `https://accounts.spotify.com/authorize?${params.toString()}`,
      state,
      redirectUri,
    };
  }

  async handleSpotifyCallback(input: {
    code: string;
    state: string;
    codeVerifier?: string;
  }) {
    this.cleanupExpiredStates();
    const pending = this.pendingAuthStates.get(input.state);
    if (!pending) {
      throw new BadRequestException('Invalid or expired auth state');
    }
    if (input.codeVerifier && pending.codeVerifier !== input.codeVerifier) {
      throw new BadRequestException('Invalid code_verifier');
    }

    this.pendingAuthStates.delete(input.state);
    this.consumedPendingAuthState.set(input.state, pending);
    const codeVerifier = pending.codeVerifier;

    const tokenPayload = await this.spotifyTokenRequest({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: pending.redirectUri,
      code_verifier: codeVerifier,
    });

    const accessToken = String(tokenPayload.access_token ?? '');
    const refreshToken = String(tokenPayload.refresh_token ?? '');
    const expiresInSeconds = Number(tokenPayload.expires_in ?? 3600);

    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException('Spotify did not return required tokens');
    }

    const me = await this.spotifyMe(accessToken);
    const email = (me.email ?? '').trim().toLowerCase();

    if (email !== this.hostEmail) {
      throw new ForbiddenException(
        'Only the registered host account is allowed to use this app.',
      );
    }

    this.hostSession = {
      spotifyUserId: me.id,
      email,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: Date.now() + expiresInSeconds * 1000 - 15_000,
    };
    this.persistHostSessionToDevCache();

    const appJwt = this.issueAppJwt({
      spotifyUserId: me.id,
      email,
    });

    return {
      appJwt,
      spotifyAccessToken: accessToken,
      expiresIn: expiresInSeconds,
      user: {
        id: me.id,
        email,
        displayName: me.display_name ?? '',
      },
    };
  }

  async exchangeSpotifyAuthCode(input: { code: string; state: string; codeVerifier?: string }) {
    const { payload } = await this.completeSpotifyAuthByState(input);
    return {
      authCode: this.createAuthResultCode(payload),
    };
  }

  async handleSpotifyCallbackRedirect(input: {
    code: string;
    state: string;
    codeVerifier?: string;
  }) {
    const { payload, pending } = await this.completeSpotifyAuthByState(input);
    const authCode = this.createAuthResultCode(payload);
    const redirectTarget = this.resolvePostAuthRedirect(
      pending.clientType,
      pending.redirectOrigin,
    );
    const redirectUrl = this.buildAuthCodeRedirectUrl(redirectTarget, authCode);

    if (this.isDev) {
      this.logger.log(
        `Spotify callback redirect clientType=${pending.clientType} redirect=${redirectTarget}`,
      );
    }

    return { redirectUrl };
  }

  consumeAuthResult(code: string) {
    this.cleanupExpiredAuthResults();
    const normalized = (code ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('Missing auth result code');
    }

    const pending = this.pendingAuthResults.get(normalized);
    if (!pending) {
      throw new BadRequestException('Invalid or expired auth result code');
    }

    this.pendingAuthResults.delete(normalized);
    return pending.payload;
  }

  verifyHostJwtOrThrow(authorizationHeader?: string) {
    const token = (authorizationHeader ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing host JWT');
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as {
        sub: string;
        email: string;
        role: string;
      };
      if (decoded.role !== 'host') {
        throw new UnauthorizedException('Host role required');
      }
      if ((decoded.email ?? '').toLowerCase() !== this.hostEmail) {
        throw new UnauthorizedException('JWT host email mismatch');
      }
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid host JWT');
    }
  }

  private async refreshSpotifyAccessToken() {
    if (!this.hostSession?.refreshToken) {
      throw new UnauthorizedException('No host refresh token available');
    }

    const tokenPayload = await this.spotifyTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.hostSession.refreshToken,
    });

    const accessToken = String(tokenPayload.access_token ?? '');
    const expiresInSeconds = Number(tokenPayload.expires_in ?? 3600);
    const nextRefresh = String(tokenPayload.refresh_token ?? '');
    if (!accessToken) {
      throw new UnauthorizedException('Refresh did not return access token');
    }

    this.hostSession = {
      ...this.hostSession,
      accessToken,
      refreshToken: nextRefresh || this.hostSession.refreshToken,
      accessTokenExpiresAt: Date.now() + expiresInSeconds * 1000 - 15_000,
    };
    this.persistHostSessionToDevCache();

    return {
      spotifyAccessToken: accessToken,
      expiresIn: expiresInSeconds,
      appJwt: this.issueAppJwt({
        spotifyUserId: this.hostSession.spotifyUserId,
        email: this.hostSession.email,
      }),
    };
  }

  async refreshFromJwt(authorizationHeader?: string) {
    this.verifyHostJwtOrThrow(authorizationHeader);
    return this.refreshSpotifyAccessToken();
  }

  async getValidHostSpotifyAccessToken() {
    if (!this.hostSession) {
      throw new UnauthorizedException('Host must authenticate with Spotify first');
    }

    if (Date.now() >= this.hostSession.accessTokenExpiresAt) {
      await this.refreshSpotifyAccessToken();
    }

    if (!this.hostSession?.accessToken) {
      throw new InternalServerErrorException('Host Spotify token unavailable');
    }
    return this.hostSession.accessToken;
  }

  async forceRefreshAfterUnauthorized() {
    return this.refreshSpotifyAccessToken();
  }

  hasHostSessionForDev() {
    return Boolean(this.hostSession);
  }
}
