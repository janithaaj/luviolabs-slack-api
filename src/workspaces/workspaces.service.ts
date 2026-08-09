import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PermissionsService } from '../permissions/permissions.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceMember } from './schemas/workspace-member.schema';
import { Workspace } from './schemas/workspace.schema';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaces: Model<Workspace>,
    @InjectModel(WorkspaceMember.name)
    private readonly members: Model<WorkspaceMember>,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
  ) {}

  async create(userId: string, input: CreateWorkspaceDto) {
    try {
      const workspace = await this.workspaces.create({
        name: input.name.trim(),
        slug: input.slug.toLowerCase(),
        ownerId: userId,
      });
      try {
        await this.members.create({
          workspaceId: workspace.id,
          userId,
          role: 'OWNER',
        });
      } catch (error) {
        await this.workspaces.deleteOne({ _id: workspace.id });
        throw error;
      }
      return workspace;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException('Workspace slug is already in use');
      throw error;
    }
  }

  listForUser(userId: string) {
    return this.members
      .aggregate([
        {
          $match: {
            userId:
              this.members.db.base.Types.ObjectId.createFromHexString(userId),
          },
        },
        {
          $lookup: {
            from: 'workspaces',
            localField: 'workspaceId',
            foreignField: '_id',
            as: 'workspace',
          },
        },
        { $unwind: '$workspace' },
        { $replaceWith: { $mergeObjects: ['$workspace', { role: '$role' }] } },
        {
          $project: {
            ownerId: 1,
            name: 1,
            slug: 1,
            logoUrl: 1,
            role: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ])
      .exec();
  }

  async listMembers(userId: string, workspaceId: string) {
    const requester = await this.members
      .findOne({ workspaceId, userId })
      .exec();
    if (!requester) throw new ForbiddenException('Workspace access denied');
    const objectId = this.members.db.base.Types.ObjectId;
    const members = await this.members
      .aggregate<{
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
        displayName: string;
        email: string;
        avatarUrl?: string;
        customStatus?: string;
        role: 'OWNER' | 'ADMIN' | 'MEMBER';
        joinedAt: Date;
      }>([
        {
          $match: {
            workspaceId: objectId.createFromHexString(workspaceId),
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        { $sort: { 'user.displayName': 1 } },
        {
          $project: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            displayName: '$user.displayName',
            email: '$user.email',
            avatarUrl: '$user.avatarUrl',
            customStatus: '$user.customStatus',
            role: 1,
            joinedAt: 1,
          },
        },
      ])
      .exec();
    await this.redis.ensureConnected();
    return Promise.all(
      members.map(async (member) => ({
        ...member,
        online: await this.redis.isUserOnline(member._id.toString()),
      })),
    );
  }

  async addMember(
    userId: string,
    workspaceId: string,
    email: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    await this.permissions.require(
      userId,
      workspaceId,
      'workspace.invite_member',
    );
    const target = await this.users.findByEmail(email.trim().toLowerCase());
    if (!target)
      throw new NotFoundException(
        'No Luvio account exists for this email address',
      );
    const joinedAt = new Date();
    const result = await this.members.updateOne(
      { workspaceId, userId: target.id },
      { $setOnInsert: { workspaceId, userId: target.id, role, joinedAt } },
      { upsert: true },
    );
    await this.redis.ensureConnected();
    const online = await this.redis.isUserOnline(target.id);
    return {
      _id: target.id,
      firstName: target.firstName,
      lastName: target.lastName,
      displayName: target.displayName,
      email: target.email,
      avatarUrl: target.avatarUrl,
      customStatus: target.customStatus,
      role,
      joinedAt,
      online,
      added: result.upsertedCount > 0,
    };
  }
}
