import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { ChannelMember } from '../channels/schemas/channel-member.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { Conversation } from '../conversations/schemas/conversation.schema';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import {
  extractMentionIdsFromContentJson,
  extractPlainTextFromContentJson,
  isAllowedContentJson,
} from './content.util';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
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
    } else if (
      conversation.type === 'PROJECT' ||
      conversation.type === 'TASK'
    ) {
      if (
        conversation.memberIds.length > 0 &&
        !conversation.memberIds.some((id) => id.toString() === userId)
      ) {
        throw new ForbiddenException('Project conversation access denied');
      }
    } else if (
      conversation.memberIds.length > 0 &&
      !conversation.memberIds.some((id) => id.toString() === userId)
    ) {
      throw new ForbiddenException('Conversation access denied');
    }
    return conversation;
  }

  private resolveBody(input: CreateMessageDto | UpdateMessageDto) {
    if (input.contentJson) {
      if (!isAllowedContentJson(input.contentJson)) {
        throw new BadRequestException('Unsupported message content schema');
      }
      const plainText =
        input.plainText?.trim() ||
        extractPlainTextFromContentJson(input.contentJson);
      if (!plainText) throw new BadRequestException('Message cannot be empty');
      const mentionUserIds = [
        ...new Set([
          ...(input.mentionUserIds ?? []),
          ...extractMentionIdsFromContentJson(input.contentJson),
        ]),
      ];
      return {
        contentJson: input.contentJson,
        plainText,
        text: plainText,
        mentions: mentionUserIds.filter((id) => Types.ObjectId.isValid(id)),
      };
    }
    const text = (input.text ?? input.plainText ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    return {
      contentJson: undefined,
      plainText: text,
      text,
      mentions: (input.mentionUserIds ?? []).filter((id) =>
        Types.ObjectId.isValid(id),
      ),
    };
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
    const body = this.resolveBody(input);
    const message = await this.messages.create({
      workspaceId,
      conversationId,
      senderId: userId,
      type: 'TEXT',
      text: body.text,
      plainText: body.plainText,
      contentJson: body.contentJson,
      clientId: input.clientId,
      replyToMessageId: input.replyToMessageId,
      threadRootId: input.threadRootId,
      mentions: body.mentions,
      attachmentIds: (input.attachmentIds ?? []).filter((id) =>
        Types.ObjectId.isValid(id),
      ),
      reactions: [],
    });
    await this.conversationModel.updateOne(
      { _id: conversationId, workspaceId },
      { lastMessageId: message.id, lastActivityAt: message.createdAt },
    );
    return this.withSender(message);
  }

  async update(
    userId: string,
    workspaceId: string,
    conversationId: string,
    messageId: string,
    input: UpdateMessageDto,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const message = await this.messages
      .findOne({ _id: messageId, workspaceId, conversationId })
      .exec();
    if (!message || message.deletedAt)
      throw new NotFoundException('Message not found');
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    const body = this.resolveBody(input);
    message.text = body.text;
    message.plainText = body.plainText;
    message.contentJson = body.contentJson;
    message.mentions = body.mentions as unknown as Types.ObjectId[];
    message.editedAt = new Date();
    await message.save();
    return this.withSender(message);
  }

  async softDelete(
    userId: string,
    workspaceId: string,
    conversationId: string,
    messageId: string,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const message = await this.messages
      .findOne({ _id: messageId, workspaceId, conversationId })
      .exec();
    if (!message || message.deletedAt)
      throw new NotFoundException('Message not found');
    if (message.senderId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }
    message.deletedAt = new Date();
    message.deletedBy = new Types.ObjectId(userId);
    message.text = '';
    message.plainText = '';
    message.contentJson = undefined;
    await message.save();
    return this.withSender(message);
  }

  async toggleReaction(
    userId: string,
    workspaceId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const safeEmoji = emoji.trim().slice(0, 32);
    if (!safeEmoji) throw new BadRequestException('Emoji is required');
    const message = await this.messages
      .findOne({ _id: messageId, workspaceId, conversationId, deletedAt: null })
      .exec();
    if (!message) throw new NotFoundException('Message not found');
    const reactions = [...(message.reactions ?? [])];
    const index = reactions.findIndex((item) => item.emoji === safeEmoji);
    if (index === -1) {
      reactions.push({ emoji: safeEmoji, userIds: [userId] });
    } else {
      const userIds = new Set(reactions[index].userIds);
      if (userIds.has(userId)) userIds.delete(userId);
      else userIds.add(userId);
      if (userIds.size === 0) reactions.splice(index, 1);
      else reactions[index] = { emoji: safeEmoji, userIds: [...userIds] };
    }
    message.reactions = reactions;
    await message.save();
    return this.withSender(message);
  }

  async setPinned(
    userId: string,
    workspaceId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const message = await this.messages
      .findOne({ _id: messageId, workspaceId, conversationId, deletedAt: null })
      .exec();
    if (!message) throw new NotFoundException('Message not found');
    message.pinned = pinned;
    await message.save();
    return this.withSender(message);
  }

  async list(
    userId: string,
    workspaceId: string,
    conversationId: string,
    before?: string,
    limit = 50,
    threadRootId?: string,
  ) {
    await this.assertAccess(userId, workspaceId, conversationId);
    const query: Record<string, unknown> = {
      workspaceId,
      conversationId,
      deletedAt: null,
    };
    if (threadRootId) {
      query.$or = [{ _id: threadRootId }, { threadRootId }];
    } else {
      query.$and = [
        {
          $or: [
            { threadRootId: null },
            { threadRootId: { $exists: false } },
          ],
        },
      ];
    }
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
