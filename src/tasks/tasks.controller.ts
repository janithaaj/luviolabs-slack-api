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
  CreateProjectTaskDto,
  CreateTaskFromMessageDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** Legacy workspace tasks (chat create-task dialog) */
  @Post('workspaces/:workspaceId/tasks')
  async createLegacy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      sourceMessageId?: string;
      sourceConversationId?: string;
      isDecision?: boolean;
    },
  ) {
    return {
      data: await this.tasks.createLegacy(user.userId, workspaceId, body),
      meta: {},
    };
  }

  @Get('workspaces/:workspaceId/tasks')
  async listLegacy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      data: await this.tasks.listLegacy(user.userId, workspaceId),
      meta: {},
    };
  }

  @Post('projects/:projectId/tasks')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateProjectTaskDto,
  ) {
    return {
      data: await this.tasks.create(user.userId, projectId, body),
      meta: {},
    };
  }

  @Get('projects/:projectId/tasks')
  async listByProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('unassigned') unassigned?: string,
    @Query('sprintId') sprintId?: string,
    @Query('backlog') backlog?: string,
    @Query('onBoard') onBoard?: string,
  ) {
    return {
      data: await this.tasks.listByProject(user.userId, projectId, {
        status,
        priority,
        assigneeId,
        unassigned: unassigned === 'true' || unassigned === '1',
        sprintId,
        backlog: backlog === 'true' || backlog === '1',
        onBoard:
          onBoard === 'true' || onBoard === '1'
            ? true
            : onBoard === 'false' || onBoard === '0'
              ? false
              : undefined,
      }),
      meta: {},
    };
  }

  @Get('tasks/my')
  async myTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('projectId') projectId?: string,
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
  ) {
    return {
      data: await this.tasks.myTasks(user.userId, workspaceId, {
        status,
        priority,
        projectId,
        dueFrom,
        dueTo,
      }),
      meta: {},
    };
  }

  @Get('tasks/:taskId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
  ) {
    return { data: await this.tasks.get(user.userId, taskId), meta: {} };
  }

  @Patch('tasks/:taskId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return {
      data: await this.tasks.update(user.userId, taskId, body),
      meta: {},
    };
  }

  @Delete('tasks/:taskId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
  ) {
    return {
      data: await this.tasks.softDelete(user.userId, taskId),
      meta: {},
    };
  }

  @Post('tasks/:taskId/complete')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
  ) {
    return {
      data: await this.tasks.complete(user.userId, taskId),
      meta: {},
    };
  }

  @Post('tasks/:taskId/reopen')
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
  ) {
    return { data: await this.tasks.reopen(user.userId, taskId), meta: {} };
  }

  @Post('messages/:messageId/task')
  async createFromMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Body() body: CreateTaskFromMessageDto,
  ) {
    return {
      data: await this.tasks.createFromMessage(user.userId, messageId, body),
      meta: {},
    };
  }

  @Post('projects/:projectId/meetings/:meetingId/tasks')
  async createFromMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() body: CreateProjectTaskDto,
  ) {
    return {
      data: await this.tasks.createFromMeeting(
        user.userId,
        projectId,
        meetingId,
        body,
      ),
      meta: {},
    };
  }
}
