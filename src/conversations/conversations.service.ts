import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from '../messages/schemas/message.schema';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import { ConversationRead } from './schemas/conversation-read.schema';
import { Conversation } from './schemas/conversation.schema';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    @InjectModel(ConversationRead.name)
    private readonly conversationReads: Model<ConversationRead>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
  ) {}

  async listDirectMessages(userId: string, workspaceId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const conversations = await this.conversations
      .find({ workspaceId, type: 'DM', memberIds: userId })
      .sort({ lastActivityAt: -1, _id: -1 })
      .lean()
      .exec();
    const otherUserIds = conversations
      .map((conversation) =>
        conversation.memberIds.find(
          (memberId) => memberId.toString() !== userId,
        ),
      )
      .filter((memberId) => memberId !== undefined)
      .map((memberId) => memberId.toString());
    const members = await this.users.findPublicByIds([
      ...new Set(otherUserIds),
    ]);
    const memberById = new Map(
      members.map((member) => [member._id.toString(), member]),
    );
    const readStates = await this.conversationReads
      .find({
        workspaceId,
        userId,
        conversationId: { $in: conversations.map((item) => item._id) },
      })
      .lean()
      .exec();
    const readAtByConversation = new Map(
      readStates.map((state) => [
        state.conversationId.toString(),
        state.lastReadAt,
      ]),
    );
    const unreadCounts = await Promise.all(
      conversations.map((conversation) => {
        const lastReadAt = readAtByConversation.get(
          conversation._id.toString(),
        );
        return this.messages.countDocuments({
          workspaceId,
          conversationId: conversation._id,
          senderId: { $ne: userId },
          deletedAt: null,
          ...(lastReadAt ? { createdAt: { $gt: lastReadAt } } : {}),
        });
      }),
    );

    return conversations.flatMap((conversation, index) => {
      const otherUserId = conversation.memberIds.find(
        (memberId) => memberId.toString() !== userId,
      );
      const member = otherUserId
        ? memberById.get(otherUserId.toString())
        : undefined;
      return member
        ? [
            {
              conversationId: conversation._id.toString(),
              workspaceId: conversation.workspaceId.toString(),
              member,
              unreadCount: unreadCounts[index] ?? 0,
              lastActivityAt: conversation.lastActivityAt,
              createdAt: conversation.createdAt,
            },
          ]
        : [];
    });
  }

  async markDirectMessageRead(
    userId: string,
    workspaceId: string,
    conversationId: string,
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    const conversation = await this.conversations
      .findOne({
        _id: conversationId,
        workspaceId,
        type: 'DM',
        memberIds: userId,
      })
      .lean()
      .exec();
    if (!conversation) throw new NotFoundException('Direct message not found');
    const lastReadAt = new Date();
    await this.conversationReads.updateOne(
      { workspaceId, conversationId, userId },
      {
        $set: { lastReadAt },
        $setOnInsert: { workspaceId, conversationId, userId },
      },
      { upsert: true },
    );
    return { conversationId, lastReadAt };
  }

  async startDirectMessage(
    userId: string,
    workspaceId: string,
    targetUserId: string,
  ) {
    if (userId === targetUserId)
      throw new BadRequestException(
        'Choose another workspace member for a direct message',
      );
    await Promise.all([
      this.permissions.requireMembership(userId, workspaceId),
      this.permissions.requireMembership(targetUserId, workspaceId),
    ]);
    const [member] = await this.users.findPublicByIds([targetUserId]);
    if (!member) throw new NotFoundException('Workspace member not found');

    const memberIds = [userId, targetUserId].sort();
    const dmMemberKey = memberIds.join(':');
    const conversation = await this.conversations.findOneAndUpdate(
      { workspaceId, type: 'DM', dmMemberKey },
      {
        $setOnInsert: {
          workspaceId,
          type: 'DM',
          memberIds,
          dmMemberKey,
          createdBy: userId,
        },
      },
      { upsert: true, new: true },
    );

    return {
      conversationId: conversation.id,
      workspaceId,
      member,
      unreadCount: 0,
      lastActivityAt: conversation.lastActivityAt,
      createdAt: conversation.createdAt,
    };
  }

  createChannelConversation(
    workspaceId: string,
    channelId: string,
    createdBy: string,
    memberIds: string[],
  ) {
    return this.conversations.findOneAndUpdate(
      { workspaceId, channelId, type: 'CHANNEL' },
      {
        $setOnInsert: {
          workspaceId,
          channelId,
          createdBy,
          memberIds,
          type: 'CHANNEL',
        },
      },
      { upsert: true, new: true },
    );
  }

  removeChannelConversation(workspaceId: string, channelId: string) {
    return this.conversations
      .deleteOne({ workspaceId, channelId, type: 'CHANNEL' })
      .exec();
  }

  findById(workspaceId: string, conversationId: string) {
    return this.conversations
      .findOne({ _id: conversationId, workspaceId })
      .exec();
  }

  listForChannels(workspaceId: string, channelIds: string[]) {
    return this.conversations
      .find({ workspaceId, type: 'CHANNEL', channelId: { $in: channelIds } })
      .select({ _id: 1, channelId: 1 })
      .lean()
      .exec();
  }

  addChannelMembers(workspaceId: string, channelId: string, userIds: string[]) {
    return this.conversations
      .updateOne(
        { workspaceId, channelId, type: 'CHANNEL' },
        { $addToSet: { memberIds: { $each: userIds } } },
      )
      .exec();
  }
}
