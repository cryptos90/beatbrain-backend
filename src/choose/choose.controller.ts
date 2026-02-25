import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ChooseService } from './choose.service';

@Controller()
export class ChooseController {
  constructor(
    private readonly chooseService: ChooseService,
    private readonly authService: AuthService,
  ) {}

  @Get('choose')
  async getChoosePlaylists(
    @Headers('authorization') authorizationHeader: string | undefined,
  ) {
    const jwt = this.authService.verifyHostJwtOrThrow(authorizationHeader);
    return this.chooseService.getUserPlaylists(jwt.sub);
  }
}
