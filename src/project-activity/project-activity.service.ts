import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectActivity } from './project-activity.schema';

@Injectable()
export class ProjectActivityService {
  constructor(
    @InjectModel(ProjectActivity.name)
    private readonly activities: Model<ProjectActivity>,
  ) {}

  async record(input: {
    workspaceId: string;
    projectId: string;
    actorId?: string;
    type: string;
    entityType: ProjectActivity['entityType'];
    entityId: string;
    metadata?: Record<string, unknown>;
  }) {
    const created = await this.activities.create({
      workspaceId: new Types.ObjectId(input.workspaceId),
      projectId: new Types.ObjectId(input.projectId),
      actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
      type: input.type,
      entityType: input.entityType,
      entityId: new Types.ObjectId(input.entityId),
      metadata: input.metadata ?? {},
    });
    return created.toObject();
  }

  async list(projectId: string, before?: string, limit = 40) {
    const query: Record<string, unknown> = { projectId };
    if (before) query.createdAt = { $lt: new Date(before) };
    return this.activities
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean()
      .exec();
  }
}
