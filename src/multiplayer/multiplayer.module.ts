import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuizModule } from '../quiz/quiz.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { MultiplayerGateway } from './multiplayer.gateway';
import { MultiplayerService } from './multiplayer.service';

@Module({
  imports: [AuthModule, QuizModule, SpotifyModule],
  providers: [MultiplayerGateway, MultiplayerService],
})
export class MultiplayerModule {}
