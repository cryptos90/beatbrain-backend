import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MinimalTrack, SpotifyService } from '../spotify/spotify.service';

type AnswerType = 'multiple-choice' | 'binary' | 'year-input';

type QuestionTemplate = {
  questionText: string;
  answerFieldPath: string;
  answerType: AnswerType;
};

type QuizSession = {
  id: string;
  playlistId: string;
  createdAt: number;
  poolTrackIds: string[];
  tracksById: Record<string, MinimalTrack>;
  usedTrackIds: Set<string>;
  poolRefillMeta: {
    total: number;
    pageSize: number;
    pagesFetchedOffsets: Set<number>;
    maxPagesFetched: number;
  };
};

const MIN_POOL_TRACKS = 20;
const INITIAL_PAGE_SIZE = 50;
const INITIAL_PAGE_COUNT = 3;
const REFILL_THRESHOLD = 30;
const MAX_PAGES_FETCHED = 10;

const QUESTION_POOL: QuestionTemplate[] = [
  {
    questionText: 'In welchem Jahr erschien der Song?',
    answerFieldPath: 'year',
    answerType: 'year-input',
  },
  {
    questionText: 'Wer ist der Interpret?',
    answerFieldPath: 'artistName',
    answerType: 'multiple-choice',
  },
  {
    questionText: 'Auf welchem Album ist der Song?',
    answerFieldPath: 'albumName',
    answerType: 'multiple-choice',
  },
  {
    questionText: 'Wie hoch ist die Popularity?',
    answerFieldPath: 'popularity',
    answerType: 'multiple-choice',
  },
  {
    questionText: 'Ist der Song explicit?',
    answerFieldPath: 'explicit',
    answerType: 'binary',
  },
  {
    questionText: 'Wie heisst der Song?',
    answerFieldPath: 'name',
    answerType: 'multiple-choice',
  },
];

function shuffle<T>(arr: T[]) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pickRandom<T>(arr: T[]) {
  if (!arr.length) {
    throw new Error('Cannot pick random item from empty array');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeReleaseYear(releaseDate: string): string {
  if (!releaseDate) {
    return '';
  }
  return releaseDate.split('-')[0] ?? '';
}

function extractByPath(object: any, path: string): unknown {
  const tokens: string[] = [];
  const regex = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null = regex.exec(path);
  while (match) {
    tokens.push(match[1] ?? match[2]);
    match = regex.exec(path);
  }

  return tokens.reduce<any>((acc, token) => {
    if (acc == null) {
      return undefined;
    }
    return acc[token];
  }, object);
}

function normalizeValueByFieldPath(path: string, rawValue: unknown): string {
  if (path === 'year') {
    return normalizeReleaseYear(String(rawValue ?? ''));
  }
  if (path === 'explicit') {
    return rawValue ? 'Yes' : 'No';
  }
  return String(rawValue ?? '');
}

@Injectable()
export class QuizService {
  private readonly sessions = new Map<string, QuizSession>();

  constructor(private readonly spotifyService: SpotifyService) {}

  private addTrackToPool(session: QuizSession, track: MinimalTrack) {
    if (!track.id || !track.uri) {
      return;
    }
    if (!session.tracksById[track.id]) {
      session.poolTrackIds.push(track.id);
    }
    session.tracksById[track.id] = track;
  }

  private totalPlaylistPages(total: number, pageSize: number) {
    return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  }

  private pickRandomPageOffset(total: number, pageSize: number, usedOffsets: Set<number>) {
    const pageCount = this.totalPlaylistPages(total, pageSize);
    if (usedOffsets.size >= pageCount) {
      return null;
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pageIndex = Math.floor(Math.random() * pageCount);
      const offset = pageIndex * pageSize;
      if (!usedOffsets.has(offset)) {
        return offset;
      }
    }

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const offset = pageIndex * pageSize;
      if (!usedOffsets.has(offset)) {
        return offset;
      }
    }

    return null;
  }

  private getRemainingTrackIds(session: QuizSession) {
    return session.poolTrackIds.filter(
      (trackId) => Boolean(session.tracksById[trackId]) && !session.usedTrackIds.has(trackId),
    );
  }

  private async refillPoolIfNeeded(session: QuizSession) {
    const remaining = this.getRemainingTrackIds(session).length;
    if (remaining >= REFILL_THRESHOLD) {
      return;
    }

    if (
      session.poolRefillMeta.pagesFetchedOffsets.size >=
      session.poolRefillMeta.maxPagesFetched
    ) {
      return;
    }

    const offset = this.pickRandomPageOffset(
      session.poolRefillMeta.total,
      session.poolRefillMeta.pageSize,
      session.poolRefillMeta.pagesFetchedOffsets,
    );
    if (offset === null) {
      return;
    }

    const tracks = await this.spotifyService.getPlaylistTrackPageMinimal(
      session.playlistId,
      offset,
      session.poolRefillMeta.pageSize,
    );
    session.poolRefillMeta.pagesFetchedOffsets.add(offset);

    for (const track of tracks) {
      this.addTrackToPool(session, track);
    }
  }

  async createSession(playlistId: string) {
    const normalizedPlaylistId = (playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const total = await this.spotifyService.getPlaylistTrackTotal(normalizedPlaylistId);
    if (!Number.isFinite(total) || total < MIN_POOL_TRACKS) {
      throw new BadRequestException('Playlist too small/empty');
    }

    const pagesFetchedOffsets = new Set<number>();
    const pageSize = INITIAL_PAGE_SIZE;
    const targetPages = Math.min(
      INITIAL_PAGE_COUNT,
      this.totalPlaylistPages(total, pageSize),
    );

    const session: QuizSession = {
      id: randomUUID(),
      playlistId: normalizedPlaylistId,
      createdAt: Date.now(),
      poolTrackIds: [],
      tracksById: {},
      usedTrackIds: new Set<string>(),
      poolRefillMeta: {
        total,
        pageSize,
        pagesFetchedOffsets,
        maxPagesFetched: MAX_PAGES_FETCHED,
      },
    };

    while (pagesFetchedOffsets.size < targetPages) {
      const offset = this.pickRandomPageOffset(total, pageSize, pagesFetchedOffsets);
      if (offset === null) {
        break;
      }

      const pageTracks = await this.spotifyService.getPlaylistTrackPageMinimal(
        normalizedPlaylistId,
        offset,
        pageSize,
      );
      pagesFetchedOffsets.add(offset);

      for (const track of pageTracks) {
        this.addTrackToPool(session, track);
      }
    }

    if (session.poolTrackIds.length < MIN_POOL_TRACKS) {
      throw new BadRequestException('Playlist too small/empty');
    }

    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      playlistId: normalizedPlaylistId,
      totalSongs: session.poolTrackIds.length,
      songIDs: [...session.poolTrackIds],
    };
  }

  getSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Quiz session not found');
    }
    return session;
  }

  deleteSession(sessionId: string) {
    this.sessions.delete(sessionId);
    return { sessionId, deleted: true };
  }

  private buildWrongAnswers(
    session: QuizSession,
    correctSongId: string,
    answerFieldPath: string,
    correctAnswer: string,
    answerType: AnswerType,
  ): string[] {
    if (answerType === 'year-input') {
      return [];
    }

    if (answerType === 'binary' && answerFieldPath === 'explicit') {
      return correctAnswer === 'Yes' ? ['No'] : ['Yes'];
    }

    const candidateTrackIds = shuffle(
      session.poolTrackIds.filter((trackId) => trackId !== correctSongId),
    );
    const wrongAnswers: string[] = [];
    const seen = new Set<string>();

    for (const trackId of candidateTrackIds) {
      const track = session.tracksById[trackId];
      if (!track) {
        continue;
      }
      const value = normalizeValueByFieldPath(
        answerFieldPath,
        extractByPath(track, answerFieldPath),
      );
      if (!value || value === correctAnswer || seen.has(value)) {
        continue;
      }

      seen.add(value);
      wrongAnswers.push(value);
      if (wrongAnswers.length >= 3) {
        break;
      }
    }

    return wrongAnswers;
  }

  async nextQuestion(sessionId: string) {
    const session = this.getSession(sessionId);

    await this.refillPoolIfNeeded(session);

    const remainingTrackIds = this.getRemainingTrackIds(session);
    if (!remainingTrackIds.length) {
      return { done: true, remainingSongIDs: [] };
    }

    const correctSongId = pickRandom(remainingTrackIds);
    session.usedTrackIds.add(correctSongId);

    const track = session.tracksById[correctSongId];
    const questionTemplate = pickRandom(QUESTION_POOL);

    const rawCorrect = extractByPath(track, questionTemplate.answerFieldPath);
    const correctAnswer = normalizeValueByFieldPath(
      questionTemplate.answerFieldPath,
      rawCorrect,
    );

    const wrongAnswers = this.buildWrongAnswers(
      session,
      correctSongId,
      questionTemplate.answerFieldPath,
      correctAnswer,
      questionTemplate.answerType,
    );

    const options =
      questionTemplate.answerType === 'binary'
        ? shuffle([correctAnswer, ...(correctAnswer === 'Yes' ? ['No'] : ['Yes'])]).slice(
            0,
            2,
          )
        : shuffle([correctAnswer, ...wrongAnswers]).slice(0, 4);

    return {
      done: false,
      remainingSongIDs: this.getRemainingTrackIds(session),
      question: {
        questionObject: {
          questionText: questionTemplate.questionText,
          answerFieldPath: questionTemplate.answerFieldPath,
          answerType: questionTemplate.answerType,
        },
        correctSongId,
        correctTrackUri: track.uri,
        correctAnswer,
        wrongAnswers,
        options,
        trackInfo: {
          id: track.id,
          uri: track.uri,
          name: track.name,
          artist: track.artistName,
          album: track.albumName,
          coverUrl: track.coverUrl,
          year: track.year,
          explicit: track.explicit,
          popularity: track.popularity,
        },
      },
    };
  }
}
