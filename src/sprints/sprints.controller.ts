import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CompleteSprintDto,
  CreateSprintDto,
  StartSprintDto,
  UpdateSprintDto,
} from './dto/sprint.dto';
import { SprintsService } from './sprints.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/sprints')
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return { data: await this.sprints.list(user.userId, projectId), meta: {} };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateSprintDto,
  ) {
    return {
      data: await this.sprints.create(user.userId, projectId, body),
      meta: {},
    };
  }

  @Patch(':sprintId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: UpdateSprintDto,
  ) {
    return {
      data: await this.sprints.update(user.userId, projectId, sprintId, body),
      meta: {},
    };
  }

  @Post(':sprintId/start')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: StartSprintDto,
  ) {
    return {
      data: await this.sprints.start(user.userId, projectId, sprintId, body),
      meta: {},
    };
  }

  @Post(':sprintId/complete')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Body() body: CompleteSprintDto,
  ) {
    return {
      data: await this.sprints.complete(user.userId, projectId, sprintId, body),
      meta: {},
    };
  }
}
