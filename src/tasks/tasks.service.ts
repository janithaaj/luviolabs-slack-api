import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationsService } from '../conversations/conversations.service';
import { Message } from '../messages/schemas/message.schema';
import { PermissionsService } from '../permissions/permissions.service';
import { ProjectActivityService } from '../project-activity/project-activity.service';
import { ProjectsRealtimeService } from '../projects/projects-realtime.service';
import { ProjectsService } from '../projects/projects.service';
import { Sprint } from '../sprints/schemas/sprint.schema';
import {
  CreateProjectTaskDto,
  CreateTaskFromMessageDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { Task } from './schemas/task.schema';

const DONE_LIKE = new Set(['DONE', 'CANCELLED']);

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly tasks: Model<Task>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(Sprint.name) private readonly sprints: Model<Sprint>,
    private readonly permissions: PermissionsService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
    private readonly activity: ProjectActivityService,
    @Inject(forwardRef(() => ProjectsRealtimeService))
    private readonly realtime: ProjectsRealtimeService,
    private readonly conversations: ConversationsService,
  ) {}

  async createLegacy(
    userId: string,
    workspaceId: string,
    input: {
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
    await this.permissions.requireMembership(userId, workspaceId);
    const task = await this.tasks.create({
      workspaceId,
      createdBy: userId,
      title: input.title.trim().slice(0, 500),
      description: input.description?.trim().slice(0, 5000),
      assigneeId: input.assigneeId,
      assigneeIds: input.assigneeId
        ? [new Types.ObjectId(input.assigneeId)]
        : [],
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      priority: input.priority ?? 'MEDIUM',
      sourceMessageId: input.sourceMessageId,
      sourceConversationId: input.sourceConversationId,
      isDecision: Boolean(input.isDecision),
      status: 'TODO',
      sortOrder: Date.now(),
      source: input.sourceMessageId
        ? {
            type: 'MESSAGE',
            entityId: new Types.ObjectId(input.sourceMessageId),
          }
        : { type: 'MANUAL' },
    });
    return this.toDto(task.toObject());
  }

  async listLegacy(userId: string, workspaceId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const tasks = await this.tasks
      .find({ workspaceId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
    return tasks.map((t) => this.toDto(t));
  }

  async create(
    userId: string,
    projectId: string,
    input: CreateProjectTaskDto,
  ) {
    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'task.create',
    );
    const workspaceId = project.workspaceId.toString();
    const assigneeIds = await this.validateAssignees(
      projectId,
      workspaceId,
      input.assigneeIds ?? [],
    );
    const { taskNumber, taskKey } =
      await this.projects.allocateTaskNumber(projectId);

    const maxSort = await this.tasks
      .findOne({ projectId, status: input.status ?? 'TODO', deletedAt: null })
      .sort({ sortOrder: -1 })
      .select({ sortOrder: 1 })
      .lean()
      .exec();
    const sortOrder =
      input.sortOrder ?? (maxSort?.sortOrder ?? 0) + 1000;
    const status = input.status ?? 'TODO';
    const onBoard = input.onBoard ?? true;
    await this.assertValidStatus(projectId, status);
    await this.assertOpenSprint(projectId, input.sprintId);
    await this.assertWipCapacity(projectId, status, { onBoard });

    const task = await this.tasks.create({
      workspaceId,
      projectId,
      taskNumber,
      taskKey,
      createdBy: userId,
      title: input.title.trim().slice(0, 500),
      description: input.description?.trim().slice(0, 5000),
      descriptionJson: input.descriptionJson,
      descriptionPlainText:
        input.descriptionPlainText?.trim().slice(0, 5000) ??
        input.description?.trim().slice(0, 5000),
      assigneeIds,
      assigneeId: assigneeIds[0],
      status,
      priority: input.priority ?? 'MEDIUM',
      issueType: input.issueType?.trim() || 'TASK',
      sprintId: input.sprintId ? new Types.ObjectId(input.sprintId) : undefined,
      onBoard,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      parentTaskId: input.parentTaskId,
      sortOrder,
      source: { type: 'MANUAL' },
    });

    const conversation = await this.conversations.createTaskConversation(
      workspaceId,
      projectId,
      task.id,
      userId,
      [userId, ...assigneeIds.map((id) => id.toString())],
    );
    task.conversationId = conversation._id as Types.ObjectId;
    await task.save();

    await this.activity.record({
      workspaceId,
      projectId,
      actorId: userId,
      type: 'task.created',
      entityType: 'TASK',
      entityId: task.id,
      metadata: { title: task.title, taskKey },
    });

    const dto = this.toDto(task.toObject());
    this.realtime.toProject(projectId, 'task.created', dto);
    for (const assigneeId of assigneeIds) {
      this.realtime.toUsers([assigneeId.toString()], 'TASK_ASSIGNED', dto);
    }
    return dto;
  }

  async listByProject(
    userId: string,
    projectId: string,
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      unassigned?: boolean;
      sprintId?: string;
      backlog?: boolean;
      onBoard?: boolean;
    } = {},
  ) {
    await this.projects.requireProjectAccess(userId, projectId, 'project.view');
    const query: Record<string, unknown> = {
      projectId,
      deletedAt: null,
      status: { $ne: 'CANCELLED' },
    };
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.unassigned) query.assigneeIds = { $size: 0 };
    else if (filters.assigneeId) query.assigneeIds = filters.assigneeId;
    if (filters.backlog) {
      query.$or = [{ sprintId: null }, { sprintId: { $exists: false } }];
    } else if (filters.sprintId) {
      query.sprintId = filters.sprintId;
    }
    if (filters.onBoard === true) query.onBoard = { $ne: false };
    else if (filters.onBoard === false) query.onBoard = false;

    const tasks = await this.tasks
      .find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
    return tasks.map((t) => this.toDto(t));
  }

  async get(userId: string, taskId: string) {
    const task = await this.tasks.findById(taskId).exec();
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    if (task.projectId) {
      await this.projects.requireProjectAccess(
        userId,
        task.projectId.toString(),
        'project.view',
      );
    } else {
      await this.permissions.requireMembership(
        userId,
        task.workspaceId.toString(),
      );
    }
    return this.toDto(task.toObject());
  }

  async update(userId: string, taskId: string, input: UpdateTaskDto) {
    const task = await this.requireEditableTask(userId, taskId);
    const projectId = task.projectId!.toString();
    const workspaceId = task.workspaceId.toString();
    const before = {
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeIds: task.assigneeIds.map((id) => id.toString()),
      title: task.title,
    };

    if (input.title !== undefined) task.title = input.title.trim().slice(0, 500);
    if (input.description !== undefined)
      task.description = input.description.trim().slice(0, 5000);
    if (input.descriptionJson !== undefined)
      task.descriptionJson = input.descriptionJson;
    if (input.descriptionPlainText !== undefined)
      task.descriptionPlainText = input.descriptionPlainText
        .trim()
        .slice(0, 5000);
    if (input.status !== undefined) {
      await this.assertValidStatus(projectId, input.status);
      task.status = input.status;
      const category = await this.resolveStatusCategory(projectId, input.status);
      if (category === 'DONE' && !task.completedAt) {
        task.completedAt = new Date();
      }
      if (category !== 'DONE') task.completedAt = undefined;
    }
    if (input.sprintId !== undefined) {
      await this.assertOpenSprint(projectId, input.sprintId);
      if (input.sprintId) {
        task.sprintId = new Types.ObjectId(input.sprintId);
      } else {
        task.set('sprintId', null);
      }
    }
    if (input.onBoard !== undefined) task.onBoard = input.onBoard;
    const nextOnBoard = input.onBoard ?? task.onBoard !== false;
    const nextStatus = input.status ?? task.status;
    if (input.status !== undefined || input.onBoard !== undefined) {
      await this.assertWipCapacity(projectId, nextStatus, {
        onBoard: nextOnBoard,
        excludeTaskId: task.id,
      });
    }
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.issueType !== undefined) task.issueType = input.issueType.trim() || 'TASK';
    if (input.sortOrder !== undefined) task.sortOrder = input.sortOrder;
    if (input.startDate !== undefined) {
      task.startDate = input.startDate ? new Date(input.startDate) : undefined;
    }
    if (input.dueDate !== undefined) {
      task.dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    }
    if (input.parentTaskId !== undefined) {
      task.parentTaskId = input.parentTaskId
        ? new Types.ObjectId(input.parentTaskId)
        : undefined;
    }
    if (input.assigneeIds !== undefined) {
      const assigneeIds = await this.validateAssignees(
        projectId,
        workspaceId,
        input.assigneeIds,
      );
      task.assigneeIds = assigneeIds;
      task.assigneeId = assigneeIds[0];
    }

    await task.save();

    if (before.status !== task.status) {
      const category = await this.resolveStatusCategory(projectId, task.status);
      await this.activity.record({
        workspaceId,
        projectId,
        actorId: userId,
        type:
          category === 'DONE'
            ? 'task.completed'
            : before.status === 'DONE' ||
                (await this.resolveStatusCategory(projectId, before.status)) ===
                  'DONE'
              ? 'task.reopened'
              : 'task.status_changed',
        entityType: 'TASK',
        entityId: task.id,
        metadata: {
          from: before.status,
          to: task.status,
          taskKey: task.taskKey,
        },
      });
    }
    if (before.priority !== task.priority) {
      await this.activity.record({
        workspaceId,
        projectId,
        actorId: userId,
        type: 'task.priority_changed',
        entityType: 'TASK',
        entityId: task.id,
        metadata: { from: before.priority, to: task.priority },
      });
    }
    if (
      (before.dueDate?.getTime() ?? null) !== (task.dueDate?.getTime() ?? null)
    ) {
      await this.activity.record({
        workspaceId,
        projectId,
        actorId: userId,
        type: 'task.due_date_changed',
        entityType: 'TASK',
        entityId: task.id,
        metadata: { from: before.dueDate, to: task.dueDate },
      });
    }
    const afterAssignees = task.assigneeIds.map((id) => id.toString());
    const newlyAssigned = afterAssignees.filter(
      (id) => !before.assigneeIds.includes(id),
    );
    if (newlyAssigned.length > 0) {
      await this.activity.record({
        workspaceId,
        projectId,
        actorId: userId,
        type: 'task.assigned',
        entityType: 'TASK',
        entityId: task.id,
        metadata: { assigneeIds: newlyAssigned },
      });
      this.realtime.toUsers(newlyAssigned, 'TASK_ASSIGNED', this.toDto(task.toObject()));
    }

    const dto = this.toDto(task.toObject());
    this.realtime.toProject(projectId, 'task.updated', dto);
    const afterCategory = await this.resolveStatusCategory(projectId, task.status);
    const beforeCategory = await this.resolveStatusCategory(
      projectId,
      before.status,
    );
    if (afterCategory === 'DONE' && beforeCategory !== 'DONE') {
      this.realtime.toProject(projectId, 'task.completed', dto);
    }
    if (beforeCategory === 'DONE' && afterCategory !== 'DONE') {
      this.realtime.toProject(projectId, 'task.reopened', dto);
    }
    return dto;
  }

  async complete(userId: string, taskId: string) {
    const task = await this.requireEditableTask(userId, taskId);
    const projectId = task.projectId!.toString();
    const columns = this.projects.resolveBoardColumns(
      (await this.projects.findById(projectId))?.boardColumns,
    );
    const doneColumn =
      columns.find((column) => column.category === 'DONE') ?? columns[columns.length - 1];
    return this.update(userId, taskId, { status: doneColumn.id });
  }

  async reopen(userId: string, taskId: string) {
    const task = await this.requireEditableTask(userId, taskId);
    const projectId = task.projectId!.toString();
    const columns = this.projects.resolveBoardColumns(
      (await this.projects.findById(projectId))?.boardColumns,
    );
    const inProgress =
      columns.find((column) => column.category === 'IN_PROGRESS') ??
      columns.find((column) => column.category === 'TODO') ??
      columns[0];
    return this.update(userId, taskId, { status: inProgress.id });
  }

  async softDelete(userId: string, taskId: string) {
    const task = await this.requireEditableTask(userId, taskId, 'task.delete');
    task.deletedAt = new Date();
    await task.save();
    const dto = this.toDto(task.toObject());
    this.realtime.toProject(task.projectId!.toString(), 'task.deleted', dto);
    await this.activity.record({
      workspaceId: task.workspaceId.toString(),
      projectId: task.projectId!.toString(),
      actorId: userId,
      type: 'task.deleted',
      entityType: 'TASK',
      entityId: task.id,
      metadata: { taskKey: task.taskKey, title: task.title },
    });
    return dto;
  }

  async myTasks(
    userId: string,
    workspaceId: string,
    filters: {
      status?: string;
      priority?: string;
      projectId?: string;
      dueFrom?: string;
      dueTo?: string;
    } = {},
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    const query: Record<string, unknown> = {
      workspaceId,
      deletedAt: null,
      assigneeIds: userId,
      status: { $nin: ['DONE', 'CANCELLED'] },
    };
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.projectId) query.projectId = filters.projectId;
    if (filters.dueFrom || filters.dueTo) {
      query.dueDate = {
        ...(filters.dueFrom ? { $gte: new Date(filters.dueFrom) } : {}),
        ...(filters.dueTo ? { $lte: new Date(filters.dueTo) } : {}),
      };
    }

    const tasks = await this.tasks
      .find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return tasks.map((t) => this.toDto(t));
  }

  async createFromMessage(
    userId: string,
    messageId: string,
    input: CreateTaskFromMessageDto,
  ) {
    const message = await this.messages.findById(messageId).exec();
    if (!message || message.deletedAt)
      throw new NotFoundException('Message not found');

    const workspaceId = message.workspaceId.toString();
    await this.permissions.requireMembership(userId, workspaceId);

    const conversation = await this.conversations.findById(
      workspaceId,
      message.conversationId.toString(),
    );
    if (!conversation) throw new NotFoundException('Conversation not found');

    let projectId = input.projectId ?? conversation.projectId?.toString();
    if (!projectId) {
      throw new BadRequestException(
        'projectId is required when creating a task outside a project conversation',
      );
    }

    await this.projects.requireProjectAccess(userId, projectId, 'task.create');
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.workspaceId.toString() !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    const title =
      input.title?.trim() ||
      message.plainText?.trim() ||
      message.text?.trim() ||
      'Untitled task';

    const assigneeIds = await this.validateAssignees(
      projectId,
      workspaceId,
      input.assigneeIds ?? [],
    );
    const { taskNumber, taskKey } =
      await this.projects.allocateTaskNumber(projectId);

    const task = await this.tasks.create({
      workspaceId,
      projectId,
      taskNumber,
      taskKey,
      createdBy: userId,
      title: title.slice(0, 500),
      descriptionPlainText: message.plainText ?? message.text,
      assigneeIds,
      assigneeId: assigneeIds[0],
      status: 'TODO',
      priority: input.priority ?? 'MEDIUM',
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      sortOrder: Date.now(),
      source: {
        type: 'MESSAGE',
        entityId: message._id,
      },
      sourceMessageId: message._id,
      sourceConversationId: message.conversationId,
    });

    const taskConversation = await this.conversations.createTaskConversation(
      workspaceId,
      projectId,
      task.id,
      userId,
      [userId, ...assigneeIds.map((id) => id.toString())],
    );
    task.conversationId = taskConversation._id as Types.ObjectId;
    await task.save();

    await this.activity.record({
      workspaceId,
      projectId,
      actorId: userId,
      type: 'task.created',
      entityType: 'TASK',
      entityId: task.id,
      metadata: {
        title: task.title,
        taskKey,
        source: 'MESSAGE',
        messageId,
      },
    });

    const dto = this.toDto(task.toObject());
    this.realtime.toProject(projectId, 'task.created', dto);
    return dto;
  }

  async createFromMeeting(
    userId: string,
    projectId: string,
    meetingId: string,
    input: CreateProjectTaskDto,
  ) {
    const dto = await this.create(userId, projectId, input);
    await this.tasks.updateOne(
      { _id: dto.id },
      {
        $set: {
          source: {
            type: 'MEETING',
            entityId: new Types.ObjectId(meetingId),
          },
        },
      },
    );
    return this.get(userId, dto.id);
  }

  private async requireEditableTask(
    userId: string,
    taskId: string,
    permission: 'task.edit' | 'task.delete' = 'task.edit',
  ) {
    const task = await this.tasks.findById(taskId).exec();
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    if (!task.projectId) {
      throw new BadRequestException('Legacy tasks are read-only via this API');
    }
    try {
      await this.projects.requireProjectAccess(
        userId,
        task.projectId.toString(),
        permission,
      );
    } catch (error) {
      if (permission === 'task.edit') {
        await this.projects.requireProjectAccess(
          userId,
          task.projectId.toString(),
          'task.edit_own',
        );
        const isCreator = task.createdBy.toString() === userId;
        const isAssignee = task.assigneeIds.some(
          (id) => id.toString() === userId,
        );
        if (!isCreator && !isAssignee) throw error;
      } else {
        throw error;
      }
    }
    return task;
  }

  private async assertOpenSprint(
    projectId: string,
    sprintId?: string | null,
  ) {
    if (!sprintId) return;
    const sprint = await this.sprints
      .findOne({ _id: sprintId, projectId })
      .exec();
    if (!sprint) throw new BadRequestException('Sprint not found');
    if (sprint.state === 'CLOSED') {
      throw new BadRequestException('Cannot add work to a closed sprint');
    }
  }

  private async assertWipCapacity(
    projectId: string,
    status: string,
    options: { onBoard: boolean; excludeTaskId?: string },
  ) {
    if (!options.onBoard) return;
    const project = await this.projects.findById(projectId);
    const columns = this.projects.resolveBoardColumns(project?.boardColumns);
    const column = columns.find((item) => item.id === status);
    if (!column?.wipLimit || column.wipLimit <= 0) return;
    const query: Record<string, unknown> = {
      projectId,
      status,
      deletedAt: null,
      onBoard: { $ne: false },
    };
    if (options.excludeTaskId) query._id = { $ne: options.excludeTaskId };
    const count = await this.tasks.countDocuments(query);
    if (count >= column.wipLimit) {
      throw new BadRequestException(
        `Column "${column.name}" is at its WIP limit of ${column.wipLimit}`,
      );
    }
  }

  private async assertValidStatus(projectId: string, status: string) {
    if (status === 'CANCELLED' || status === 'OPEN') return;
    const project = await this.projects.findById(projectId);
    const columns = this.projects.resolveBoardColumns(project?.boardColumns);
    if (!columns.some((column) => column.id === status)) {
      throw new BadRequestException('Unknown board column status');
    }
  }

  private async resolveStatusCategory(projectId: string, status: string) {
    if (status === 'DONE') return 'DONE';
    if (status === 'CANCELLED') return 'DONE';
    const project = await this.projects.findById(projectId);
    const columns = this.projects.resolveBoardColumns(project?.boardColumns);
    return columns.find((column) => column.id === status)?.category ?? 'TODO';
  }

  private async validateAssignees(
    projectId: string,
    workspaceId: string,
    assigneeIds: string[],
  ) {
    const unique = [...new Set(assigneeIds.filter((id) => Types.ObjectId.isValid(id)))];
    for (const assigneeId of unique) {
      await this.permissions.requireMembership(assigneeId, workspaceId);
      await this.projects.assertProjectMember(projectId, assigneeId);
    }
    return unique.map((id) => new Types.ObjectId(id));
  }

  private toDto(task: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    projectId?: Types.ObjectId;
    taskNumber?: number;
    taskKey?: string;
    createdBy: Types.ObjectId;
    title: string;
    description?: string;
    descriptionJson?: unknown;
    descriptionPlainText?: string;
    assigneeIds?: Types.ObjectId[];
    assigneeId?: Types.ObjectId;
    startDate?: Date;
    dueDate?: Date;
    completedAt?: Date;
    estimatedMinutes?: number;
    parentTaskId?: Types.ObjectId;
    conversationId?: Types.ObjectId;
    priority: string;
    issueType?: string;
    sprintId?: Types.ObjectId;
    onBoard?: boolean;
    status: string;
    source?: { type: string; entityId?: Types.ObjectId };
    sourceMessageId?: Types.ObjectId;
    sourceConversationId?: Types.ObjectId;
    isDecision?: boolean;
    sortOrder?: number;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const status = task.status === 'OPEN' ? 'TODO' : task.status;
    const assigneeIds =
      task.assigneeIds?.map((id) => id.toString()) ??
      (task.assigneeId ? [task.assigneeId.toString()] : []);
    const overdue =
      Boolean(task.dueDate) &&
      task.dueDate! < new Date() &&
      !DONE_LIKE.has(status);

    return {
      id: task._id.toString(),
      workspaceId: task.workspaceId.toString(),
      projectId: task.projectId?.toString(),
      taskNumber: task.taskNumber,
      taskKey: task.taskKey,
      createdBy: task.createdBy.toString(),
      title: task.title,
      description: task.description,
      descriptionJson: task.descriptionJson,
      descriptionPlainText: task.descriptionPlainText,
      assigneeIds,
      assigneeId: assigneeIds[0],
      startDate: task.startDate,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      estimatedMinutes: task.estimatedMinutes,
      parentTaskId: task.parentTaskId?.toString(),
      conversationId: task.conversationId?.toString(),
      priority: task.priority,
      issueType: task.issueType || 'TASK',
      sprintId: task.sprintId?.toString() ?? null,
      onBoard: task.onBoard !== false,
      status,
      source: task.source
        ? {
            type: task.source.type,
            entityId: task.source.entityId?.toString(),
          }
        : task.sourceMessageId
          ? {
              type: 'MESSAGE' as const,
              entityId: task.sourceMessageId.toString(),
            }
          : undefined,
      sourceMessageId: task.sourceMessageId?.toString(),
      sourceConversationId: task.sourceConversationId?.toString(),
      isDecision: Boolean(task.isDecision),
      sortOrder: task.sortOrder ?? 0,
      overdue,
      deletedAt: task.deletedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
