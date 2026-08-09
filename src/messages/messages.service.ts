import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { ChannelMember } from '../channels/schemas/channel-member.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { Conversation } from '../conversations/schemas/conversation.schema';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { Message } from './schemas/message.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    @InjectModel(ChannelMember.name)
    private readonly channelMembers: Model<ChannelMember>,
    private readonly conversations: ConversationsService,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
  ) {}

  async assertAccess(
    userId: string,
    workspaceId: string,
    conversationId: string,
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    const conversation = await this.conversations.findById(
      workspaceId,
      conversationId,
    );
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type === 'CHANNEL') {
      if (!conversation.channelId)
        throw new NotFoundException('Channel conversation is invalid');
      const channelMember = await this.channelMembers.exists({
        workspaceId,
        channelId: conversation.channelId,
        userId,
      });
      if (!channelMember)
        throw new ForbiddenException('Channel membership required');
    }
    if (
      conversation.type !== 'CHANNEL' &&
      conversation.memberIds.length > 0 &&
      !conversation.memberIds.some((id) => id.toString() === userId)
    ) {
      throw new ForbiddenException('Conversation access denied');
    }
    return conversation;
  }

  async create(
    userId: string,
    workspaceId: string,
    conversationId: string,
    input: CreateMessageDto,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    if (input.clientId) {
      const existing = await this.messages
        .findOne({ workspaceId, senderId: userId, clientId: input.clientId })
        .exec();
      if (existing) return this.withSender(existing);
    }
    const message = await this.messages.create({
      workspaceId,
      conversationId,
      senderId: userId,
      type: 'TEXT',
      text: input.text.trim(),
      clientId: input.clientId,
      replyToMessageId: input.replyToMessageId,
    });
    await this.conversationModel.updateOne(
      { _id: conversationId, workspaceId },
      { lastMessageId: message.id, lastActivityAt: message.createdAt },
    );
    return this.withSender(message);
  }

  async list(
    userId: string,
    workspaceId: string,
    conversationId: string,
    before?: string,
    limit = 50,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const query: Record<string, unknown> = {
      workspaceId,
      conversationId,
      deletedAt: null,
    };
    if (before) query._id = { $lt: before };
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const items = await this.messages
      .find(query)
      .sort({ _id: -1 })
      .limit(safeLimit + 1)
      .lean()
      .exec();
    const hasMore = items.length > safeLimit;
    if (hasMore) items.pop();
    const senders = await this.users.findPublicByIds([
      ...new Set(items.map((item) => item.senderId.toString())),
    ]);
    const senderById = new Map(
      senders.map((sender) => [sender._id.toString(), sender]),
    );
    return {
      items: items.map((item) => ({
        ...item,
        sender: senderById.get(item.senderId.toString()) ?? null,
      })),
      nextCursor: hasMore ? items.at(-1)?._id.toString() : null,
    };
  }

  async getDirectMessageParticipantIds(
    workspaceId: string,
    conversationId: string,
  ): Promise<string[]> {
    const conversation = await this.conversations.findById(
      workspaceId,
      conversationId,
    );
    return conversation?.type === 'DM'
      ? conversation.memberIds.map((memberId) => memberId.toString())
      : [];
  }

  private async withSender(message: HydratedDocument<Message>) {
    const [sender] = await this.users.findPublicByIds([
      message.senderId.toString(),
    ]);
    return {
      ...message.toObject(),
      sender: sender ?? null,
    };
  }
}
