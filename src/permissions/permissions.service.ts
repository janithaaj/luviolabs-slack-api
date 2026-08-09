import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkspaceMember } from '../workspaces/schemas/workspace-member.schema';
import { Permission, rolePermissions } from './permissions';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(WorkspaceMember.name)
    private readonly members: Model<WorkspaceMember>,
  ) {}

  async requireMembership(userId: string, workspaceId: string) {
    const member = await this.members
      .findOne({ workspaceId, userId })
      .lean()
      .exec();
    if (!member) throw new ForbiddenException('Workspace access denied');
    return member;
  }

  async require(userId: string, workspaceId: string, permission: Permission) {
    const member = await this.requireMembership(userId, workspaceId);
    if (!rolePermissions[member.role].has(permission))
      throw new ForbiddenException(`Missing permission: ${permission}`);
    return member;
  }
}
