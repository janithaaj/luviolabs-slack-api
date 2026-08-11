import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post() async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: CreateMessageDto,
  ) {
    return {
      data: await this.messages.create(
        user.userId,
        workspaceId,
        conversationId,
        body,
      ),
      meta: {},
    };
  }

  @Get() async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Query('before') before?: string,
    @Query('threadRootId') threadRootId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const result = await this.messages.list(
      user.userId,
      workspaceId,
      conversationId,
      before,
      limit,
      threadRootId,
    );
    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Patch(':messageId') async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: UpdateMessageDto,
  ) {
    return {
      data: await this.messages.update(
        user.userId,
        workspaceId,
        conversationId,
        messageId,
        body,
      ),
      meta: {},
    };
  }

  @Delete(':messageId') async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return {
      data: await this.messages.softDelete(
        user.userId,
        workspaceId,
        conversationId,
        messageId,
      ),
      meta: {},
    };
  }

  @Post(':messageId/reactions') async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return {
      data: await this.messages.toggleReaction(
        user.userId,
        workspaceId,
        conversationId,
        messageId,
        body.emoji,
      ),
      meta: {},
    };
  }

  @Post(':messageId/pin') async pin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: { pinned?: boolean },
  ) {
    return {
      data: await this.messages.setPinned(
        user.userId,
        workspaceId,
        conversationId,
        messageId,
        body.pinned !== false,
      ),
      meta: {},
    };
  }
}
