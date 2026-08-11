import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectActivityService } from '../project-activity/project-activity.service';
import { ProjectsRealtimeService } from '../projects/projects-realtime.service';
import { ProjectsService } from '../projects/projects.service';
import { Task } from '../tasks/schemas/task.schema';
import {
  CompleteSprintDto,
  CreateSprintDto,
  StartSprintDto,
  UpdateSprintDto,
} from './dto/sprint.dto';
import { Sprint } from './schemas/sprint.schema';

@Injectable()
export class SprintsService {
  constructor(
    @InjectModel(Sprint.name) private readonly sprints: Model<Sprint>,
    @InjectModel(Task.name) private readonly tasks: Model<Task>,
    private readonly projects: ProjectsService,
    private readonly activity: ProjectActivityService,
    private readonly realtime: ProjectsRealtimeService,
  ) {}

  async list(userId: string, projectId: string) {
    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'project.view',
    );
    const items = await this.sprints
      .find({ projectId: project._id })
      .sort({ state: 1, createdAt: -1 })
      .lean()
      .exec();
    const counts = await this.tasks.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          projectId: project._id,
          deletedAt: null,
          status: { $ne: 'CANCELLED' },
          sprintId: { $in: items.map((item) => item._id) },
        },
      },
      { $group: { _id: '$sprintId', count: { $sum: 1 } } },
    ]);
    const countById = new Map(
      counts.map((row) => [row._id.toString(), row.count]),
    );
    return items.map((sprint) =>
      this.toDto(sprint, countById.get(sprint._id.toString()) ?? 0),
    );
  }

  async create(userId: string, projectId: string, input: CreateSprintDto) {
    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'task.create',
    );
    const existing = await this.sprints.countDocuments({ projectId });
    const sprint = await this.sprints.create({
      workspaceId: project.workspaceId,
      projectId: project._id,
      name: input.name?.trim() || `Sprint ${existing + 1}`,
      goal: input.goal?.trim() || undefined,
      state: 'FUTURE',
      createdBy: userId,
    });
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId,
      actorId: userId,
      type: 'sprint.created',
      entityType: 'SPRINT',
      entityId: sprint.id,
      metadata: { name: sprint.name },
    });
    const dto = this.toDto(sprint.toObject(), 0);
    this.realtime.toProject(projectId, 'sprint.updated', dto);
    return dto;
  }

  async update(
    userId: string,
    projectId: string,
    sprintId: string,
    input: UpdateSprintDto,
  ) {
    await this.projects.requireProjectAccess(userId, projectId, 'task.edit');
    const sprint = await this.requireSprint(projectId, sprintId);
    if (sprint.state === 'CLOSED') {
      throw new BadRequestException('Closed sprints cannot be edited');
    }
    if (input.name !== undefined) sprint.name = input.name.trim();
    if (input.goal !== undefined) sprint.goal = input.goal?.trim() || undefined;
    if (input.startDate !== undefined) {
      sprint.startDate = input.startDate ? new Date(input.startDate) : undefined;
    }
    if (input.endDate !== undefined) {
      sprint.endDate = input.endDate ? new Date(input.endDate) : undefined;
    }
    await sprint.save();
    const count = await this.countIssues(sprint._id);
    const dto = this.toDto(sprint.toObject(), count);
    this.realtime.toProject(projectId, 'sprint.updated', dto);
    return dto;
  }

  async start(
    userId: string,
    projectId: string,
    sprintId: string,
    input: StartSprintDto,
  ) {
    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'task.edit',
    );
    if ((project.boardType ?? 'KANBAN') !== 'SCRUM') {
      throw new BadRequestException('Sprints are only available on Scrum projects');
    }
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (!(endDate > startDate)) {
      throw new BadRequestException('Sprint end date must be after the start date');
    }
    const active = await this.sprints
      .findOne({ projectId, state: 'ACTIVE' })
      .exec();
    if (active && active.id !== sprintId) {
      throw new BadRequestException('This project already has an active sprint');
    }
    const sprint = await this.requireSprint(projectId, sprintId);
    if (sprint.state === 'CLOSED') {
      throw new BadRequestException('A closed sprint cannot be started');
    }
    sprint.state = 'ACTIVE';
    sprint.startDate = startDate;
    sprint.endDate = endDate;
    if (input.goal !== undefined) sprint.goal = input.goal.trim() || undefined;
    sprint.startedAt = new Date();
    await sprint.save();
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId,
      actorId: userId,
      type: 'sprint.started',
      entityType: 'SPRINT',
      entityId: sprint.id,
      metadata: { name: sprint.name },
    });
    const dto = this.toDto(sprint.toObject(), await this.countIssues(sprint._id));
    this.realtime.toProject(projectId, 'sprint.updated', dto);
    return dto;
  }

  async complete(
    userId: string,
    projectId: string,
    sprintId: string,
    input: CompleteSprintDto,
  ) {
    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'task.edit',
    );
    const sprint = await this.requireSprint(projectId, sprintId);
    if (sprint.state !== 'ACTIVE') {
      throw new BadRequestException('Only an active sprint can be completed');
    }
    let nextSprintId: Types.ObjectId | null = null;
    if (input.nextSprintId) {
      const next = await this.requireSprint(projectId, input.nextSprintId);
      if (next.state === 'CLOSED') {
        throw new BadRequestException('Choose an open sprint for leftover work');
      }
      nextSprintId = next._id;
    }
    const columns = this.projects.resolveBoardColumns(project.boardColumns);
    const doneIds = columns
      .filter((column) => column.category === 'DONE')
      .map((column) => column.id);
    await this.tasks.updateMany(
      {
        projectId,
        sprintId: sprint._id,
        deletedAt: null,
        status: { $nin: [...doneIds, 'CANCELLED'] },
      },
      { $set: { sprintId: nextSprintId } },
    );
    sprint.state = 'CLOSED';
    sprint.completedAt = new Date();
    await sprint.save();
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId,
      actorId: userId,
      type: 'sprint.completed',
      entityType: 'SPRINT',
      entityId: sprint.id,
      metadata: { name: sprint.name },
    });
    const dto = this.toDto(sprint.toObject(), await this.countIssues(sprint._id));
    this.realtime.toProject(projectId, 'sprint.updated', dto);
    return dto;
  }

  async requireOpenSprint(projectId: string, sprintId: string) {
    const sprint = await this.requireSprint(projectId, sprintId);
    if (sprint.state === 'CLOSED') {
      throw new BadRequestException('Cannot add work to a closed sprint');
    }
    return sprint;
  }

  private async requireSprint(projectId: string, sprintId: string) {
    const sprint = await this.sprints.findById(sprintId).exec();
    if (!sprint || sprint.projectId.toString() !== projectId) {
      throw new NotFoundException('Sprint not found');
    }
    return sprint;
  }

  private countIssues(sprintId: Types.ObjectId) {
    return this.tasks.countDocuments({
      sprintId,
      deletedAt: null,
      status: { $ne: 'CANCELLED' },
    });
  }

  private toDto(
    sprint: {
      _id: Types.ObjectId;
      workspaceId: Types.ObjectId;
      projectId: Types.ObjectId;
      name: string;
      goal?: string;
      startDate?: Date;
      endDate?: Date;
      state: string;
      createdBy: Types.ObjectId;
      startedAt?: Date;
      completedAt?: Date;
      createdAt: Date;
      updatedAt: Date;
    },
    issueCount: number,
  ) {
    return {
      id: sprint._id.toString(),
      workspaceId: sprint.workspaceId.toString(),
      projectId: sprint.projectId.toString(),
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      state: sprint.state,
      createdBy: sprint.createdBy.toString(),
      startedAt: sprint.startedAt,
      completedAt: sprint.completedAt,
      issueCount,
      createdAt: sprint.createdAt,
      updatedAt: sprint.updatedAt,
    };
  }
}
