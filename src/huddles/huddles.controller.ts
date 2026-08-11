import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  HuddleHistoryQueryDto,
  InviteHuddleDto,
  StartHuddleDto,
} from './dto/huddles.dto';
import { HuddlesService } from './huddles.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class HuddlesController {
  constructor(private readonly huddles: HuddlesService) {}

  @Post('huddles')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartHuddleDto,
  ) {
    return { data: await this.huddles.start(user.userId, body), meta: {} };
  }

  @Get('conversations/:conversationId/huddle')
  async active(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return {
      data: await this.huddles.active(user.userId, conversationId),
      meta: {},
    };
  }

  @Post('huddles/:huddleId/join')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('huddleId') huddleId: string,
  ) {
    return { data: await this.huddles.join(user.userId, huddleId), meta: {} };
  }

  @Post('huddles/:huddleId/leave')
  async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('huddleId') huddleId: string,
  ) {
    return { data: await this.huddles.leave(user.userId, huddleId), meta: {} };
  }

  @Post('huddles/:huddleId/end')
  async end(
    @CurrentUser() user: AuthenticatedUser,
    @Param('huddleId') huddleId: string,
  ) {
    return { data: await this.huddles.end(user.userId, huddleId), meta: {} };
  }

  @Get('huddles/:huddleId/participants')
  async participants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('huddleId') huddleId: string,
  ) {
    return {
      data: await this.huddles.listParticipants(user.userId, huddleId),
      meta: {},
    };
  }

  @Post('huddles/:huddleId/invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('huddleId') huddleId: string,
    @Body() body: InviteHuddleDto,
  ) {
    return {
      data: await this.huddles.invite(user.userId, huddleId, body.userIds),
      meta: {},
    };
  }

  @Get('conversations/:conversationId/huddles')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query() query: HuddleHistoryQueryDto,
  ) {
    return {
      data: await this.huddles.history(
        user.userId,
        conversationId,
        query.cursor,
        query.limit,
      ),
      meta: {},
    };
  }
}
