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
  product?: string;
};

type HostSpotifyStatus = {
  connected: boolean;
  canUseWebPlayback: boolean | null;
  needsReconnect: boolean;
  missingPremium: boolean;
  missingPlaybackScope: boolean;
  scopeStatus: 'granted' | 'missing' | 'unknown';
  webPlaybackStatus: 'ready' | 'blocked' | 'unknown';
  product?: string;
  message: string;
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
  grantedScopes: string[];
  grantedScopesKnown: boolean;
};

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const AUTH_RESULT_TTL_MS = 60 * 1000;
const HOST_SPOTIFY_STATUS_CACHE_TTL_MS = 15_000;
const HOST_WEB_PLAYBACK_REQUIRED_SCOPES = [
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state',
];
const SPOTIFY_AUTH_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'app-remote-control',
  'streaming',
];

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
  private hostSpotifyStatusCache:
    | {
        key: string;
        expiresAt: number;
        status: HostSpotifyStatus;
      }
    | null = null;
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

  private normalizeGrantedScopes(input: unknown): string[] {
    const raw =
      typeof input === 'string'
        ? input.split(/\s+/)
        : Array.isArray(input)
          ? input
          : [];

    return [...new Set(raw.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  }

  private resolveGrantedScopes(
    input: unknown,
    fallbackScopes?: string[],
  ): { scopes: string[]; known: boolean } {
    const normalized = this.normalizeGrantedScopes(input);
    if (normalized.length > 0) {
      return {
        scopes: normalized,
        known: true,
      };
    }

    const fallback = this.normalizeGrantedScopes(fallbackScopes ?? []);
    if (fallback.length > 0) {
      return {
        scopes: fallback,
        known: true,
      };
    }

    return {
      scopes: [],
      known: false,
    };
  }

  private hasRequiredHostWebPlaybackScopes(scopes: string[]) {
    return HOST_WEB_PLAYBACK_REQUIRED_SCOPES.every((scope) =>
      scopes.includes(scope),
    );
  }

  private getMissingHostWebPlaybackScopes(scopes: string[]) {
    return HOST_WEB_PLAYBACK_REQUIRED_SCOPES.filter(
      (scope) => !scopes.includes(scope),
    );
  }

  private buildMissingPlaybackScopeMessage(scopes: string[]) {
    const missingScopes = this.getMissingHostWebPlaybackScopes(scopes);
    const missingList = missingScopes.join(', ');
    return missingList
      ? `Die aktuelle Spotify-Anmeldung erlaubt das Laden von Playlists, aber noch kein Browser-Playback. Bitte den Host-Browser erneut mit Spotify verbinden. Fehlender Spotify-Scope: ${missingList}.`
      : 'Die aktuelle Spotify-Anmeldung erlaubt das Laden von Playlists, aber noch kein Browser-Playback. Bitte den Host-Browser erneut mit Spotify verbinden.';
  }

  private buildHostSpotifyStatusCacheKey(
    accessToken: string,
    product: string,
    scopeStatus: HostSpotifyStatus['scopeStatus'],
  ) {
    return `${createHash('sha256')
      .update(accessToken)
      .digest('hex')
      .slice(0, 12)}:${product}:${scopeStatus}`;
  }

  private getCachedHostSpotifyStatus(cacheKey: string) {
    const cached = this.hostSpotifyStatusCache;
    if (!cached) {
      return null;
    }

    if (Date.now() >= cached.expiresAt) {
      this.hostSpotifyStatusCache = null;
      return null;
    }

    if (cached.key !== cacheKey) {
      return null;
    }

    return cached.status;
  }

  private setCachedHostSpotifyStatus(cacheKey: string, status: HostSpotifyStatus) {
    this.hostSpotifyStatusCache = {
      key: cacheKey,
      expiresAt: Date.now() + HOST_SPOTIFY_STATUS_CACHE_TTL_MS,
      status,
    };
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
        grantedScopes: this.normalizeGrantedScopes(parsed.grantedScopes),
        grantedScopesKnown:
          typeof parsed.grantedScopesKnown === 'boolean'
            ? parsed.grantedScopesKnown
            : this.normalizeGrantedScopes(parsed.grantedScopes).length > 0,
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

  private extractSpotifyApiMessage(payload: Record<string, any> | undefined, fallback: string) {
    const message =
      payload?.error?.message ??
      payload?.message ??
      payload?.error_description ??
      payload?.error;
    const normalized = String(message ?? '').trim();
    return normalized || fallback;
  }

  private async spotifyPlaybackCapabilityCheck(accessToken: string) {
    const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    return {
      ok: response.ok,
      status: response.status,
      message: this.extractSpotifyApiMessage(
        payload,
        `Spotify playback capability check failed (${response.status})`,
      ),
    };
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
      scope: SPOTIFY_AUTH_SCOPES.join(' '),
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
    const grantedScopes = this.resolveGrantedScopes(
      tokenPayload.scope,
      SPOTIFY_AUTH_SCOPES,
    );

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
      grantedScopes: grantedScopes.scopes,
      grantedScopesKnown: grantedScopes.known,
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
    const scopeWasReturned = Object.prototype.hasOwnProperty.call(
      tokenPayload,
      'scope',
    );
    const nextScopeState = scopeWasReturned
      ? this.resolveGrantedScopes(tokenPayload.scope)
      : {
          scopes: this.hostSession.grantedScopes,
          known: this.hostSession.grantedScopesKnown,
        };
    if (!accessToken) {
      throw new UnauthorizedException('Refresh did not return access token');
    }

    this.hostSession = {
      ...this.hostSession,
      accessToken,
      refreshToken: nextRefresh || this.hostSession.refreshToken,
      accessTokenExpiresAt: Date.now() + expiresInSeconds * 1000 - 15_000,
      grantedScopes: nextScopeState.scopes,
      grantedScopesKnown: nextScopeState.known,
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

  private async getHostWebPlaybackScopeState() {
    if (!this.hostSession) {
      return {
        scopes: [] as string[],
        status: 'missing' as const,
      };
    }

    const scopes = this.normalizeGrantedScopes(this.hostSession.grantedScopes);
    if (!this.hostSession.grantedScopesKnown) {
      return {
        scopes,
        status: 'unknown' as const,
      };
    }

    return {
      scopes,
      status: this.hasRequiredHostWebPlaybackScopes(scopes)
        ? ('granted' as const)
        : ('missing' as const),
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

  private buildReconnectStatus(message: string): HostSpotifyStatus {
    return {
      connected: false,
      canUseWebPlayback: false,
      needsReconnect: true,
      missingPremium: false,
      missingPlaybackScope: false,
      scopeStatus: 'unknown',
      webPlaybackStatus: 'blocked',
      message,
    };
  }

  private buildBlockedStatus(input: {
    message: string;
    product?: string;
    missingPremium?: boolean;
    missingPlaybackScope?: boolean;
    needsReconnect?: boolean;
    scopeStatus?: HostSpotifyStatus['scopeStatus'];
  }): HostSpotifyStatus {
    return {
      connected: !input.needsReconnect,
      canUseWebPlayback: false,
      needsReconnect: Boolean(input.needsReconnect),
      missingPremium: Boolean(input.missingPremium),
      missingPlaybackScope: Boolean(input.missingPlaybackScope),
      scopeStatus: input.scopeStatus ?? 'unknown',
      webPlaybackStatus: 'blocked',
      ...(input.product ? { product: input.product } : {}),
      message: input.message,
    };
  }

  private buildUnknownStatus(input: {
    message: string;
    product?: string;
    missingPremium?: boolean;
    missingPlaybackScope?: boolean;
    scopeStatus?: HostSpotifyStatus['scopeStatus'];
  }): HostSpotifyStatus {
    return {
      connected: true,
      canUseWebPlayback: null,
      needsReconnect: false,
      missingPremium: Boolean(input.missingPremium),
      missingPlaybackScope: Boolean(input.missingPlaybackScope),
      scopeStatus: input.scopeStatus ?? 'unknown',
      webPlaybackStatus: 'unknown',
      ...(input.product ? { product: input.product } : {}),
      message: input.message,
    };
  }

  private buildReadyStatus(input: {
    message: string;
    product?: string;
  }): HostSpotifyStatus {
    return {
      connected: true,
      canUseWebPlayback: true,
      needsReconnect: false,
      missingPremium: false,
      missingPlaybackScope: false,
      scopeStatus: 'granted',
      webPlaybackStatus: 'ready',
      ...(input.product ? { product: input.product } : {}),
      message: input.message,
    };
  }

  private throwForBlockedSpotifyStatus(status: HostSpotifyStatus): never {
    if (status.needsReconnect) {
      throw new UnauthorizedException(status.message);
    }

    if (status.missingPremium || status.missingPlaybackScope) {
      throw new ForbiddenException(status.message);
    }

    throw new ForbiddenException(
      status.message || 'Spotify browser playback is currently blocked.',
    );
  }

  private async evaluateHostSpotifyPlayback(
    authorizationHeader?: string,
  ): Promise<{
    status: HostSpotifyStatus;
    accessToken: string | null;
    expiresIn: number;
  }> {
    this.verifyHostJwtOrThrow(authorizationHeader);

    if (!this.hostSession) {
      return {
        status: this.buildReconnectStatus(
          'Die Spotify-Verbindung des Hosts ist nicht mehr vorhanden. Bitte den Host-Browser erneut mit Spotify verbinden.',
        ),
        accessToken: null,
        expiresIn: 0,
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.getValidHostSpotifyAccessToken();
    } catch {
      return {
        status: this.buildReconnectStatus(
          'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.',
        ),
        accessToken: null,
        expiresIn: 0,
      };
    }

    const expiresAt = this.hostSession?.accessTokenExpiresAt ?? Date.now();
    const expiresIn = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));

    let me: SpotifyMe;
    try {
      me = await this.spotifyMe(accessToken);
    } catch {
      return {
        status: this.buildReconnectStatus(
          'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.',
        ),
        accessToken: null,
        expiresIn: 0,
      };
    }

    const product = String(me.product ?? '').trim().toLowerCase();
    const missingPremium = Boolean(product) && product !== 'premium';
    if (missingPremium) {
      return {
        status: this.buildBlockedStatus({
          message:
            'Browser-Playback im Host-Modus benötigt Spotify Premium auf dem Host-Account.',
          product,
          missingPremium: true,
          scopeStatus: 'unknown',
        }),
        accessToken,
        expiresIn,
      };
    }

    const scopeState = await this.getHostWebPlaybackScopeState();
    if (scopeState.status === 'missing') {
      return {
        status: this.buildBlockedStatus({
          message: this.buildMissingPlaybackScopeMessage(scopeState.scopes),
          product,
          missingPlaybackScope: true,
          scopeStatus: 'missing',
        }),
        accessToken,
        expiresIn,
      };
    }

    const cacheKey = this.buildHostSpotifyStatusCacheKey(
      accessToken,
      product,
      scopeState.status,
    );
    const cachedStatus = this.getCachedHostSpotifyStatus(cacheKey);
    if (cachedStatus) {
      return {
        status: cachedStatus,
        accessToken,
        expiresIn,
      };
    }

    const playbackCapability = await this.spotifyPlaybackCapabilityCheck(accessToken);
    if (playbackCapability.status === 401) {
      return {
        status: this.buildReconnectStatus(
          'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.',
        ),
        accessToken: null,
        expiresIn: 0,
      };
    }

    if (playbackCapability.status === 403) {
      const blockedStatus = this.buildBlockedStatus({
        message:
          playbackCapability.message ||
          'Die aktuelle Spotify-Anmeldung erlaubt noch kein Host-Browser-Playback.',
        product,
        missingPlaybackScope: true,
        scopeStatus: scopeState.status === 'unknown' ? 'unknown' : 'missing',
      });
      this.setCachedHostSpotifyStatus(cacheKey, blockedStatus);
      return {
        status: blockedStatus,
        accessToken,
        expiresIn,
      };
    }

    if (!playbackCapability.ok) {
      const unknownStatus = this.buildUnknownStatus({
        message:
          playbackCapability.message ||
          'Spotify-Browser-Playback konnte gerade nicht eindeutig bestätigt werden.',
        product,
        scopeStatus: scopeState.status,
      });
      this.setCachedHostSpotifyStatus(cacheKey, unknownStatus);
      return {
        status: unknownStatus,
        accessToken,
        expiresIn,
      };
    }

    const nextStatus =
      scopeState.status === 'unknown'
        ? this.buildUnknownStatus({
            message:
              'Spotify ist verbunden. Browser-Playback wird beim Quizstart im Browser verifiziert.',
            product,
            scopeStatus: 'unknown',
          })
        : this.buildReadyStatus({
            message: 'Spotify ist für Browser-Playback bereit.',
            product,
          });

    this.setCachedHostSpotifyStatus(cacheKey, nextStatus);
    return {
      status: nextStatus,
      accessToken,
      expiresIn,
    };
  }

  async getSpotifyAccessTokenForSdk(authorizationHeader?: string) {
    const readiness = await this.evaluateHostSpotifyPlayback(authorizationHeader);
    if (readiness.status.webPlaybackStatus === 'blocked' || !readiness.accessToken) {
      this.throwForBlockedSpotifyStatus(readiness.status);
    }

    return {
      accessToken: readiness.accessToken,
      expiresIn: readiness.expiresIn,
    };
  }

  async getHostSpotifyStatus(
    authorizationHeader?: string,
  ): Promise<HostSpotifyStatus> {
    const readiness = await this.evaluateHostSpotifyPlayback(authorizationHeader);
    return readiness.status;

    this.verifyHostJwtOrThrow(authorizationHeader);

    if (!this.hostSession) {
      return {
        connected: false,
        canUseWebPlayback: false,
        needsReconnect: true,
        missingPremium: false,
        missingPlaybackScope: false,
        scopeStatus: 'unknown',
        webPlaybackStatus: 'blocked',
        message:
          'Die Spotify-Verbindung des Hosts ist nicht mehr vorhanden. Bitte den Host-Browser erneut mit Spotify verbinden.',
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.getValidHostSpotifyAccessToken();
    } catch {
      return {
        connected: false,
        canUseWebPlayback: false,
        needsReconnect: true,
        missingPremium: false,
        missingPlaybackScope: false,
        scopeStatus: 'unknown',
        webPlaybackStatus: 'blocked',
        message:
          'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.',
      };
    }

    let me: SpotifyMe;
    try {
      me = await this.spotifyMe(accessToken);
    } catch {
      return {
        connected: false,
        canUseWebPlayback: false,
        needsReconnect: true,
        missingPremium: false,
        missingPlaybackScope: false,
        scopeStatus: 'unknown',
        webPlaybackStatus: 'blocked',
        message:
          'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.',
      };
    }

    const product = String(me.product ?? '').trim().toLowerCase();
    const missingPremium = Boolean(product) && product !== 'premium';
    const scopeState = await this.getHostWebPlaybackScopeState();
    accessToken = this.hostSession?.accessToken ?? accessToken;
    const playbackCapability = scopeState.status === 'missing'
      ? {
          ok: false,
          status: 403,
          message: this.buildMissingPlaybackScopeMessage(scopeState.scopes),
        }
      : await this.spotifyPlaybackCapabilityCheck(accessToken);
    const needsReconnect = playbackCapability.status === 401;
    const missingPlaybackScope =
      scopeState.status === 'missing' || playbackCapability.status === 403;

    let message = 'Spotify ist für Browser-Playback bereit.';
    if (needsReconnect) {
      message =
        'Die Spotify-Verbindung des Hosts ist nicht mehr gültig. Bitte den Host-Browser erneut mit Spotify verbinden.';
    } else if (missingPremium) {
      message =
        'Browser-Playback im Host-Modus benötigt Spotify Premium auf dem Host-Account.';
    } else if (missingPlaybackScope) {
      message =
        'Die aktuelle Spotify-Anmeldung erlaubt das Laden von Playlists, aber noch kein Browser-Playback. Bitte den Host-Browser erneut mit Spotify verbinden.';
    } else if (!playbackCapability.ok) {
      message =
        playbackCapability.message ||
        'Spotify-Browser-Playback konnte gerade nicht bestätigt werden.';
    }

    return {
      connected: true,
      canUseWebPlayback:
        !needsReconnect &&
        !missingPremium &&
        !missingPlaybackScope &&
        playbackCapability.ok,
      needsReconnect,
      missingPremium,
      missingPlaybackScope,
      scopeStatus:
        missingPlaybackScope
          ? 'missing'
          : playbackCapability.ok
            ? 'granted'
            : scopeState.status,
      webPlaybackStatus:
        !needsReconnect &&
        !missingPremium &&
        !missingPlaybackScope &&
        playbackCapability.ok
          ? 'ready'
          : 'blocked',
      ...(product ? { product } : {}),
      message,
    };
  }

  hasHostSessionForDev() {
    return Boolean(this.hostSession);
  }
}
