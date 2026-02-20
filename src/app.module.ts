import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SpotifyModule } from './spotify/spotify.module';
import { QuizModule } from './quiz/quiz.module';
import { MultiplayerModule } from './multiplayer/multiplayer.module';
import { DevSpotifyController } from './dev/dev.spotify.controller';
import { ChooseModule } from './choose/choose.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    SpotifyModule,
    ChooseModule,
    QuizModule,
    MultiplayerModule,
  ],
  controllers: [AppController, DevSpotifyController],
  providers: [AppService],
})
export class AppModule {}
