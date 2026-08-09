import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('register') register(
    @Body() body: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.auth.register(body, { userAgent, ipAddress });
  }

  @HttpCode(200) @Post('login') login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.auth.login(body, { userAgent, ipAddress });
  }

  @HttpCode(200) @Post('refresh') refresh(
    @Body() body: RefreshDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ) {
    return this.auth.refresh(body, { userAgent, ipAddress });
  }

  @UseGuards(JwtAuthGuard) @HttpCode(204) @Post('logout') async logout(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.logout(user.sessionId);
  }

  @UseGuards(JwtAuthGuard) @HttpCode(204) @Post('logout-all') async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.logoutAll(user.userId);
  }

  @UseGuards(JwtAuthGuard) @Get('me') async me(
    @CurrentUser() principal: AuthenticatedUser,
  ) {
    const user = await this.users.findById(principal.userId);
    return { data: user, meta: {} };
  }

  @UseGuards(JwtAuthGuard) @Patch('me/status') async updateStatus(
    @CurrentUser() principal: AuthenticatedUser,
    @Body() body: UpdateStatusDto,
  ) {
    const status = body.status?.trim() || undefined;
    const expiresAt =
      status && body.expiresAt ? new Date(body.expiresAt) : undefined;
    const user = await this.users.updateStatus(
      principal.userId,
      status,
      expiresAt,
    );
    return { data: user, meta: {} };
  }
}
