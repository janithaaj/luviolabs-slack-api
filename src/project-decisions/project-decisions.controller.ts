import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectsService } from '../projects/projects.service';
import { ProjectDecisionsService } from './project-decisions.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ProjectDecisionsController {
  constructor(
    private readonly decisions: ProjectDecisionsService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/decisions')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    const project = await this.projects.requireProjectAccess(user.userId, projectId, 'project.view');
    return {
      data: await this.decisions.list(projectId),
      meta: { workspaceId: project.workspaceId.toString() },
    };
  }

  @Post('projects/:projectId/decisions')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      sourceMessageId?: string;
      sourceConversationId?: string;
      sourceMeetingId?: string;
    },
  ) {
    const project = await this.projects.requireProjectAccess(
      user.userId,
      projectId,
      'decision.create',
    );
    return {
      data: await this.decisions.create(
        user.userId,
        project.workspaceId.toString(),
        projectId,
        body,
      ),
      meta: {},
    };
  }

  @Delete('decisions/:decisionId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('decisionId') decisionId: string,
  ) {
    return {
      data: await this.decisions.softDelete(user.userId, decisionId),
      meta: {},
    };
  }

  @Post('messages/:messageId/decision')
  async createFromMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      projectId?: string;
    },
  ) {
    return {
      data: await this.decisions.createFromMessage(user.userId, messageId, body),
      meta: {},
    };
  }
}
