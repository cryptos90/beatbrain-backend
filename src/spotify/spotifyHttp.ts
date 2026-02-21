type SpotifyLogger = {
  warn?: (message: string) => void;
};

type SpotifyFetchContext = {
  accessToken: string;
  endpointPath?: string;
  logger?: SpotifyLogger;
  max5xxRetries?: number;
};

const MAX_CONCURRENT_SPOTIFY_REQUESTS = 2;
const MIN_SPOTIFY_REQUEST_SPACING_MS = 150;
const DEFAULT_5XX_RETRIES = 1;

let activeSpotifyRequests = 0;
const spotifyRequestQueue: Array<() => void> = [];

let lastSpotifyRequestStartedAt = 0;
let spacingChain: Promise<void> = Promise.resolve();
let spotifyRateLimitedUntilMs = 0;
let spotifyRateLimitedSource: string | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(headerValue: string | null) {
  if (!headerValue) return 1;
  const numeric = Number.parseFloat(headerValue);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(numeric));
}

function randomJitter(minMs: number, maxMs: number) {
  const span = Math.max(0, maxMs - minMs);
  return minMs + Math.floor(Math.random() * (span + 1));
}

function getGlobalRateLimitRemainingSeconds(now = Date.now()) {
  const remainingMs = spotifyRateLimitedUntilMs - now;
  if (remainingMs <= 0) {
    spotifyRateLimitedUntilMs = 0;
    spotifyRateLimitedSource = null;
    return 0;
  }
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function setGlobalRateLimitWindow(retryAfterSeconds: number, source?: string) {
  const normalizedSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  const nextBlockedUntil = Date.now() + normalizedSeconds * 1000;
  if (nextBlockedUntil <= spotifyRateLimitedUntilMs) {
    return;
  }
  spotifyRateLimitedUntilMs = nextBlockedUntil;
  spotifyRateLimitedSource = source ? String(source).trim() || null : null;
}

function buildSyntheticRateLimitedResponse(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify({
      error: {
        status: 429,
        message: 'Spotify API rate limit reached',
      },
    }),
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
      },
    },
  );
}

async function acquireSpotifySlot() {
  if (activeSpotifyRequests < MAX_CONCURRENT_SPOTIFY_REQUESTS) {
    activeSpotifyRequests += 1;
  } else {
    await new Promise<void>((resolve) => {
      spotifyRequestQueue.push(() => {
        activeSpotifyRequests += 1;
        resolve();
      });
    });
  }

  return () => {
    activeSpotifyRequests = Math.max(0, activeSpotifyRequests - 1);
    const next = spotifyRequestQueue.shift();
    if (next) {
      next();
    }
  };
}

async function waitForGlobalRequestSpacing() {
  let releaseSpacing!: () => void;
  const previous = spacingChain;
  spacingChain = new Promise<void>((resolve) => {
    releaseSpacing = resolve;
  });

  await previous;
  const now = Date.now();
  const elapsed = now - lastSpotifyRequestStartedAt;
  if (elapsed < MIN_SPOTIFY_REQUEST_SPACING_MS) {
    await sleep(MIN_SPOTIFY_REQUEST_SPACING_MS - elapsed);
  }
  lastSpotifyRequestStartedAt = Date.now();
  releaseSpacing();
}

export class SpotifyUnauthorizedError extends Error {
  readonly status: number;

  constructor(message = 'Spotify authorization failed', status = 401) {
    super(message);
    this.name = 'SpotifyUnauthorizedError';
    this.status = status;
  }
}

export async function spotifyFetch(
  url: string,
  options: RequestInit = {},
  context: SpotifyFetchContext,
) {
  const max5xxRetries = context.max5xxRetries ?? DEFAULT_5XX_RETRIES;

  let serverErrorRetries = 0;

  while (true) {
    const globallyBlockedForSeconds = getGlobalRateLimitRemainingSeconds();
    if (globallyBlockedForSeconds > 0) {
      context.logger?.warn?.(
        `[spotify] global 429 cooldown endpoint=${context.endpointPath ?? url} retryAfter=${globallyBlockedForSeconds}s source=${spotifyRateLimitedSource ?? 'unknown'}`,
      );
      return buildSyntheticRateLimitedResponse(globallyBlockedForSeconds);
    }

    const releaseSlot = await acquireSpotifySlot();
    try {
      await waitForGlobalRequestSpacing();
      const blockedAfterQueueForSeconds = getGlobalRateLimitRemainingSeconds();
      if (blockedAfterQueueForSeconds > 0) {
        context.logger?.warn?.(
          `[spotify] global 429 cooldown endpoint=${context.endpointPath ?? url} retryAfter=${blockedAfterQueueForSeconds}s source=${spotifyRateLimitedSource ?? 'unknown'}`,
        );
        return buildSyntheticRateLimitedResponse(blockedAfterQueueForSeconds);
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          Authorization: `Bearer ${context.accessToken}`,
        },
      });

      if (response.status === 401) {
        throw new SpotifyUnauthorizedError(
          `Spotify authorization failed (${response.status})`,
          response.status,
        );
      }

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(
          response.headers.get('Retry-After'),
        );
        setGlobalRateLimitWindow(retryAfterSeconds, context.endpointPath ?? url);
        context.logger?.warn?.(
          `[spotify] 429 endpoint=${context.endpointPath ?? url} retryAfter=${retryAfterSeconds}s globalCooldown=enabled`,
        );
        return response;
      }

      if (
        response.status >= 500 &&
        response.status <= 599 &&
        serverErrorRetries < max5xxRetries
      ) {
        serverErrorRetries += 1;
        const retryDelayMs = 200 * serverErrorRetries + randomJitter(50, 150);
        context.logger?.warn?.(
          `[spotify] ${response.status} endpoint=${context.endpointPath ?? url} retry=${serverErrorRetries}/${max5xxRetries}`,
        );
        await sleep(retryDelayMs);
        continue;
      }

      return response;
    } finally {
      releaseSlot();
    }
  }
}
