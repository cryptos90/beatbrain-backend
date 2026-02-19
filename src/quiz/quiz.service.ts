import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SpotifyService } from '../spotify/spotify.service';

type AnswerType = 'multiple-choice' | 'binary' | 'year-input';

type QuestionTemplate = {
  questionText: string;
  answerFieldPath: string;
  answerType: AnswerType;
};

type SpotifyTrack = {
  id: string;
  name: string;
  preview_url: string | null;
  popularity: number;
  explicit: boolean;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
    images: { url: string }[];
  };
};

type QuizSession = {
  id: string;
  playlistId: string;
  createdAt: number;
  remainingSongIds: string[];
  allTracksById: Record<string, SpotifyTrack>;
};

const QUESTION_POOL: QuestionTemplate[] = [
  {
    questionText: 'In welchem Jahr erschien der Song?',
    answerFieldPath: 'album.release_date',
    answerType: 'year-input',
  },
  {
    questionText: 'Wer ist der Interpret?',
    answerFieldPath: 'artists[0].name',
    answerType: 'multiple-choice',
  },
  {
    questionText: 'Auf welchem Album ist der Song?',
    answerFieldPath: 'album.name',
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
  if (path === 'album.release_date') {
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

  async createSession(playlistId: string) {
    const tracks = await this.spotifyService.getAllPlaylistTracks(playlistId);
    const deduped = tracks.filter(
      (track, index, arr) =>
        track.id &&
        arr.findIndex((candidate) => candidate.id === track.id) === index,
    );

    if (deduped.length < 4) {
      throw new BadRequestException(
        'Playlist must contain at least 4 readable Spotify tracks',
      );
    }

    const allTracksById: Record<string, SpotifyTrack> = {};
    for (const track of deduped) {
      allTracksById[track.id] = track;
    }

    const session: QuizSession = {
      id: randomUUID(),
      playlistId,
      createdAt: Date.now(),
      remainingSongIds: deduped.map((track) => track.id),
      allTracksById,
    };

    this.sessions.set(session.id, session);

    return {
      sessionId: session.id,
      playlistId,
      totalSongs: session.remainingSongIds.length,
      songIDs: [...session.remainingSongIds],
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

    const candidates = Object.values(session.allTracksById)
      .filter((track) => track.id !== correctSongId)
      .map((track) =>
        normalizeValueByFieldPath(answerFieldPath, extractByPath(track, answerFieldPath)),
      )
      .filter((value) => value && value !== correctAnswer);

    const unique = [...new Set(candidates)];
    return shuffle(unique).slice(0, 3);
  }

  nextQuestion(sessionId: string) {
    const session = this.getSession(sessionId);
    if (!session.remainingSongIds.length) {
      return { done: true, remainingSongIDs: [] };
    }

    const correctSongId = pickRandom(session.remainingSongIds);
    session.remainingSongIds = session.remainingSongIds.filter(
      (songId) => songId !== correctSongId,
    );

    const track = session.allTracksById[correctSongId];
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

    const options = shuffle([correctAnswer, ...wrongAnswers]).slice(
      0,
      questionTemplate.answerType === 'binary' ? 2 : 4,
    );

    return {
      done: false,
      remainingSongIDs: [...session.remainingSongIds],
      question: {
        questionObject: {
          questionText: questionTemplate.questionText,
          answerFieldPath: questionTemplate.answerFieldPath,
          answerType: questionTemplate.answerType,
        },
        correctSongId,
        correctAnswer,
        wrongAnswers,
        options,
        trackPreviewUrl: track.preview_url,
        trackInfo: {
          id: track.id,
          name: track.name,
          artist: track.artists?.[0]?.name ?? '',
          album: track.album?.name ?? '',
          year: normalizeReleaseYear(track.album?.release_date ?? ''),
          explicit: track.explicit,
          popularity: track.popularity,
        },
      },
    };
  }
}
