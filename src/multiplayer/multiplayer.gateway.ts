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
  icon: string;
};

type PlayerAnswerBody = {
  joinCode: string;
  answer: string;
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

  constructor(
    private readonly authService: AuthService,
    private readonly quizService: QuizService,
    private readonly multiplayerService: MultiplayerService,
  ) {}

  handleDisconnect(client: Socket) {
    this.multiplayerService.removePlayer(client.id);
    this.multiplayerService.removeHostLobby(client.id);
  }

  private assertHost(hostJwt: string) {
    return this.authService.verifyHostJwtOrThrow(`Bearer ${hostJwt}`);
  }

  private broadcastLobby(joinCode: string) {
    const lobby = this.multiplayerService.getLobby(joinCode);
    this.server
      .to(joinCode.toUpperCase())
      .emit('lobby:state', this.multiplayerService.toPublicLobbyState(lobby));
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
      body.icon,
    );
    client.join(lobby.joinCode);
    this.broadcastLobby(lobby.joinCode);
    return this.multiplayerService.toPublicLobbyState(lobby);
  }

  @SubscribeMessage('host:startRound')
  hostStartRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: HostStartRoundBody,
  ) {
    const hostJwt = this.assertHost(body.hostJwt);
    const lobby = this.multiplayerService.getLobby(body.joinCode);
    if (lobby.hostSocketId !== client.id || lobby.hostJwtSub !== hostJwt.sub) {
      throw new Error('Host not authorized for this lobby');
    }

    const questionPayload = this.quizService.nextQuestion(body.quizSessionId);
    if (questionPayload.done || !questionPayload.question) {
      const ended = this.multiplayerService.endGame(body.joinCode);
      this.server
        .to(body.joinCode.toUpperCase())
        .emit('game:ended', this.multiplayerService.toPublicLobbyState(ended));
      return { done: true };
    }

    const question = questionPayload.question;

    this.multiplayerService.startQuestion(
      body.joinCode,
      question.correctSongId,
      body.timerMs ?? 30_000,
    );

    this.server.to(body.joinCode.toUpperCase()).emit('round:question', {
      ...questionPayload,
      timerMs: body.timerMs ?? 30_000,
    });
    this.broadcastLobby(body.joinCode);
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
      this.server
        .to(body.joinCode.toUpperCase())
        .emit('round:allAnswered', { joinCode: body.joinCode.toUpperCase() });
    }
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

    const revealed = this.multiplayerService.reveal(body.joinCode, body.correctAnswer);
    this.server.to(body.joinCode.toUpperCase()).emit('round:reveal', {
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
    const endedLobby = this.multiplayerService.endGame(body.joinCode);
    this.server
      .to(body.joinCode.toUpperCase())
      .emit('game:ended', this.multiplayerService.toPublicLobbyState(endedLobby));
    return this.multiplayerService.toPublicLobbyState(endedLobby);
  }
}
