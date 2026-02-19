import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuizModule } from '../quiz/quiz.module';
import { MultiplayerGateway } from './multiplayer.gateway';
import { MultiplayerService } from './multiplayer.service';

@Module({
  imports: [AuthModule, QuizModule],
  providers: [MultiplayerGateway, MultiplayerService],
})
export class MultiplayerModule {}
