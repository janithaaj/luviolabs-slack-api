import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import { WorkspacesService } from './workspaces.service';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post() async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWorkspaceDto,
  ) {
    return { data: await this.workspaces.create(user.userId, body), meta: {} };
  }

  @Get() async list(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.workspaces.listForUser(user.userId), meta: {} };
  }

  @Get(':workspaceId/members') async listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      data: await this.workspaces.listMembers(user.userId, workspaceId),
      meta: {},
    };
  }

  @Post(':workspaceId/members') async addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: AddWorkspaceMemberDto,
  ) {
    return {
      data: await this.workspaces.addMember(
        user.userId,
        workspaceId,
        body.email,
        body.role,
      ),
      meta: {},
    };
  }
}
