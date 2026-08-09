import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
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
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const result = await this.messages.list(
      user.userId,
      workspaceId,
      conversationId,
      before,
      limit,
    );
    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }
}
