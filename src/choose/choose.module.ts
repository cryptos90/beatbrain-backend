import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { ChooseController } from './choose.controller';
import { ChooseService } from './choose.service';

@Module({
  imports: [AuthModule, SpotifyModule],
  controllers: [ChooseController],
  providers: [ChooseService],
})
export class ChooseModule {}
