import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';

type Player = {
  id: string;
  name: string;
  icon: string;
  score: number;
  latestAnswer: string | null;
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

@Injectable()
export class MultiplayerService {
  private readonly lobbies = new Map<string, Lobby>();

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
    for (const [code, lobby] of this.lobbies.entries()) {
      if (lobby.hostSocketId === hostSocketId) {
        this.lobbies.delete(code);
      }
    }
  }

  removePlayer(playerSocketId: string) {
    for (const lobby of this.lobbies.values()) {
      lobby.players.delete(playerSocketId);
    }
  }

  addPlayer(joinCode: string, playerSocketId: string, name: string, icon: string) {
    const lobby = this.getLobby(joinCode);
    if (lobby.players.size >= 10) {
      throw new BadRequestException('Lobby is full (max 10 players)');
    }
    if (lobby.status !== 'lobby') {
      throw new BadRequestException('Game already started');
    }
    lobby.players.set(playerSocketId, {
      id: randomUUID(),
      name: (name ?? '').trim().slice(0, 20) || 'Player',
      icon: (icon ?? '').trim().slice(0, 8) || '🙂',
      score: 0,
      latestAnswer: null,
    });
    return lobby;
  }

  startQuestion(joinCode: string, questionId: string, timerMs = 30_000) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'question';
    lobby.currentQuestionId = questionId;
    lobby.roundTimerMs = timerMs;
    lobby.roundDeadline = Date.now() + timerMs;
    for (const player of lobby.players.values()) {
      player.latestAnswer = null;
    }
    return lobby;
  }

  submitAnswer(joinCode: string, playerSocketId: string, answer: string) {
    const lobby = this.getLobby(joinCode);
    if (lobby.status !== 'question') {
      throw new BadRequestException('No active question');
    }
    const player = lobby.players.get(playerSocketId);
    if (!player) {
      throw new NotFoundException('Player not in lobby');
    }
    player.latestAnswer = String(answer ?? '').trim();
    return lobby;
  }

  reveal(joinCode: string, correctAnswer: string) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'reveal';
    lobby.roundDeadline = null;
    for (const player of lobby.players.values()) {
      if (
        player.latestAnswer &&
        player.latestAnswer.toLowerCase() === correctAnswer.toLowerCase()
      ) {
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
    }
    return lobby;
  }

  endGame(joinCode: string) {
    const lobby = this.getLobby(joinCode);
    lobby.status = 'results';
    lobby.roundDeadline = null;
    return lobby;
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
        icon: player.icon,
        score: player.score,
        answered: Boolean(player.latestAnswer),
        latestAnswer: player.latestAnswer,
      })),
      maxPlayers: 10,
    };
  }
}
