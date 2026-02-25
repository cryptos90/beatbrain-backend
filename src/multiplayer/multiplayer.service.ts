import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';

type Player = {
  id: string;
  name: string;
  avatarDataUrl: string;
  score: number;
  latestAnswer: string | null;
  readyForNext: boolean;
  socketId: string | null;
  disconnectedAt: number | null;
};

type Lobby = {
  joinCode: string;
  hostSocketId: string;
  hostJwtSub: string;
  players: Map<string, Player>;
  status: 'lobby' | 'question' | 'reveal' | 'results';
  currentQuestionId: string | null;
  roundDeadline: number | null;
  roundTimerMs: number;
};

type RevealRoundInput = {
  correctAnswer: string;
  answerType?: string | null;
  format?: string | null;
  toleranceYears?: number | null;
  correctYear?: number | null;
};

const MAX_PLAYERS = 10;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_AVATAR_DATA_URL_LENGTH = 200_000;

@Injectable()
export class MultiplayerService {
  private readonly lobbies = new Map<string, Lobby>();

  private isYearInputRound(input: RevealRoundInput) {
    return input.format === 'year_input' || input.answerType === 'year-input';
  }

  private toYearValue(value: string | number | null | undefined) {
    const normalized = String(value ?? '').trim();
    if (!/^\d{1,4}$/.test(normalized)) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private resolveCorrectYear(input: RevealRoundInput) {
    const fromPayload = Number(input.correctYear);
    if (Number.isFinite(fromPayload)) {
      return Math.floor(fromPayload);
    }
    return this.toYearValue(input.correctAnswer);
  }

  private normalizeToleranceYears(rawTolerance: number | null | undefined) {
    const parsed = Number(rawTolerance ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  private isCorrectAnswer(playerAnswer: string | null, input: RevealRoundInput) {
    const normalizedAnswer = String(playerAnswer ?? '').trim();
    if (!normalizedAnswer) {
      return false;
    }

    if (this.isYearInputRound(input)) {
      const guessYear = this.toYearValue(normalizedAnswer);
      const correctYear = this.resolveCorrectYear(input);
      if (guessYear === null || correctYear === null) {
        return false;
      }

      const toleranceYears = this.normalizeToleranceYears(input.toleranceYears);
      return Math.abs(guessYear - correctYear) <= toleranceYears;
    }

    return normalizedAnswer.toLowerCase() === input.correctAnswer.trim().toLowerCase();
  }

  private resetLobbyForMenu(lobby: Lobby) {
    lobby.status = 'lobby';
    lobby.currentQuestionId = null;
    lobby.roundDeadline = null;
    for (const player of lobby.players.values()) {
      player.score = 0;
      player.latestAnswer = null;
      player.readyForNext = false;
    }
    return lobby;
  }

  private generateJoinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      result += alphabet[index];
    }
    return result;
  }

  private createUniqueJoinCode() {
    for (let i = 0; i < 10; i += 1) {
      const code = this.generateJoinCode();
      if (!this.lobbies.has(code)) {
        return code;
      }
    }
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private findPlayerBySocketId(lobby: Lobby, playerSocketId: string) {
    for (const player of lobby.players.values()) {
      if (player.socketId === playerSocketId) {
        return player;
      }
    }
    return null;
  }

  createLobby(hostSocketId: string, hostJwtSub: string) {
    const joinCode = this.createUniqueJoinCode();
    const lobby: Lobby = {
      joinCode,
      hostSocketId,
      hostJwtSub,
      players: new Map(),
      status: 'lobby',
      currentQuestionId: null,
      roundDeadline: null,
      roundTimerMs: 30_000,
    };
    this.lobbies.set(joinCode, lobby);
    return lobby;
  }

  getLobby(joinCode: string) {
    const lobby = this.lobbies.get(joinCode.toUpperCase());
    if (!lobby) {
      throw new NotFoundException('Lobby not found');
    }
    return lobby;
  }

  removeHostLobby(hostSocketId: string) {
    const removedJoinCodes: string[] = [];
    for (const [code, lobby] of this.lobbies.entries()) {
      if (lobby.hostSocketId === hostSocketId) {
        this.lobbies.delete(code);
        removedJoinCodes.push(code);
      }
    }
    return removedJoinCodes;
  }

  markPlayerDisconnected(playerSocketId: string) {
    const disconnectedPlayers: { joinCode: string; playerSessionId: string }[] = [];
    for (const lobby of this.lobbies.values()) {
      const player = this.findPlayerBySocketId(lobby, playerSocketId);
      if (!player) {
        continue;
      }
      player.socketId = null;
      player.disconnectedAt = Date.now();
      disconnectedPlayers.push({ joinCode: lobby.joinCode, playerSessionId: player.id });
    }
    return disconnectedPlayers;
  }

  removeDisconnectedPlayer(joinCode: string, playerSessionId: string) {
    const lobby = this.getLobby(joinCode);
    const normalizedPlayerSessionId = String(playerSessionId ?? '').trim();
    const player = lobby.players.get(normalizedPlayerSessionId);
    if (!player) {
      return { removed: false, lobby, playerSessionId: normalizedPlayerSessionId };
    }
    if (player.socketId) {
      return { removed: false, lobby, playerSessionId: normalizedPlayerSessionId };
    }
    lobby.players.delete(normalizedPlayerSessionId);
    return { removed: true, lobby, playerSessionId: normalizedPlayerSessionId };
  }

  removePlayer(joinCode: string, playerSocketId: string, playerSessionId?: string | null) {
    const lobby = this.getLobby(joinCode);
    const normalizedPlayerSessionId = String(playerSessionId ?? '').trim();
    let resolvedPlayer = normalizedPlayerSessionId
      ? lobby.players.get(normalizedPlayerSessionId) ?? null
      : null;

    if (!resolvedPlayer) {
      resolvedPlayer = this.findPlayerBySocketId(lobby, playerSocketId);
    }

    if (!resolvedPlayer) {
      throw new NotFoundException('Player not in lobby');
    }

    lobby.players.delete(resolvedPlayer.id);
    return { lobby, playerSessionId: resolvedPlayer.id };
  }

  addPlayer(
    joinCode: string,
    playerSocketId: string,
    name: string,
    avatarDataUrl: string,
  ) {
    const lobby = this.getLobby(joinCode);
    if (lobby.players.size >= MAX_PLAYERS) {
      throw new BadRequestException(`Lobby is full (max ${MAX_PLAYERS} players)`);
    }
    if (lobby.status !== 'lobby') {
      throw new BadRequestException('Game already started');
    }

    const normalizedName = (name ?? '').trim();
    if (!normalizedName || normalizedName.length > MAX_PLAYER_NAME_LENGTH) {
      throw new BadRequestException(
        `Player name must be 1..${MAX_PLAYER_NAME_LENGTH} characters`,
      );
    }

    const normalizedAvatar = (avatarDataUrl ?? '').trim();
    if (!normalizedAvatar) {
      throw new BadRequestException('Avatar is required');
    }
    if (normalizedAvatar.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new BadRequestException('Avatar too large');
    }
    if (!normalizedAvatar.startsWith('data:image/')) {
      throw new BadRequestException('Avatar must be an image data URL');
    }

    const playerId = randomUUID();
    lobby.players.set(playerId, {
      id: playerId,
      name: normalizedName,
      avatarDataUrl: normalizedAvatar,
      score: 0,
      latestAnswer: null,
      readyForNext: false,
      socketId: playerSocketId,
      disconnectedAt: null,
    });
    return { lobby, playerSessionId: playerId };
  }

  reconnectPlayer(joinCode: string, playerSocketId: string, playerSessionId: string) {
    const lobby = this.getLobby(joinCode);
    const normalizedPlayerSessionId = String(playerSessionId ?? '').trim();
    if (!normalizedPlayerSessionId) {
      throw new BadRequestException('Player session missing');
    }

    const player = lobby.players.get(normalizedPlayerSessionId);
    if (!player) {
      throw new NotFoundException('Player session not found');
    }

    player.socketId = playerSocketId;
    player.disconnectedAt = null;

    return { lobby, playerSessionId: normalizedPlayerSessionId };
  }

  startQuestion(joinCode: string, questionId: string, timerMs = 30_000) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'question';
    lobby.currentQuestionId = questionId;
    lobby.roundTimerMs = timerMs;
    lobby.roundDeadline = Date.now() + timerMs;
    for (const player of lobby.players.values()) {
      player.latestAnswer = null;
      player.readyForNext = false;
    }
    return lobby;
  }

  submitAnswer(joinCode: string, playerSocketId: string, answer: string) {
    const lobby = this.getLobby(joinCode);
    if (lobby.status !== 'question') {
      throw new BadRequestException('No active question');
    }
    const player = this.findPlayerBySocketId(lobby, playerSocketId);
    if (!player) {
      throw new NotFoundException('Player not in lobby');
    }
    player.latestAnswer = String(answer ?? '').trim();
    return lobby;
  }

  reveal(joinCode: string, input: string | RevealRoundInput) {
    const revealInput: RevealRoundInput =
      typeof input === 'string' ? { correctAnswer: input } : input;
    const lobby = this.getLobby(joinCode);
    lobby.status = 'reveal';
    lobby.roundDeadline = null;
    for (const player of lobby.players.values()) {
      player.readyForNext = false;
      if (this.isCorrectAnswer(player.latestAnswer, revealInput)) {
        player.score += 1;
      }
    }
    return lobby;
  }

  nextRound(joinCode: string) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'lobby';
    lobby.currentQuestionId = null;
    lobby.roundDeadline = null;
    for (const player of lobby.players.values()) {
      player.latestAnswer = null;
      player.readyForNext = false;
    }
    return lobby;
  }

  endGame(joinCode: string) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'results';
    lobby.roundDeadline = null;
    return lobby;
  }

  resetGame(joinCode: string) {
    const lobby = this.getLobby(joinCode);
    return this.resetLobbyForMenu(lobby);
  }

  clearToMenu(joinCode: string) {
    const lobby = this.getLobby(joinCode);
    return this.resetLobbyForMenu(lobby);
  }

  markPlayerContinue(joinCode: string, playerSocketId: string) {
    const lobby = this.getLobby(joinCode);
    if (lobby.status !== 'reveal') {
      throw new BadRequestException('Continue is only allowed during reveal');
    }

    const player = this.findPlayerBySocketId(lobby, playerSocketId);
    if (!player) {
      throw new NotFoundException('Player not in lobby');
    }

    player.readyForNext = true;
    return lobby;
  }

  countReadyForNext(lobby: Lobby) {
    let ready = 0;
    for (const player of lobby.players.values()) {
      if (player.readyForNext) {
        ready += 1;
      }
    }
    return ready;
  }

  allPlayersReadyForNext(lobby: Lobby) {
    return lobby.players.size > 0 && this.countReadyForNext(lobby) === lobby.players.size;
  }

  toPublicLobbyState(lobby: Lobby) {
    return {
      joinCode: lobby.joinCode,
      status: lobby.status,
      currentQuestionId: lobby.currentQuestionId,
      roundDeadline: lobby.roundDeadline,
      players: Array.from(lobby.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        avatarDataUrl: player.avatarDataUrl,
        score: player.score,
        answered: Boolean(player.latestAnswer),
        latestAnswer: player.latestAnswer,
        readyForNext: player.readyForNext,
      })),
      maxPlayers: MAX_PLAYERS,
    };
  }
}
