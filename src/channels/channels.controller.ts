import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChannelsService } from './channels.service';
import { AddChannelMembersDto } from './dto/add-channel-members.dto';
import { CreateChannelDto } from './dto/create-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}
  @Post() async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateChannelDto,
  ) {
    return {
      data: await this.channels.create(user.userId, workspaceId, body),
      meta: {},
    };
  }
  @Get() async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      data: await this.channels.list(user.userId, workspaceId),
      meta: {},
    };
  }
  @Post(':channelId/join') async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
  ) {
    return {
      data: await this.channels.join(user.userId, workspaceId, channelId),
      meta: {},
    };
  }

  @Delete(':channelId') async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
  ) {
    return {
      data: await this.channels.remove(user.userId, workspaceId, channelId),
      meta: {},
    };
  }

  @Get(':channelId/members') async listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
  ) {
    return {
      data: await this.channels.listMembers(
        user.userId,
        workspaceId,
        channelId,
      ),
      meta: {},
    };
  }

  @Post(':channelId/members') async addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('channelId') channelId: string,
    @Body() body: AddChannelMembersDto,
  ) {
    return {
      data: await this.channels.addMembers(
        user.userId,
        workspaceId,
        channelId,
        body.userIds,
      ),
      meta: {},
    };
  }
}
