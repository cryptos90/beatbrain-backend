import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MinimalTrack, SpotifyService } from '../spotify/spotify.service';
import { buildPoolFromPlaylist } from './poolBuilder';

type AnswerType = 'multiple-choice' | 'binary';

type QuestionKind =
  | 'song-title'
  | 'artist'
  | 'album'
  | 'year'
  | 'year-pm2'
  | 'year-pm4'
  | 'before-after-2000';

type QuestionTemplate = {
  kind: QuestionKind;
  questionText: string;
  answerFieldPath: 'name' | 'artistName' | 'albumName' | 'year';
  answerType: AnswerType;
};

type QuizSession = {
  id: string;
  playlistId: string;
  createdAt: number;
  questionCount: number;
  decadeTag?: string;
  askedCount: number;
  poolTrackIds: string[];
  tracksById: Record<string, MinimalTrack>;
  usedTrackIds: Set<string>;
  poolRefillMeta: {
    total: number;
    pageSize: number;
    pagesFetchedOffsets: Set<number>;
  };
};

const MIN_POOL_TRACKS = 30;
const MIN_QUESTION_COUNT = 10;
const MAX_QUESTION_COUNT = 100;
const INITIAL_PAGE_SIZE = 50;
const TARGET_POOL_TRACKS = 120;
const MAX_POOL_PAGES_FETCHED = 10;
const MIN_YEAR = 1900;

const QUESTION_POOL: QuestionTemplate[] = [
  {
    kind: 'song-title',
    questionText: 'Wie heisst der Song?',
    answerFieldPath: 'name',
    answerType: 'multiple-choice',
  },
  {
    kind: 'artist',
    questionText: 'Wer ist der Interpret?',
    answerFieldPath: 'artistName',
    answerType: 'multiple-choice',
  },
  {
    kind: 'album',
    questionText: 'Auf welchem Album ist der Song?',
    answerFieldPath: 'albumName',
    answerType: 'multiple-choice',
  },
  {
    kind: 'year',
    questionText: 'In welchem Jahr erschien der Song?',
    answerFieldPath: 'year',
    answerType: 'multiple-choice',
  },
  {
    kind: 'year-pm2',
    questionText: 'Welches Jahr passt (+/- 2 Jahre)?',
    answerFieldPath: 'year',
    answerType: 'multiple-choice',
  },
  {
    kind: 'year-pm4',
    questionText: 'Welches Jahr passt (+/- 4 Jahre)?',
    answerFieldPath: 'year',
    answerType: 'multiple-choice',
  },
  {
    kind: 'before-after-2000',
    questionText: 'Erschien der Song vor oder ab 2000?',
    answerFieldPath: 'year',
    answerType: 'binary',
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

@Injectable()
export class QuizService {
  private readonly sessions = new Map<string, QuizSession>();
  private readonly logger = new Logger(QuizService.name);

  constructor(private readonly spotifyService: SpotifyService) {}

  private normalizeQuestionCount(rawCount: number | undefined) {
    if (!Number.isFinite(rawCount)) {
      return MIN_QUESTION_COUNT;
    }
    return Math.max(
      MIN_QUESTION_COUNT,
      Math.min(MAX_QUESTION_COUNT, Math.floor(rawCount as number)),
    );
  }

  private normalizeDecadeTag(rawTag: string | undefined) {
    const normalized = (rawTag ?? '').trim();
    return normalized || undefined;
  }

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

  private parseYearFromTrack(rawYear: string | number | undefined) {
    const value = String(rawYear ?? '').trim();
    if (!/^\d{4}$/.test(value)) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isFinite(parsed) || parsed < MIN_YEAR || parsed > maxYear) {
      return null;
    }

    return parsed;
  }

  private extractAnswerValue(track: MinimalTrack, fieldPath: QuestionTemplate['answerFieldPath']) {
    if (fieldPath === 'name') {
      return String(track.name ?? '').trim();
    }
    if (fieldPath === 'artistName') {
      return String(track.artistName ?? '').trim();
    }
    if (fieldPath === 'albumName') {
      return String(track.albumName ?? '').trim();
    }
    if (fieldPath === 'year') {
      return String(track.year ?? '').trim();
    }
    return '';
  }

  private hasBeforeAndAfter2000(session: QuizSession) {
    let hasBefore = false;
    let hasAfterOrEqual = false;

    for (const trackId of session.poolTrackIds) {
      const track = session.tracksById[trackId];
      if (!track) {
        continue;
      }
      const year = this.parseYearFromTrack(track.year);
      if (year === null) {
        continue;
      }

      if (year < 2000) {
        hasBefore = true;
      } else {
        hasAfterOrEqual = true;
      }

      if (hasBefore && hasAfterOrEqual) {
        return true;
      }
    }

    return false;
  }

  private getQuestionTemplates(session: QuizSession) {
    const hasBeforeAndAfter = this.hasBeforeAndAfter2000(session);

    return QUESTION_POOL.filter((template) => {
      if (session.decadeTag && (template.kind === 'year' || template.kind === 'year-pm2' || template.kind === 'year-pm4')) {
        return false;
      }

      if (template.kind === 'before-after-2000' && !hasBeforeAndAfter) {
        return false;
      }

      return true;
    });
  }

  private pickYearDecoy(correctYear: number, usedYears: Set<number>) {
    const maxYear = new Date().getFullYear() + 1;

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const offset = Math.floor(Math.random() * 16) + 1;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const candidate = correctYear + sign * offset;
      if (candidate < MIN_YEAR || candidate > maxYear || usedYears.has(candidate)) {
        continue;
      }
      return candidate;
    }

    for (let candidate = MIN_YEAR; candidate <= maxYear; candidate += 1) {
      if (!usedYears.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private buildYearOptions(correctYear: number, mode: 'normal' | 'pm2' | 'pm4') {
    const maxYear = new Date().getFullYear() + 1;
    const years = new Set<number>();
    years.add(correctYear);

    if (mode === 'pm2') {
      if (correctYear - 2 >= MIN_YEAR) {
        years.add(correctYear - 2);
      }
      if (correctYear + 2 <= maxYear) {
        years.add(correctYear + 2);
      }
    }

    if (mode === 'pm4') {
      if (correctYear - 4 >= MIN_YEAR) {
        years.add(correctYear - 4);
      }
      if (correctYear + 4 <= maxYear) {
        years.add(correctYear + 4);
      }
    }

    while (years.size < 4) {
      const decoy = this.pickYearDecoy(correctYear, years);
      if (decoy === null) {
        break;
      }
      years.add(decoy);
    }

    if (mode === 'normal' && years.size > 4) {
      const fixed = [correctYear];
      for (const year of shuffle(Array.from(years).filter((value) => value !== correctYear))) {
        fixed.push(year);
        if (fixed.length === 4) {
          break;
        }
      }
      return shuffle(fixed).map((value) => String(value));
    }

    const options = Array.from(years).map((value) => String(value));
    return shuffle(options).slice(0, 4);
  }

  private buildWrongAnswers(
    session: QuizSession,
    correctSongId: string,
    answerFieldPath: QuestionTemplate['answerFieldPath'],
    correctAnswer: string,
  ) {
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

      const value = this.extractAnswerValue(track, answerFieldPath);
      const normalized = value.toLowerCase();
      if (!value || normalized === correctAnswer.toLowerCase() || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      wrongAnswers.push(value);
      if (wrongAnswers.length >= 3) {
        break;
      }
    }

    return wrongAnswers;
  }

  private buildQuestionFromTemplate(
    session: QuizSession,
    track: MinimalTrack,
    correctSongId: string,
    template: QuestionTemplate,
  ) {
    if (template.kind === 'before-after-2000') {
      const year = this.parseYearFromTrack(track.year);
      if (year === null) {
        return null;
      }

      const correctAnswer = year < 2000 ? 'vor 2000' : 'ab 2000';
      const wrongAnswer = correctAnswer === 'vor 2000' ? 'ab 2000' : 'vor 2000';
      const options = shuffle([correctAnswer, wrongAnswer]);

      return {
        correctAnswer,
        wrongAnswers: [wrongAnswer],
        options,
      };
    }

    if (template.kind === 'year' || template.kind === 'year-pm2' || template.kind === 'year-pm4') {
      const year = this.parseYearFromTrack(track.year);
      if (year === null) {
        return null;
      }

      const mode =
        template.kind === 'year-pm2'
          ? 'pm2'
          : template.kind === 'year-pm4'
            ? 'pm4'
            : 'normal';

      const options = this.buildYearOptions(year, mode);
      const correctAnswer = String(year);

      if (!options.includes(correctAnswer) || options.length < 4) {
        return null;
      }

      return {
        correctAnswer,
        wrongAnswers: options.filter((value) => value !== correctAnswer),
        options,
      };
    }

    const correctAnswer = this.extractAnswerValue(track, template.answerFieldPath);
    if (!correctAnswer) {
      return null;
    }

    const wrongAnswers = this.buildWrongAnswers(
      session,
      correctSongId,
      template.answerFieldPath,
      correctAnswer,
    );
    if (wrongAnswers.length < 3) {
      return null;
    }

    return {
      correctAnswer,
      wrongAnswers,
      options: shuffle([correctAnswer, ...wrongAnswers]).slice(0, 4),
    };
  }

  async createSession(input: {
    playlistId: string;
    questionCount?: number;
    decadeTag?: string;
  }) {
    const normalizedPlaylistId = (input.playlistId ?? '').trim();
    if (!normalizedPlaylistId) {
      throw new BadRequestException('Missing playlistId');
    }

    const builtPool = await buildPoolFromPlaylist(this.spotifyService, {
      playlistId: normalizedPlaylistId,
      pageSize: INITIAL_PAGE_SIZE,
      targetPoolSize: TARGET_POOL_TRACKS,
      minPoolSize: MIN_POOL_TRACKS,
      maxPagesFetched: MAX_POOL_PAGES_FETCHED,
    });
    const pagesFetchedOffsets = new Set<number>(builtPool.pagesFetchedOffsets);

    const session: QuizSession = {
      id: randomUUID(),
      playlistId: normalizedPlaylistId,
      createdAt: Date.now(),
      questionCount: this.normalizeQuestionCount(input.questionCount),
      decadeTag: this.normalizeDecadeTag(input.decadeTag),
      askedCount: 0,
      poolTrackIds: [],
      tracksById: {},
      usedTrackIds: new Set<string>(),
      poolRefillMeta: {
        total: builtPool.total,
        pageSize: builtPool.pageSize,
        pagesFetchedOffsets,
      },
    };

    for (const track of builtPool.tracks) {
      this.addTrackToPool(session, track);
    }

    if (session.poolTrackIds.length < MIN_POOL_TRACKS) {
      const d = builtPool.diagnostics;
      throw new BadRequestException(
        `Playlist too small / empty (pool=${session.poolTrackIds.length}, total=${d.total}, items=${d.itemsCount}, nullTrack=${d.nullTrackCount}, local=${d.localTrackCount}, missingId=${d.missingIdOrUriCount}, pages=${d.pagesFetched})`,
      );
    }

    const d = builtPool.diagnostics;
    this.logger.log(
      `[pool] playlist=${normalizedPlaylistId} pool=${session.poolTrackIds.length} total=${d.total} pages=${d.pagesFetched} items=${d.itemsCount} nullTrack=${d.nullTrackCount} local=${d.localTrackCount} missingId=${d.missingIdOrUriCount}`,
    );

    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      playlistId: normalizedPlaylistId,
      questionCount: session.questionCount,
      decadeTag: session.decadeTag,
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

  async nextQuestion(sessionId: string) {
    const session = this.getSession(sessionId);
    const remainingTrackIds = this.getRemainingTrackIds(session);

    if (session.askedCount >= session.questionCount || !remainingTrackIds.length) {
      return {
        done: true,
        remainingSongIDs: remainingTrackIds,
        askedCount: session.askedCount,
        questionCount: session.questionCount,
      };
    }

    const templates = this.getQuestionTemplates(session);
    if (!templates.length) {
      throw new BadRequestException('No valid question templates available for this session');
    }

    const shuffledTrackIds = shuffle(remainingTrackIds);

    for (const correctSongId of shuffledTrackIds) {
      const track = session.tracksById[correctSongId];
      if (!track) {
        continue;
      }

      const shuffledTemplates = shuffle(templates);
      for (const template of shuffledTemplates) {
        const builtQuestion = this.buildQuestionFromTemplate(
          session,
          track,
          correctSongId,
          template,
        );
        if (!builtQuestion) {
          continue;
        }

        session.usedTrackIds.add(correctSongId);
        session.askedCount += 1;

        return {
          done: false,
          remainingSongIDs: this.getRemainingTrackIds(session),
          askedCount: session.askedCount,
          questionCount: session.questionCount,
          question: {
            questionObject: {
              questionText: template.questionText,
              answerFieldPath: template.answerFieldPath,
              answerType: template.answerType,
            },
            correctSongId,
            correctTrackUri: track.uri,
            correctAnswer: builtQuestion.correctAnswer,
            wrongAnswers: builtQuestion.wrongAnswers,
            options: builtQuestion.options,
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

    throw new BadRequestException('Could not build a valid question from this playlist pool');
  }
}
