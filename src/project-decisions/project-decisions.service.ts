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
import { ProjectActivityService } from '../project-activity/project-activity.service';
import { ProjectsRealtimeService } from '../projects/projects-realtime.service';
import { ProjectsService } from '../projects/projects.service';
import { ProjectDecision } from './schemas/project-decision.schema';

@Injectable()
export class ProjectDecisionsService {
  constructor(
    @InjectModel(ProjectDecision.name)
    private readonly decisions: Model<ProjectDecision>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    private readonly activity: ProjectActivityService,
    private readonly conversations: ConversationsService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
    @Inject(forwardRef(() => ProjectsRealtimeService))
    private readonly realtime: ProjectsRealtimeService,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: {
      title: string;
      description?: string;
      sourceMessageId?: string;
      sourceConversationId?: string;
      sourceMeetingId?: string;
    },
  ) {
    const decision = await this.decisions.create({
      workspaceId: new Types.ObjectId(workspaceId),
      projectId: new Types.ObjectId(projectId),
      title: input.title.trim().slice(0, 500),
      description: input.description?.trim().slice(0, 5000),
      sourceMessageId: input.sourceMessageId
        ? new Types.ObjectId(input.sourceMessageId)
        : undefined,
      sourceConversationId: input.sourceConversationId
        ? new Types.ObjectId(input.sourceConversationId)
        : undefined,
      sourceMeetingId: input.sourceMeetingId
        ? new Types.ObjectId(input.sourceMeetingId)
        : undefined,
      createdBy: new Types.ObjectId(userId),
      decidedAt: new Date(),
    });
    await this.activity.record({
      workspaceId,
      projectId,
      actorId: userId,
      type: 'decision.created',
      entityType: 'DECISION',
      entityId: decision.id,
      metadata: { title: decision.title },
    });
    const payload = this.toDto(decision.toObject());
    this.realtime.toProject(projectId, 'decision.created', payload);
    return payload;
  }

  async createFromMessage(
    userId: string,
    messageId: string,
    input: { title?: string; description?: string; projectId?: string },
  ) {
    const message = await this.messages.findById(messageId).exec();
    if (!message || message.deletedAt)
      throw new NotFoundException('Message not found');
    const workspaceId = message.workspaceId.toString();
    const conversation = await this.conversations.findById(
      workspaceId,
      message.conversationId.toString(),
    );
    if (!conversation) throw new NotFoundException('Conversation not found');

    const projectId = input.projectId ?? conversation.projectId?.toString();
    if (!projectId) {
      throw new BadRequestException(
        'projectId is required when marking a decision outside a project conversation',
      );
    }

    const project = await this.projects.requireProjectAccess(
      userId,
      projectId,
      'decision.create',
    );
    if (project.workspaceId.toString() !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    const title =
      input.title?.trim() ||
      message.plainText?.trim() ||
      message.text?.trim() ||
      'Decision';

    return this.create(userId, workspaceId, projectId, {
      title: title.slice(0, 500),
      description: input.description,
      sourceMessageId: messageId,
      sourceConversationId: message.conversationId.toString(),
    });
  }

  async list(projectId: string) {
    const items = await this.decisions
      .find({ projectId, deletedAt: null })
      .sort({ decidedAt: -1 })
      .lean()
      .exec();
    return items.map((item) => this.toDto(item));
  }

  async softDelete(userId: string, decisionId: string) {
    const decision = await this.decisions.findById(decisionId).exec();
    if (!decision || decision.deletedAt)
      throw new NotFoundException('Decision not found');
    await this.projects.requireProjectAccess(
      userId,
      decision.projectId.toString(),
      'decision.create',
    );
    decision.deletedAt = new Date();
    await decision.save();
    await this.activity.record({
      workspaceId: decision.workspaceId.toString(),
      projectId: decision.projectId.toString(),
      actorId: userId,
      type: 'decision.deleted',
      entityType: 'DECISION',
      entityId: decision.id,
      metadata: { title: decision.title },
    });
    const payload = {
      decisionId: decision.id,
      deletedAt: decision.deletedAt,
    };
    this.realtime.toProject(
      decision.projectId.toString(),
      'decision.deleted',
      payload,
    );
    return payload;
  }

  private toDto(decision: {
    _id: Types.ObjectId;
    workspaceId: Types.ObjectId;
    projectId: Types.ObjectId;
    title: string;
    description?: string;
    sourceMessageId?: Types.ObjectId;
    sourceConversationId?: Types.ObjectId;
    sourceMeetingId?: Types.ObjectId;
    createdBy: Types.ObjectId;
    decidedAt: Date;
    createdAt: Date;
    updatedAt?: Date;
    deletedAt?: Date;
  }) {
    return {
      id: decision._id.toString(),
      workspaceId: decision.workspaceId.toString(),
      projectId: decision.projectId.toString(),
      title: decision.title,
      description: decision.description,
      sourceMessageId: decision.sourceMessageId?.toString(),
      sourceConversationId: decision.sourceConversationId?.toString(),
      sourceMeetingId: decision.sourceMeetingId?.toString(),
      createdBy: decision.createdBy.toString(),
      decidedAt: decision.decidedAt,
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
      deletedAt: decision.deletedAt,
    };
  }
}
