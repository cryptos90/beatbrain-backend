type SpotifyLogger = {
  warn?: (message: string) => void;
};

type SpotifyFetchContext = {
  accessToken: string;
  endpointPath?: string;
  logger?: SpotifyLogger;
  max429Retries?: number;
  max5xxRetries?: number;
};

const MAX_CONCURRENT_SPOTIFY_REQUESTS = 2;
const MIN_SPOTIFY_REQUEST_SPACING_MS = 150;
const DEFAULT_429_RETRIES = 3;
const DEFAULT_5XX_RETRIES = 1;
const MAX_AUTOMATIC_429_RETRY_AFTER_SECONDS = 5;

let activeSpotifyRequests = 0;
const spotifyRequestQueue: Array<() => void> = [];

let lastSpotifyRequestStartedAt = 0;
let spacingChain: Promise<void> = Promise.resolve();

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
  const max429Retries = context.max429Retries ?? DEFAULT_429_RETRIES;
  const max5xxRetries = context.max5xxRetries ?? DEFAULT_5XX_RETRIES;

  let rateLimitRetries = 0;
  let serverErrorRetries = 0;

  while (true) {
    const releaseSlot = await acquireSpotifySlot();
    try {
      await waitForGlobalRequestSpacing();

      const response = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          Authorization: `Bearer ${context.accessToken}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new SpotifyUnauthorizedError(
          `Spotify authorization failed (${response.status})`,
          response.status,
        );
      }

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(
          response.headers.get('Retry-After'),
        );

        if (
          retryAfterSeconds <= MAX_AUTOMATIC_429_RETRY_AFTER_SECONDS &&
          rateLimitRetries < max429Retries
        ) {
          rateLimitRetries += 1;
          context.logger?.warn?.(
            `[spotify] 429 endpoint=${context.endpointPath ?? url} retryAfter=${retryAfterSeconds}s attempt=${rateLimitRetries}/${max429Retries}`,
          );
          await sleep(retryAfterSeconds * 1000 + randomJitter(100, 300));
          continue;
        }

        if (retryAfterSeconds > MAX_AUTOMATIC_429_RETRY_AFTER_SECONDS) {
          context.logger?.warn?.(
            `[spotify] 429 endpoint=${context.endpointPath ?? url} retryAfter=${retryAfterSeconds}s exceeds auto-retry cap (${MAX_AUTOMATIC_429_RETRY_AFTER_SECONDS}s), returning 429`,
          );
        }
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
