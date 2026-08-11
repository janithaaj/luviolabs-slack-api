import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConversationsService } from '../conversations/conversations.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ProjectActivityService } from '../project-activity/project-activity.service';
import { Task } from '../tasks/schemas/task.schema';
import { UsersService } from '../users/users.service';
import {
  AddBoardColumnDto,
  AddProjectMemberDto,
  CreateProjectDto,
  RemoveBoardColumnDto,
  UpdateBoardColumnDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from './dto/project.dto';
import {
  ProjectPermission,
  ProjectRole,
  projectRolePermissions,
} from './projects.permissions';
import { ProjectsRealtimeService } from './projects-realtime.service';
import { ProjectMember } from './schemas/project-member.schema';
import {
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_WORK_TYPES,
  Project,
  type BoardColumn,
  type WorkType,
} from './schemas/project.schema';

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'project';
}

function normalizeKey(key?: string) {
  if (!key?.trim()) return undefined;
  return key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<Project>,
    @InjectModel(ProjectMember.name)
    private readonly members: Model<ProjectMember>,
    @InjectModel(Task.name) private readonly tasks: Model<Task>,
    private readonly permissions: PermissionsService,
    private readonly conversations: ConversationsService,
    private readonly activity: ProjectActivityService,
    private readonly realtime: ProjectsRealtimeService,
    private readonly users: UsersService,
  ) {}

  async requireProjectAccess(
    userId: string,
    projectId: string,
    permission: ProjectPermission,
  ) {
    const project = await this.projects.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    const workspaceId = project.workspaceId.toString();
    const workspaceMember = await this.permissions.requireMembership(
      userId,
      workspaceId,
    );

    const membership = await this.members
      .findOne({ projectId, userId, removedAt: null })
      .lean()
      .exec();

    const isWorkspaceAdmin =
      workspaceMember.role === 'OWNER' || workspaceMember.role === 'ADMIN';

    if (!membership && !isWorkspaceAdmin) {
      throw new ForbiddenException('Project access denied');
    }

    const role: ProjectRole = membership?.role ?? 'PROJECT_MANAGER';
    const allowed =
      projectRolePermissions[role].has(permission) ||
      (isWorkspaceAdmin &&
        (permission.startsWith('project.') ||
          permission.startsWith('task.') ||
          permission === 'decision.create' ||
          permission === 'meeting.create'));

    if (!allowed) {
      throw new ForbiddenException(`Missing project permission: ${permission}`);
    }

    if (
      project.status === 'ARCHIVED' &&
      !['project.view', 'chat.read', 'file.read'].includes(permission) &&
      permission !== 'project.archive'
    ) {
      throw new ForbiddenException('Archived projects are read-only');
    }

    return project;
  }

  async create(userId: string, workspaceId: string, input: CreateProjectDto) {
    await this.permissions.requireMembership(userId, workspaceId);

    const ownerId = input.ownerId ?? userId;
    await this.permissions.requireMembership(ownerId, workspaceId);

    const memberIds = [
      ...new Set([
        ownerId,
        userId,
        ...(input.memberIds ?? []).filter((id) => Types.ObjectId.isValid(id)),
      ]),
    ];
    for (const memberId of memberIds) {
      await this.permissions.requireMembership(memberId, workspaceId);
    }

    const key = normalizeKey(input.key);
    let slug = slugify(input.name);
    slug = await this.ensureUniqueSlug(workspaceId, slug);

    const project = await this.projects
      .create({
        workspaceId,
        name: input.name.trim(),
        key,
        slug,
        description: input.description?.trim(),
        status: 'ACTIVE',
        priority: input.priority ?? 'MEDIUM',
        health: 'ON_TRACK',
        ownerId,
        createdBy: userId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        nextTaskNumber: 0,
        boardColumns: DEFAULT_BOARD_COLUMNS.map((column) => ({ ...column })),
        workTypes: DEFAULT_WORK_TYPES.map((type) => ({ ...type })),
        boardType: input.boardType ?? 'KANBAN',
      })
      .catch((error: unknown) => {
        if ((error as { code?: number }).code === 11000) {
          throw new ConflictException(
            'A project with that key or URL already exists in this workspace',
          );
        }
        throw error;
      });

    try {
      await this.members.insertMany(
        memberIds.map((memberId) => ({
          workspaceId,
          projectId: project.id,
          userId: memberId,
          role: memberId === ownerId ? 'PROJECT_MANAGER' : 'MEMBER',
          addedBy: userId,
          joinedAt: new Date(),
        })),
      );

      const conversation = await this.conversations.createProjectConversation(
        workspaceId,
        project.id,
        userId,
        memberIds,
      );
      project.defaultConversationId = conversation._id as Types.ObjectId;
      await project.save();

      await this.activity.record({
        workspaceId,
        projectId: project.id,
        actorId: userId,
        type: 'project.created',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: { name: project.name, key: project.key },
      });

      const payload = await this.toProjectDto(project.toObject());
      this.realtime.toWorkspace(workspaceId, 'project.created', payload);
      this.realtime.toProject(project.id, 'project.created', payload);
      return payload;
    } catch (error: unknown) {
      await Promise.allSettled([
        this.members.deleteMany({ projectId: project.id }).exec(),
        this.conversations.removeProjectConversation(workspaceId, project.id),
        this.projects.deleteOne({ _id: project.id }).exec(),
      ]);
      throw error;
    }
  }

  async list(userId: string, workspaceId: string, status?: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const workspaceMember = await this.permissions.requireMembership(
      userId,
      workspaceId,
    );
    const isAdmin =
      workspaceMember.role === 'OWNER' || workspaceMember.role === 'ADMIN';

    const memberships = await this.members
      .find({ workspaceId, userId, removedAt: null })
      .select({ projectId: 1 })
      .lean()
      .exec();
    const projectIds = memberships.map((m) => m.projectId);

    const query: Record<string, unknown> = { workspaceId };
    if (!isAdmin) query._id = { $in: projectIds };
    if (status) query.status = status;
    else query.status = { $ne: 'ARCHIVED' };

    const projects = await this.projects
      .find(query)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return Promise.all(projects.map((p) => this.toProjectDto(p)));
  }

  async get(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.view',
    );
    return this.toProjectDto(project.toObject());
  }

  async update(userId: string, projectId: string, input: UpdateProjectDto) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.edit',
    );
    if (input.name !== undefined) project.name = input.name.trim();
    if (input.description !== undefined)
      project.description = input.description.trim();
    if (input.status !== undefined) project.status = input.status;
    if (input.priority !== undefined) project.priority = input.priority;
    if (input.health !== undefined) project.health = input.health;
    if (input.boardType !== undefined) project.boardType = input.boardType;
    if (input.ownerId !== undefined) {
      await this.permissions.requireMembership(
        input.ownerId,
        project.workspaceId.toString(),
      );
      await this.ensureActiveMember(project.id, input.ownerId);
      project.ownerId = new Types.ObjectId(input.ownerId);
    }
    if (input.startDate !== undefined)
      project.startDate = input.startDate ? new Date(input.startDate) : undefined;
    if (input.targetDate !== undefined)
      project.targetDate = input.targetDate
        ? new Date(input.targetDate)
        : undefined;
    if (input.boardColumns !== undefined) {
      const normalized = input.boardColumns.map((column, index) => ({
        id: column.id.trim(),
        name: column.name.trim(),
        category: column.category,
        sortOrder: column.sortOrder ?? (index + 1) * 1000,
        color: column.color,
        wipLimit: column.wipLimit,
      }));
      this.assertValidBoardColumns(normalized);
      project.boardColumns = normalized;
    }
    if (input.workTypes !== undefined) {
      const normalized = input.workTypes.map((type, index) => ({
        id: type.id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
        name: type.name.trim(),
        color: type.color.trim(),
        icon: type.icon,
        builtin: Boolean(type.builtin),
        sortOrder: type.sortOrder ?? (index + 1) * 1000,
      }));
      this.assertValidWorkTypes(normalized);
      project.workTypes = normalized;
    }

    await project.save();
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId: project.id,
      actorId: userId,
      type: 'project.updated',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: { ...input },
    });
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.updated', payload);
    this.realtime.toWorkspace(
      project.workspaceId.toString(),
      'project.updated',
      payload,
    );
    return payload;
  }

  async archive(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.archive',
    );
    project.status = 'ARCHIVED';
    project.archivedAt = new Date();
    await project.save();
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId: project.id,
      actorId: userId,
      type: 'project.archived',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: {},
    });
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.archived', payload);
    return payload;
  }

  async complete(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.complete',
    );
    project.status = 'COMPLETED';
    project.completedAt = new Date();
    await project.save();
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId: project.id,
      actorId: userId,
      type: 'project.completed',
      entityType: 'PROJECT',
      entityId: project.id,
      metadata: {},
    });
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.updated', payload);
    return payload;
  }

  async listMembers(userId: string, projectId: string) {
    await this.requireProjectAccess(userId, projectId, 'project.view');
    const memberships = await this.members
      .find({ projectId, removedAt: null })
      .lean()
      .exec();
    const users = await this.users.findPublicByIds(
      memberships.map((m) => m.userId.toString()),
    );
    const userById = new Map(users.map((u) => [u._id.toString(), u]));
    return memberships.map((m) => ({
      userId: m.userId.toString(),
      role: m.role,
      joinedAt: m.joinedAt,
      user: userById.get(m.userId.toString()) ?? null,
    }));
  }

  async addMember(
    userId: string,
    projectId: string,
    input: AddProjectMemberDto,
  ) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.member.add',
    );
    await this.permissions.requireMembership(
      input.userId,
      project.workspaceId.toString(),
    );
    const role = input.role ?? 'MEMBER';
    await this.members.updateOne(
      { projectId, userId: input.userId },
      {
        $set: {
          role,
          removedAt: null,
          addedBy: userId,
          joinedAt: new Date(),
        },
        $setOnInsert: {
          workspaceId: project.workspaceId,
          projectId,
          userId: input.userId,
        },
      },
      { upsert: true },
    );
    if (project.defaultConversationId) {
      await this.conversations.addProjectMembers(
        project.workspaceId.toString(),
        project.id,
        [input.userId],
      );
    }
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId: project.id,
      actorId: userId,
      type: 'project.member.added',
      entityType: 'MEMBER',
      entityId: input.userId,
      metadata: { role },
    });
    const members = await this.listMembers(userId, projectId);
    this.realtime.toProject(projectId, 'project.member.added', {
      projectId,
      userId: input.userId,
      role,
    });
    return members;
  }

  async updateMember(
    userId: string,
    projectId: string,
    targetUserId: string,
    input: UpdateProjectMemberDto,
  ) {
    await this.requireProjectAccess(userId, projectId, 'project.member.add');
    const membership = await this.members
      .findOne({ projectId, userId: targetUserId, removedAt: null })
      .exec();
    if (!membership) throw new NotFoundException('Project member not found');
    membership.role = input.role;
    await membership.save();
    return this.listMembers(userId, projectId);
  }

  async removeMember(userId: string, projectId: string, targetUserId: string) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.member.remove',
    );
    if (project.ownerId.toString() === targetUserId) {
      throw new BadRequestException('Cannot remove the project owner');
    }
    await this.members.updateOne(
      { projectId, userId: targetUserId },
      { $set: { removedAt: new Date() } },
    );
    await this.activity.record({
      workspaceId: project.workspaceId.toString(),
      projectId: project.id,
      actorId: userId,
      type: 'project.member.removed',
      entityType: 'MEMBER',
      entityId: targetUserId,
      metadata: {},
    });
    this.realtime.toProject(projectId, 'project.member.removed', {
      projectId,
      userId: targetUserId,
    });
    return this.listMembers(userId, projectId);
  }

  async summary(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.view',
    );
    const columns = this.resolveBoardColumns(project.boardColumns);
    const byCategory = (category: BoardColumn['category']) =>
      columns.filter((column) => column.category === category).map((c) => c.id);
    const doneIds = byCategory('DONE');
    const activeIds = columns
      .filter((column) => column.category !== 'DONE')
      .map((column) => column.id);

    const base = {
      workspaceId: project.workspaceId,
      projectId,
      deletedAt: null,
      status: { $nin: ['CANCELLED'] },
    };
    const [
      total,
      todo,
      inProgress,
      review,
      blocked,
      done,
      overdueCount,
      recentActivity,
      memberCount,
    ] = await Promise.all([
      this.tasks.countDocuments({ ...base }),
      this.tasks.countDocuments({
        ...base,
        status: { $in: byCategory('TODO') },
      }),
      this.tasks.countDocuments({
        ...base,
        status: { $in: byCategory('IN_PROGRESS') },
      }),
      this.tasks.countDocuments({
        ...base,
        status: { $in: byCategory('IN_REVIEW') },
      }),
      this.tasks.countDocuments({
        ...base,
        status: { $in: byCategory('BLOCKED') },
      }),
      this.tasks.countDocuments({
        ...base,
        status: { $in: doneIds.length ? doneIds : ['DONE'] },
      }),
      this.tasks.countDocuments({
        ...base,
        dueDate: { $lt: new Date() },
        status: {
          $in: activeIds.length ? activeIds : ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'],
        },
      }),
      this.activity.list(projectId, undefined, 8),
      this.members.countDocuments({ projectId, removedAt: null }),
    ]);

    const actionable = total;
    const progress =
      actionable === 0 ? 0 : Math.round((done / actionable) * 100);

    return {
      projectId,
      taskCounts: {
        total,
        todo,
        inProgress,
        review,
        blocked,
        done,
      },
      overdueCount,
      progress,
      memberCount,
      health: project.health,
      targetDate: project.targetDate,
      recentActivity,
      boardColumns: columns,
    };
  }

  async addBoardColumn(
    userId: string,
    projectId: string,
    input: AddBoardColumnDto,
  ) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.edit',
    );
    const columns = this.resolveBoardColumns(project.boardColumns);
    const maxSort = columns.reduce(
      (max, column) => Math.max(max, column.sortOrder ?? 0),
      0,
    );
    const column: BoardColumn = {
      id: `COL_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: input.name.trim(),
      category: input.category,
      sortOrder: maxSort + 1000,
      color: input.color,
      wipLimit: input.wipLimit,
    };
    columns.push(column);
    project.boardColumns = columns;
    await project.save();
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.updated', payload);
    return payload;
  }

  async updateBoardColumn(
    userId: string,
    projectId: string,
    columnId: string,
    input: UpdateBoardColumnDto,
  ) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.edit',
    );
    const columns = this.resolveBoardColumns(project.boardColumns);
    const index = columns.findIndex((column) => column.id === columnId);
    if (index < 0) throw new NotFoundException('Board column not found');
    columns[index] = {
      ...columns[index],
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.wipLimit !== undefined
        ? { wipLimit: input.wipLimit ?? undefined }
        : {}),
    };
    if (input.wipLimit === null) {
      delete columns[index].wipLimit;
    }
    project.boardColumns = columns;
    await project.save();
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.updated', payload);
    return payload;
  }

  async removeBoardColumn(
    userId: string,
    projectId: string,
    columnId: string,
    input: RemoveBoardColumnDto,
  ) {
    const project = await this.requireProjectAccess(
      userId,
      projectId,
      'project.edit',
    );
    const columns = this.resolveBoardColumns(project.boardColumns);
    if (columns.length <= 1) {
      throw new BadRequestException('A board must keep at least one column');
    }
    if (!columns.some((column) => column.id === columnId)) {
      throw new NotFoundException('Board column not found');
    }
    if (columnId === input.moveTasksToColumnId) {
      throw new BadRequestException('Choose a different column for existing tasks');
    }
    if (!columns.some((column) => column.id === input.moveTasksToColumnId)) {
      throw new BadRequestException('Target column does not exist');
    }
    await this.tasks.updateMany(
      { projectId, status: columnId, deletedAt: null },
      { $set: { status: input.moveTasksToColumnId } },
    );
    project.boardColumns = columns.filter((column) => column.id !== columnId);
    await project.save();
    const payload = await this.toProjectDto(project.toObject());
    this.realtime.toProject(project.id, 'project.updated', payload);
    return payload;
  }

  resolveBoardColumns(columns?: BoardColumn[] | null): BoardColumn[] {
    if (!columns || columns.length === 0) {
      return DEFAULT_BOARD_COLUMNS.map((column) => ({ ...column }));
    }
    return [...columns].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }

  resolveBoardType(boardType?: string | null): 'KANBAN' | 'SCRUM' {
    return boardType === 'SCRUM' ? 'SCRUM' : 'KANBAN';
  }

  resolveWorkTypes(types?: WorkType[] | null): WorkType[] {
    if (!types || types.length === 0) {
      return DEFAULT_WORK_TYPES.map((type) => ({ ...type }));
    }
    return [...types].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }

  private assertValidBoardColumns(columns: BoardColumn[]) {
    if (columns.length === 0) {
      throw new BadRequestException('Board must include at least one column');
    }
    const ids = new Set<string>();
    for (const column of columns) {
      if (!column.id?.trim() || !column.name?.trim()) {
        throw new BadRequestException('Each column needs an id and name');
      }
      if (ids.has(column.id)) {
        throw new BadRequestException(`Duplicate column id: ${column.id}`);
      }
      ids.add(column.id);
    }
  }

  private assertValidWorkTypes(types: WorkType[]) {
    if (types.length === 0) {
      throw new BadRequestException('At least one work type is required');
    }
    const ids = new Set<string>();
    for (const type of types) {
      if (!type.id?.trim() || !type.name?.trim()) {
        throw new BadRequestException('Each work type needs an id and name');
      }
      if (ids.has(type.id)) {
        throw new BadRequestException(`Duplicate work type id: ${type.id}`);
      }
      ids.add(type.id);
    }
  }

  async listActivity(userId: string, projectId: string, before?: string) {
    await this.requireProjectAccess(userId, projectId, 'project.view');
    return this.activity.list(projectId, before, 40);
  }

  async allocateTaskNumber(projectId: string) {
    const project = await this.projects
      .findByIdAndUpdate(
        projectId,
        { $inc: { nextTaskNumber: 1 } },
        { new: true },
      )
      .exec();
    if (!project) throw new NotFoundException('Project not found');
    const taskNumber = project.nextTaskNumber;
    const prefix = project.key?.trim() || 'TASK';
    return {
      taskNumber,
      taskKey: `${prefix}-${taskNumber}`,
      project,
    };
  }

  async assertProjectMember(projectId: string, userId: string) {
    const membership = await this.members
      .findOne({ projectId, userId, removedAt: null })
      .lean()
      .exec();
    if (!membership) throw new ForbiddenException('Not a project member');
    return membership;
  }

  async isProjectMember(projectId: string, userId: string) {
    return Boolean(
      await this.members
        .exists({ projectId, userId, removedAt: null })
        .exec(),
    );
  }

  async findById(projectId: string) {
    return this.projects.findById(projectId).exec();
  }

  private async ensureActiveMember(projectId: string, userId: string) {
    const membership = await this.members
      .findOne({ projectId, userId, removedAt: null })
      .lean()
      .exec();
    if (!membership) {
      throw new BadRequestException('Owner must be an active project member');
    }
  }

  private async ensureUniqueSlug(workspaceId: string, base: string) {
    let slug = base;
    let attempt = 0;
    while (attempt < 20) {
      const exists = await this.projects.exists({ workspaceId, slug });
      if (!exists) return slug;
      attempt += 1;
      slug = `${base}-${attempt + 1}`.slice(0, 140);
    }
    return `${base}-${Date.now().toString(36)}`.slice(0, 140);
  }

  private async toProjectDto(project: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    name: string;
    key?: string;
    slug: string;
    description?: string;
    status: string;
    priority: string;
    health: string;
    ownerId: Types.ObjectId;
    createdBy: Types.ObjectId;
    startDate?: Date;
    targetDate?: Date;
    completedAt?: Date;
    archivedAt?: Date;
    defaultConversationId?: Types.ObjectId;
    coverImageUrl?: string;
    boardColumns?: BoardColumn[];
    workTypes?: WorkType[];
    boardType?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const memberCount = await this.members.countDocuments({
      projectId: project._id,
      removedAt: null,
    });
    return {
      id: project._id.toString(),
      workspaceId: project.workspaceId.toString(),
      name: project.name,
      key: project.key,
      slug: project.slug,
      description: project.description,
      status: project.status,
      priority: project.priority,
      health: project.health,
      ownerId: project.ownerId.toString(),
      createdBy: project.createdBy.toString(),
      startDate: project.startDate,
      targetDate: project.targetDate,
      completedAt: project.completedAt,
      archivedAt: project.archivedAt,
      defaultConversationId: project.defaultConversationId?.toString(),
      coverImageUrl: project.coverImageUrl,
      boardColumns: this.resolveBoardColumns(project.boardColumns),
      workTypes: this.resolveWorkTypes(project.workTypes),
      boardType: this.resolveBoardType(project.boardType),
      memberCount,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
