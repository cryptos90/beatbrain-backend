import { BadRequestException, HttpException, Logger } from '@nestjs/common';
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
  playbackMode?: 'host_web_sdk' | 'server';
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
  playerSessionId?: string;
};

type PlayerAnswerBody = {
  joinCode: string;
  answer: string;
};

type PlayerContinueBody = {
  joinCode: string;
};

type PlayerLeaveBody = {
  joinCode: string;
  playerSessionId?: string;
};

type RoundRevealContext = {
  correctAnswer: string;
  answerType?: string;
  format?: string;
  toleranceYears?: number;
  correctYear?: number;
};

const MAX_TRACK_UNPLAYABLE_SKIPS = 100;
type PlaybackMode = 'host_web_sdk' | 'server';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MultiplayerGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MultiplayerGateway.name);
  private readonly roundTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lobbyQuizSessionIds = new Map<string, string>();
  private readonly lobbyPlaybackModes = new Map<string, PlaybackMode>();
  private readonly lobbyRoundRevealContexts = new Map<string, RoundRevealContext>();
  private readonly autoAdvanceInFlight = new Set<string>();
  private readonly disconnectedPlayerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly playerDisconnectGraceMs = 90_000;

  constructor(
    private readonly authService: AuthService,
    private readonly quizService: QuizService,
    private readonly spotifyService: SpotifyService,
    private readonly multiplayerService: MultiplayerService,
  ) {}

  handleDisconnect(client: Socket) {
    const disconnectedPlayers = this.multiplayerService.markPlayerDisconnected(client.id);
    for (const disconnected of disconnectedPlayers) {
      this.broadcastLobby(disconnected.joinCode);
      this.scheduleDisconnectedPlayerCleanup(
        disconnected.joinCode,
        disconnected.playerSessionId,
      );
    }

    const removedHostLobbies = this.multiplayerService.removeHostLobby(client.id);
    for (const joinCode of removedHostLobbies) {
      this.clearRoundTimer(joinCode);
      this.clearLobbyRoundState(joinCode);
      this.clearLobbyPlaybackMode(joinCode);
      this.cleanupQuizSessionForLobby(joinCode);
      this.clearDisconnectedPlayerCleanupForLobby(joinCode);
    }
  }

  private normalizeJoinCode(joinCode: string) {
    return String(joinCode ?? '').trim().toUpperCase();
  }

  private disconnectedPlayerTimerKey(joinCode: string, playerSessionId: string) {
    return `${this.normalizeJoinCode(joinCode)}:${String(playerSessionId ?? '').trim()}`;
  }

  private cancelDisconnectedPlayerCleanup(joinCode: string, playerSessionId: string) {
    const timerKey = this.disconnectedPlayerTimerKey(joinCode, playerSessionId);
    const timerHandle = this.disconnectedPlayerTimers.get(timerKey);
    if (!timerHandle) {
      return;
    }
    clearTimeout(timerHandle);
    this.disconnectedPlayerTimers.delete(timerKey);
  }

  private scheduleDisconnectedPlayerCleanup(joinCode: string, playerSessionId: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const normalizedPlayerSessionId = String(playerSessionId ?? '').trim();
    if (!normalizedPlayerSessionId) {
      return;
    }

    this.cancelDisconnectedPlayerCleanup(normalizedJoinCode, normalizedPlayerSessionId);

    const timerKey = this.disconnectedPlayerTimerKey(
      normalizedJoinCode,
      normalizedPlayerSessionId,
    );
    const timerHandle = setTimeout(() => {
      this.disconnectedPlayerTimers.delete(timerKey);
      this.cleanupDisconnectedPlayer(normalizedJoinCode, normalizedPlayerSessionId);
    }, this.playerDisconnectGraceMs);

    this.disconnectedPlayerTimers.set(timerKey, timerHandle);
  }

  private clearDisconnectedPlayerCleanupForLobby(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const keyPrefix = `${normalizedJoinCode}:`;
    for (const [timerKey, timerHandle] of this.disconnectedPlayerTimers.entries()) {
      if (!timerKey.startsWith(keyPrefix)) {
        continue;
      }
      clearTimeout(timerHandle);
      this.disconnectedPlayerTimers.delete(timerKey);
    }
  }

  private cleanupDisconnectedPlayer(joinCode: string, playerSessionId: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const normalizedPlayerSessionId = String(playerSessionId ?? '').trim();
    if (!normalizedPlayerSessionId) {
      return;
    }

    let removed = false;
    try {
      const result = this.multiplayerService.removeDisconnectedPlayer(
        normalizedJoinCode,
        normalizedPlayerSessionId,
      );
      removed = result.removed;
    } catch {
      return;
    }

    if (!removed) {
      return;
    }

    this.broadcastLobby(normalizedJoinCode);
    this.abortSessionIfNoPlayers(normalizedJoinCode);
  }

  private cleanupQuizSessionForLobby(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const quizSessionId = this.lobbyQuizSessionIds.get(normalizedJoinCode);
    if (!quizSessionId) {
      return;
    }

    this.lobbyQuizSessionIds.delete(normalizedJoinCode);
    this.quizService.deleteSession(quizSessionId);
  }

  private getLobbyPlaybackMode(joinCode: string): PlaybackMode {
    return this.lobbyPlaybackModes.get(this.normalizeJoinCode(joinCode)) ?? 'server';
  }

  private setLobbyPlaybackMode(joinCode: string, playbackMode?: PlaybackMode) {
    this.lobbyPlaybackModes.set(
      this.normalizeJoinCode(joinCode),
      playbackMode === 'host_web_sdk' ? 'host_web_sdk' : 'server',
    );
  }

  private clearLobbyPlaybackMode(joinCode: string) {
    this.lobbyPlaybackModes.delete(this.normalizeJoinCode(joinCode));
  }

  private abortSessionIfNoPlayers(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    let lobby;
    try {
      lobby = this.multiplayerService.getLobby(normalizedJoinCode);
    } catch {
      return;
    }

    if (lobby.players.size > 0) {
      return;
    }

    this.clearRoundTimer(normalizedJoinCode);
    this.clearLobbyRoundState(normalizedJoinCode);
    this.clearLobbyPlaybackMode(normalizedJoinCode);
    this.clearDisconnectedPlayerCleanupForLobby(normalizedJoinCode);
    this.cleanupQuizSessionForLobby(normalizedJoinCode);

    const menuLobby = this.multiplayerService.clearToMenu(normalizedJoinCode);
    const publicState = this.multiplayerService.toPublicLobbyState(menuLobby);
    this.server.to(normalizedJoinCode).emit('session:returnedToMenu', publicState);
    this.broadcastLobby(normalizedJoinCode);
  }

  private clearRoundTimer(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const timerHandle = this.roundTimers.get(normalizedJoinCode);
    if (timerHandle) {
      clearTimeout(timerHandle);
      this.roundTimers.delete(normalizedJoinCode);
    }
  }

  private clearLobbyRoundState(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    this.lobbyRoundRevealContexts.delete(normalizedJoinCode);
    this.autoAdvanceInFlight.delete(normalizedJoinCode);
  }

  private toSocketErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse() as any;
      if (typeof response === 'string' && response.trim()) {
        return response.trim();
      }
      if (typeof response?.message === 'string' && response.message.trim()) {
        return response.message.trim();
      }
      if (Array.isArray(response?.message) && typeof response.message[0] === 'string') {
        return response.message[0];
      }
      return `Request failed (${error.getStatus()})`;
    }

    if (error instanceof Error) {
      return error.message || 'Request failed';
    }

    return 'Request failed';
  }

  private emitClientSocketError(client: Socket, error: unknown) {
    client.emit('exception', {
      message: this.toSocketErrorMessage(error),
    });
  }

  private emitRoundReveal(joinCode: string, context: RoundRevealContext) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    const revealed = this.multiplayerService.reveal(normalizedJoinCode, context);
    this.server.to(normalizedJoinCode).emit('round:reveal', {
      correctAnswer: context.correctAnswer,
      state: this.multiplayerService.toPublicLobbyState(revealed),
    });
    this.broadcastLobby(normalizedJoinCode);
  }

  private autoRevealRound(joinCode: string, trigger: 'allAnswered' | 'timeUp') {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    let lobby;
    try {
      lobby = this.multiplayerService.getLobby(normalizedJoinCode);
    } catch {
      return;
    }

    if (lobby.status !== 'question') {
      return;
    }

    const roundRevealContext = this.lobbyRoundRevealContexts.get(normalizedJoinCode);
    if (!roundRevealContext) {
      return;
    }

    this.clearRoundTimer(normalizedJoinCode);
    this.server.to(normalizedJoinCode).emit(
      trigger === 'allAnswered' ? 'round:allAnswered' : 'round:timeUp',
      {
        joinCode: normalizedJoinCode,
      },
    );
    this.emitRoundReveal(normalizedJoinCode, roundRevealContext);
  }

  private async startRoundFromSession(input: {
    joinCode: string;
    quizSessionId: string;
    hostJwtSub: string;
    timerMs?: number;
    playbackMode?: PlaybackMode;
  }) {
    const normalizedJoinCode = this.normalizeJoinCode(input.joinCode);
    const normalizedQuizSessionId = String(input.quizSessionId ?? '').trim();
    if (!normalizedQuizSessionId) {
      throw new BadRequestException('Missing quizSessionId');
    }

    this.lobbyQuizSessionIds.set(normalizedJoinCode, normalizedQuizSessionId);
    this.clearRoundTimer(normalizedJoinCode);

    for (let attempt = 0; attempt < MAX_TRACK_UNPLAYABLE_SKIPS; attempt += 1) {
      const questionPayload = await this.quizService.nextQuestion(normalizedQuizSessionId);
      if (questionPayload.done || !questionPayload.question) {
        this.clearRoundTimer(normalizedJoinCode);
        this.clearLobbyRoundState(normalizedJoinCode);
        this.cleanupQuizSessionForLobby(normalizedJoinCode);
        const ended = this.multiplayerService.endGame(normalizedJoinCode);
        this.server
          .to(normalizedJoinCode)
          .emit('game:ended', this.multiplayerService.toPublicLobbyState(ended));
        return { done: true } as const;
      }

      const question = questionPayload.question;
      const trackUri = String(question.correctTrackUri ?? '').trim();
      if (!trackUri) {
        this.logger.warn(
          `[quiz] skipping question without track uri joinCode=${normalizedJoinCode} songId=${question.correctSongId}`,
        );
        continue;
      }

      let playbackErrorMessage: string | null = null;
      const playbackMode = input.playbackMode ?? this.getLobbyPlaybackMode(normalizedJoinCode);
      if (playbackMode !== 'host_web_sdk') {
        try {
          await this.spotifyService.startPlayback(trackUri, undefined, 0, input.hostJwtSub);
        } catch (error) {
          if (this.isTrackUnplayablePlaybackError(error)) {
            this.logger.warn(
              `[quiz] skipping unplayable spotify track joinCode=${normalizedJoinCode} songId=${question.correctSongId}`,
            );
            continue;
          }
          playbackErrorMessage = this.toPlaybackErrorMessage(error);
        }
      }

      const timerMs = Math.max(1, Math.floor(input.timerMs ?? 30_000));
      this.multiplayerService.startQuestion(normalizedJoinCode, question.correctSongId, timerMs);
      this.lobbyRoundRevealContexts.set(normalizedJoinCode, {
        correctAnswer: question.correctAnswer,
        answerType: question.questionObject.answerType,
        format: question.questionObject.format,
        toleranceYears: question.questionObject.payload?.toleranceYears,
        correctYear: question.questionObject.payload?.correctYear,
      });

      this.server.to(normalizedJoinCode).emit('round:question', {
        ...questionPayload,
        timerMs,
      });
      this.broadcastLobby(normalizedJoinCode);
      this.startRoundTimer(normalizedJoinCode, timerMs);

      if (playbackErrorMessage) {
        this.server.to(normalizedJoinCode).emit('round:playbackError', {
          message: playbackErrorMessage,
        });
      }

      return questionPayload;
    }

    throw new BadRequestException(
      'Could not find a playable Spotify track for the next round.',
    );
  }

  private async autoStartNextRound(joinCode: string) {
    const normalizedJoinCode = this.normalizeJoinCode(joinCode);
    if (this.autoAdvanceInFlight.has(normalizedJoinCode)) {
      return;
    }

    const quizSessionId = this.lobbyQuizSessionIds.get(normalizedJoinCode);
    if (!quizSessionId) {
      return;
    }

    let lobby;
    try {
      lobby = this.multiplayerService.getLobby(normalizedJoinCode);
    } catch {
      return;
    }

    if (lobby.status !== 'reveal' || !this.multiplayerService.allPlayersReadyForNext(lobby)) {
      return;
    }

    this.autoAdvanceInFlight.add(normalizedJoinCode);
    try {
      await this.startRoundFromSession({
        joinCode: normalizedJoinCode,
        quizSessionId,
        hostJwtSub: lobby.hostJwtSub,
        timerMs: lobby.roundTimerMs ?? 30_000,
        playbackMode: this.getLobbyPlaybackMode(normalizedJoinCode),
      });
    } catch (error) {
      this.server.to(normalizedJoinCode).emit('exception', {
        message: this.toSocketErrorMessage(error),
      });
      this.broadcastLobby(normalizedJoinCode);
    } finally {
      this.autoAdvanceInFlight.delete(normalizedJoinCode);
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

      this.autoRevealRound(normalizedJoinCode, 'timeUp');
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

  private readHttpExceptionCode(error: unknown) {
    if (!(error instanceof HttpException)) {
      return '';
    }

    const response = error.getResponse();
    if (response && typeof response === 'object') {
      return String((response as { code?: unknown }).code ?? '').trim();
    }

    return '';
  }

  private isTrackUnplayablePlaybackError(error: unknown) {
    return this.readHttpExceptionCode(error) === 'TRACK_UNPLAYABLE';
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
    this.setLobbyPlaybackMode(lobby.joinCode, 'server');

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
    const normalizedJoinCode = this.normalizeJoinCode(body?.joinCode ?? '');
    const normalizedPlayerSessionId = String(body?.playerSessionId ?? '').trim();

    try {
      if (!normalizedJoinCode) {
        throw new BadRequestException('Session ID is required');
      }

      const joined = normalizedPlayerSessionId
        ? this.multiplayerService.reconnectPlayer(
            normalizedJoinCode,
            client.id,
            normalizedPlayerSessionId,
          )
        : this.multiplayerService.addPlayer(
            normalizedJoinCode,
            client.id,
            body?.name,
            body?.avatarDataUrl,
          );

      this.cancelDisconnectedPlayerCleanup(joined.lobby.joinCode, joined.playerSessionId);

      client.join(joined.lobby.joinCode);
      client.emit('player:session', {
        joinCode: this.normalizeJoinCode(joined.lobby.joinCode),
        playerSessionId: joined.playerSessionId,
      });
      this.broadcastLobby(joined.lobby.joinCode);
      return this.multiplayerService.toPublicLobbyState(joined.lobby);
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          `player:join rejected joinCode=${normalizedJoinCode || '<empty>'} reason=${this.toSocketErrorMessage(error)}`,
        );
      } else {
        this.logger.error(
          `player:join failed joinCode=${normalizedJoinCode || '<empty>'}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      this.emitClientSocketError(client, error);
      return null;
    }
  }

  @SubscribeMessage('host:startRound')
  async hostStartRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostStartRoundBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const normalizedJoinCode = this.normalizeJoinCode(body.joinCode);
    const lobby = this.multiplayerService.getLobby(normalizedJoinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }

    if (
      lobby.status === 'reveal' &&
      !this.multiplayerService.allPlayersReadyForNext(lobby)
    ) {
      throw new BadRequestException('Waiting for players to continue');
    }

    this.setLobbyPlaybackMode(normalizedJoinCode, body.playbackMode);
    return this.startRoundFromSession({
      joinCode: normalizedJoinCode,
      quizSessionId: body.quizSessionId,
      hostJwtSub: hostJwt.sub,
      timerMs: body.timerMs,
      playbackMode: body.playbackMode,
    });
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
      this.autoRevealRound(body.joinCode, 'allAnswered');
    }
    return { ok: true };
  }

  @SubscribeMessage('player:continue')
  async playerContinue(
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
      await this.autoStartNextRound(body.joinCode);
    }

    return {
      ok: true,
      readyPlayers,
      totalPlayers,
    };
  }

  @SubscribeMessage('player:leave')
  playerLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlayerLeaveBody,
  ) {
    const removed = this.multiplayerService.removePlayer(
      body.joinCode,
      client.id,
      body.playerSessionId,
    );
    this.cancelDisconnectedPlayerCleanup(removed.lobby.joinCode, removed.playerSessionId);
    this.broadcastLobby(removed.lobby.joinCode);
    this.abortSessionIfNoPlayers(removed.lobby.joinCode);
    return { ok: true };
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
    this.emitRoundReveal(body.joinCode, {
      correctAnswer: body.correctAnswer,
    });
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
    this.clearLobbyRoundState(body.joinCode);
    this.clearLobbyPlaybackMode(body.joinCode);
    this.cleanupQuizSessionForLobby(body.joinCode);
    const endedLobby = this.multiplayerService.endGame(body.joinCode);
    this.server
      .to(this.normalizeJoinCode(body.joinCode))
      .emit('game:ended', this.multiplayerService.toPublicLobbyState(endedLobby));
    return this.multiplayerService.toPublicLobbyState(endedLobby);
  }

  @SubscribeMessage('host:restartQuiz')
  hostRestartQuiz(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostActionBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }
    this.clearRoundTimer(body.joinCode);
    this.clearLobbyRoundState(body.joinCode);
    this.clearLobbyPlaybackMode(body.joinCode);
    this.cleanupQuizSessionForLobby(body.joinCode);
    const resetLobby = this.multiplayerService.resetGame(body.joinCode);
    const publicState = this.multiplayerService.toPublicLobbyState(resetLobby);
    this.server.to(this.normalizeJoinCode(body.joinCode)).emit('game:restarted', publicState);
    this.broadcastLobby(body.joinCode);
    return publicState;
  }

  @SubscribeMessage('host:returnToMenu')
  hostReturnToMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostActionBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }
    this.clearRoundTimer(body.joinCode);
    this.clearLobbyRoundState(body.joinCode);
    this.clearLobbyPlaybackMode(body.joinCode);
    this.cleanupQuizSessionForLobby(body.joinCode);
    const menuLobby = this.multiplayerService.clearToMenu(body.joinCode);
    const publicState = this.multiplayerService.toPublicLobbyState(menuLobby);
    this.server
      .to(this.normalizeJoinCode(body.joinCode))
      .emit('session:returnedToMenu', publicState);
    this.broadcastLobby(body.joinCode);
    return publicState;
  }
}
