import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { StartDirectMessageDto } from './dto/start-direct-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/direct-messages')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async listDirectMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      data: await this.conversations.listDirectMessages(
        user.userId,
        workspaceId,
      ),
      meta: {},
    };
  }

  @Post()
  async startDirectMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: StartDirectMessageDto,
  ) {
    return {
      data: await this.conversations.startDirectMessage(
        user.userId,
        workspaceId,
        body.targetUserId,
      ),
      meta: {},
    };
  }

  @Post(':conversationId/read')
  async markDirectMessageRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return {
      data: await this.conversations.markDirectMessageRead(
        user.userId,
        workspaceId,
        conversationId,
      ),
      meta: {},
    };
  }
}
