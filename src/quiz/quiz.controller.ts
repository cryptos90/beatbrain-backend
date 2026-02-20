import { Body, Controller, Delete, Headers, Param, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { QuizService } from './quiz.service';

@Controller('quiz')
export class QuizController {
  constructor(
    private readonly authService: AuthService,
    private readonly quizService: QuizService,
  ) {}

  @Post('sessions')
  async createSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body()
    body: {
      playlistId?: string;
      questionCount?: number;
      decadeTag?: string;
    },
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.quizService.createSession({
      playlistId: (body.playlistId ?? '').trim(),
      questionCount: body.questionCount,
      decadeTag: typeof body.decadeTag === 'string' ? body.decadeTag : undefined,
    });
  }

  @Post('sessions/:id/next')
  nextQuestion(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('id') sessionId: string,
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.quizService.nextQuestion(sessionId);
  }

  @Delete('sessions/:id')
  deleteSession(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('id') sessionId: string,
  ) {
    this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.quizService.deleteSession(sessionId);
  }
}
