import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AddBoardColumnDto,
  AddProjectMemberDto,
  CreateProjectDto,
  RemoveBoardColumnDto,
  UpdateBoardColumnDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post('workspaces/:workspaceId/projects')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateProjectDto,
  ) {
    return {
      data: await this.projects.create(user.userId, workspaceId, body),
      meta: {},
    };
  }

  @Get('workspaces/:workspaceId/projects')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
  ) {
    return {
      data: await this.projects.list(user.userId, workspaceId, status),
      meta: {},
    };
  }

  @Get('projects/:projectId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return { data: await this.projects.get(user.userId, projectId), meta: {} };
  }

  @Patch('projects/:projectId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: UpdateProjectDto,
  ) {
    return {
      data: await this.projects.update(user.userId, projectId, body),
      meta: {},
    };
  }

  @Post('projects/:projectId/archive')
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return {
      data: await this.projects.archive(user.userId, projectId),
      meta: {},
    };
  }

  @Post('projects/:projectId/complete')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return {
      data: await this.projects.complete(user.userId, projectId),
      meta: {},
    };
  }

  @Get('projects/:projectId/summary')
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return {
      data: await this.projects.summary(user.userId, projectId),
      meta: {},
    };
  }

  @Get('projects/:projectId/activity')
  async activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('before') before?: string,
  ) {
    return {
      data: await this.projects.listActivity(user.userId, projectId, before),
      meta: {},
    };
  }

  @Get('projects/:projectId/members')
  async listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return {
      data: await this.projects.listMembers(user.userId, projectId),
      meta: {},
    };
  }

  @Post('projects/:projectId/members')
  async addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: AddProjectMemberDto,
  ) {
    return {
      data: await this.projects.addMember(user.userId, projectId, body),
      meta: {},
    };
  }

  @Patch('projects/:projectId/members/:targetUserId')
  async updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() body: UpdateProjectMemberDto,
  ) {
    return {
      data: await this.projects.updateMember(
        user.userId,
        projectId,
        targetUserId,
        body,
      ),
      meta: {},
    };
  }

  @Delete('projects/:projectId/members/:targetUserId')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return {
      data: await this.projects.removeMember(
        user.userId,
        projectId,
        targetUserId,
      ),
      meta: {},
    };
  }

  @Post('projects/:projectId/board-columns')
  async addBoardColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: AddBoardColumnDto,
  ) {
    return {
      data: await this.projects.addBoardColumn(user.userId, projectId, body),
      meta: {},
    };
  }

  @Patch('projects/:projectId/board-columns/:columnId')
  async updateBoardColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @Body() body: UpdateBoardColumnDto,
  ) {
    return {
      data: await this.projects.updateBoardColumn(
        user.userId,
        projectId,
        columnId,
        body,
      ),
      meta: {},
    };
  }

  @Delete('projects/:projectId/board-columns/:columnId')
  async removeBoardColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @Body() body: RemoveBoardColumnDto,
  ) {
    return {
      data: await this.projects.removeBoardColumn(
        user.userId,
        projectId,
        columnId,
        body,
      ),
      meta: {},
    };
  }
}
