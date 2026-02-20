import { BadRequestException, HttpException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { QuizService } from '../quiz/quiz.service';
import { SpotifyService } from '../spotify/spotify.service';
import { MultiplayerService } from './multiplayer.service';

type HostCreateLobbyBody = {
  hostJwt: string;
};

type HostStartRoundBody = {
  hostJwt: string;
  joinCode: string;
  quizSessionId: string;
  timerMs?: number;
};

type HostRevealBody = {
  hostJwt: string;
  joinCode: string;
  correctAnswer: string;
};

type HostActionBody = {
  hostJwt: string;
  joinCode: string;
};

type PlayerJoinBody = {
  joinCode: string;
  name: string;
  avatarDataUrl: string;
};

type PlayerAnswerBody = {
  joinCode: string;
  answer: string;
};

type PlayerContinueBody = {
  joinCode: string;
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MultiplayerGateway {
  @WebSocketServer()
  server!: Server;

  private readonly roundTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly authService: AuthService,
    private readonly quizService: QuizService,
    private readonly spotifyService: SpotifyService,
    private readonly multiplayerService: MultiplayerService,
  ) {}

  handleDisconnect(client: Socket) {
    this.multiplayerService.removePlayer(client.id);
    const removedHostLobbies = this.multiplayerService.removeHostLobby(client.id);
    for (const joinCode of removedHostLobbies) {
      this.clearRoundTimer(joinCode);
    }
  }

  private normalizeJoinCode(joinCode: string) {
    return String(joinCode ?? '').trim().toUpperCase();
  }

  private clearRoundTimer(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const timerHandle = this.roundTimers.get(normalizedJoinCode);
    if (timerHandle) {
      clearTimeout(timerHandle);
      this.roundTimers.delete(normalizedJoinCode);
    }
  }

  private startRoundTimer(joinCode: string, timerMs: number) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    this.clearRoundTimer(normalizedJoinCode);

    const timerHandle = setTimeout(() => {
      this.roundTimers.delete(normalizedJoinCode);

      let lobby;
      try {
        lobby = this.multiplayerService.getLobby(normalizedJoinCode);
      } catch {
        return;
      }

      if (lobby.status !== 'question') {
        return;
      }

      this.server.to(normalizedJoinCode).emit('round:timeUp', {
        joinCode: normalizedJoinCode,
      });
      this.broadcastLobby(normalizedJoinCode);
    }, Math.max(1, Math.floor(timerMs)));

    this.roundTimers.set(normalizedJoinCode, timerHandle);
  }

  private assertHost(hostJwt: string) {
    return this.authService.verifyHostJwtOrThrow(`Bearer ${hostJwt}`);
  }

  private toPlaybackErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse() as any;
      if (typeof response === 'string' && response.trim()) {
        return response;
      }
      if (typeof response?.message === 'string' && response.message.trim()) {
        return response.message;
      }
      if (Array.isArray(response?.message) && typeof response.message[0] === 'string') {
        return response.message[0];
      }
      return `Playback request failed (${error.getStatus()})`;
    }
    if (error instanceof Error) {
      return error.message || 'Playback request failed';
    }
    return 'Playback request failed';
  }

  private broadcastLobby(joinCode: string) {
    try {
      const lobby = this.multiplayerService.getLobby(joinCode);
      this.server
        .to(this.normalizeJoinCode(joinCode))
        .emit('lobby:state', this.multiplayerService.toPublicLobbyState(lobby));
    } catch {
      // Lobby might have been removed already.
    }
  }

  @SubscribeMessage('host:createLobby')
  hostCreateLobby(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostCreateLobbyBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.createLobby(client.id, hostJwt.sub);

    client.join(lobby.joinCode);
    const state = this.multiplayerService.toPublicLobbyState(lobby);
    client.emit('host:lobbyCreated', state);
    return state;
  }

  @SubscribeMessage('player:join')
  playerJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlayerJoinBody,
  ) {
    const lobby = this.multiplayerService.addPlayer(
      body.joinCode,
      client.id,
      body.name,
      body.avatarDataUrl,
    );
    client.join(lobby.joinCode);
    this.broadcastLobby(lobby.joinCode);
    return this.multiplayerService.toPublicLobbyState(lobby);
  }

  @SubscribeMessage('host:startRound')
  async hostStartRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostStartRoundBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }

    if (
      lobby.status === 'reveal' &&
      !this.multiplayerService.allPlayersReadyForNext(lobby)
    ) {
      throw new BadRequestException('Waiting for players to continue');
    }

    this.clearRoundTimer(body.joinCode);

    const questionPayload = await this.quizService.nextQuestion(body.quizSessionId);
    if (questionPayload.done || !questionPayload.question) {
      const ended = this.multiplayerService.endGame(body.joinCode);
      this.server
        .to(this.normalizeJoinCode(body.joinCode))
        .emit('game:ended', this.multiplayerService.toPublicLobbyState(ended));
      return { done: true };
    }

    const question = questionPayload.question;
    const timerMs = Math.max(1, Math.floor(body.timerMs ?? 30_000));

    this.multiplayerService.startQuestion(body.joinCode, question.correctSongId, timerMs);

    this.server.to(this.normalizeJoinCode(body.joinCode)).emit('round:question', {
      ...questionPayload,
      timerMs,
    });
    this.broadcastLobby(body.joinCode);
    this.startRoundTimer(body.joinCode, timerMs);

    try {
      await this.spotifyService.startPlayback(question.correctTrackUri);
    } catch (error) {
      this.server.to(this.normalizeJoinCode(body.joinCode)).emit('round:playbackError', {
        message: this.toPlaybackErrorMessage(error),
      });
    }

    return questionPayload;
  }

  @SubscribeMessage('player:answer')
  playerAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlayerAnswerBody,
  ) {
    const lobby = this.multiplayerService.submitAnswer(
      body.joinCode,
      client.id,
      body.answer,
    );

    this.broadcastLobby(body.joinCode);

    const allAnswered =
      lobby.players.size > 0 &&
      Array.from(lobby.players.values()).every((player) => player.latestAnswer);
    if (allAnswered) {
      this.server.to(this.normalizeJoinCode(body.joinCode)).emit('round:allAnswered', {
        joinCode: this.normalizeJoinCode(body.joinCode),
      });
    }
    return { ok: true };
  }

  @SubscribeMessage('player:continue')
  playerContinue(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlayerContinueBody,
  ) {
    const lobby = this.multiplayerService.markPlayerContinue(body.joinCode, client.id);
    const readyPlayers = this.multiplayerService.countReadyForNext(lobby);
    const totalPlayers = lobby.players.size;

    this.broadcastLobby(body.joinCode);

    if (this.multiplayerService.allPlayersReadyForNext(lobby)) {
      this.server.to(this.normalizeJoinCode(body.joinCode)).emit('round:allContinued', {
        joinCode: this.normalizeJoinCode(body.joinCode),
        readyPlayers,
        totalPlayers,
      });
    }

    return {
      ok: true,
      readyPlayers,
      totalPlayers,
    };
  }

  @SubscribeMessage('host:reveal')
  hostReveal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostRevealBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }

    this.clearRoundTimer(body.joinCode);

    const revealed = this.multiplayerService.reveal(body.joinCode, body.correctAnswer);
    this.server.to(this.normalizeJoinCode(body.joinCode)).emit('round:reveal', {
      correctAnswer: body.correctAnswer,
      state: this.multiplayerService.toPublicLobbyState(revealed),
    });
    this.broadcastLobby(body.joinCode);
    return { ok: true };
  }

  @SubscribeMessage('host:next')
  hostNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostActionBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }
    if (lobby.status === 'reveal' && !this.multiplayerService.allPlayersReadyForNext(lobby)) {
      throw new BadRequestException('Waiting for players to continue');
    }
    this.clearRoundTimer(body.joinCode);
    const nextLobby = this.multiplayerService.nextRound(body.joinCode);
    this.broadcastLobby(body.joinCode);
    return this.multiplayerService.toPublicLobbyState(nextLobby);
  }

  @SubscribeMessage('host:end')
  hostEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostActionBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }
    this.clearRoundTimer(body.joinCode);
    const endedLobby = this.multiplayerService.endGame(body.joinCode);
    this.server
      .to(this.normalizeJoinCode(body.joinCode))
      .emit('game:ended', this.multiplayerService.toPublicLobbyState(endedLobby));
    return this.multiplayerService.toPublicLobbyState(endedLobby);
  }
}

