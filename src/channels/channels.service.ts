import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationsService } from '../conversations/conversations.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ChannelMember } from './schemas/channel-member.schema';
import { Channel } from './schemas/channel.schema';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private readonly channels: Model<Channel>,
    @InjectModel(ChannelMember.name)
    private readonly members: Model<ChannelMember>,
    private readonly permissions: PermissionsService,
    private readonly conversations: ConversationsService,
  ) {}

  async create(userId: string, workspaceId: string, input: CreateChannelDto) {
    await this.permissions.require(userId, workspaceId, 'channel.create');
    const slug = input.slug.trim().toLowerCase();
    await this.releaseArchivedSlug(workspaceId, slug);
    const channel = await this.channels
      .create({
        ...input,
        name: input.name.trim(),
        slug,
        workspaceId,
        createdBy: userId,
      })
      .catch((error: unknown) => {
        if ((error as { code?: number }).code === 11000)
          throw new ConflictException(
            'That channel URL is already used by an active channel in this workspace. Choose another channel URL.',
          );
        throw error;
      });
    try {
      await this.members.create({ workspaceId, channelId: channel.id, userId });
      const conversation = await this.conversations.createChannelConversation(
        workspaceId,
        channel.id,
        userId,
        input.type === 'PRIVATE' ? [userId] : [],
      );
      return { channel, conversationId: conversation.id };
    } catch (error: unknown) {
      await Promise.allSettled([
        this.members.deleteMany({ workspaceId, channelId: channel.id }).exec(),
        this.conversations.removeChannelConversation(workspaceId, channel.id),
        this.channels.deleteOne({ _id: channel.id, workspaceId }).exec(),
      ]);
      throw error;
    }
  }

  async list(userId: string, workspaceId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const memberChannelIds = await this.members
      .find({ workspaceId, userId })
      .distinct('channelId')
      .exec();
    const channels = await this.channels
      .find({
        workspaceId,
        archivedAt: null,
        _id: { $in: memberChannelIds },
      })
      .sort({ name: 1 })
      .lean()
      .exec();
    const conversations = await this.conversations.listForChannels(
      workspaceId,
      channels.map((channel) => channel._id.toString()),
    );
    const conversationByChannel = new Map(
      conversations.map((conversation) => [
        conversation.channelId!.toString(),
        conversation._id.toString(),
      ]),
    );
    return channels.map((channel) => ({
      ...channel,
      conversationId: conversationByChannel.get(channel._id.toString()),
    }));
  }

  async join(userId: string, workspaceId: string, channelId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const channel = await this.channels
      .findOne({ _id: channelId, workspaceId, archivedAt: null })
      .exec();
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.type !== 'PUBLIC')
      throw new ForbiddenException('Private channels require an invitation');
    await this.members.updateOne(
      { channelId, userId },
      {
        $setOnInsert: { workspaceId, channelId, userId, joinedAt: new Date() },
      },
      { upsert: true },
    );
    return channel;
  }

  async remove(userId: string, workspaceId: string, channelId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const channel = await this.channels
      .findOne({ _id: channelId, workspaceId, archivedAt: null })
      .exec();
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.createdBy.toString() !== userId)
      throw new ForbiddenException(
        'Only the channel creator can remove this channel',
      );

    const archivedAt = new Date();
    channel.archivedAt = archivedAt;
    channel.slug = this.archivedSlug(channel.slug, channel.id);
    await channel.save();
    return { channelId: channel.id, archivedAt };
  }

  private async releaseArchivedSlug(workspaceId: string, slug: string) {
    const archived = await this.channels
      .findOne({ workspaceId, slug, archivedAt: { $ne: null } })
      .select({ _id: 1, slug: 1 })
      .lean()
      .exec();
    if (!archived) return;
    await this.channels.updateOne(
      { _id: archived._id, workspaceId, slug },
      { $set: { slug: this.archivedSlug(slug, archived._id.toString()) } },
    );
  }

  private archivedSlug(slug: string, channelId: string) {
    return `${slug}-archived-${channelId}`;
  }

  async listMembers(userId: string, workspaceId: string, channelId: string) {
    await this.permissions.requireMembership(userId, workspaceId);
    const channel = await this.channels
      .findOne({ _id: channelId, workspaceId, archivedAt: null })
      .lean()
      .exec();
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.type === 'PRIVATE') {
      const hasAccess = await this.members.exists({ channelId, userId });
      if (!hasAccess && channel.createdBy.toString() !== userId)
        throw new ForbiddenException('Channel access denied');
    }

    const objectId = this.members.db.base.Types.ObjectId;
    return this.members
      .aggregate([
        {
          $match: {
            workspaceId: objectId.createFromHexString(workspaceId),
            channelId: objectId.createFromHexString(channelId),
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
            joinedAt: 1,
          },
        },
      ])
      .exec();
  }

  async addMembers(
    userId: string,
    workspaceId: string,
    channelId: string,
    userIds: string[],
  ) {
    await this.permissions.requireMembership(userId, workspaceId);
    const channel = await this.channels
      .findOne({ _id: channelId, workspaceId, archivedAt: null })
      .exec();
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.createdBy.toString() !== userId)
      await this.permissions.require(userId, workspaceId, 'channel.manage');

    await Promise.all(
      userIds.map((targetUserId) =>
        this.permissions.requireMembership(targetUserId, workspaceId),
      ),
    );
    const joinedAt = new Date();
    await Promise.all(
      userIds.map((targetUserId) =>
        this.members.updateOne(
          { channelId, userId: targetUserId },
          {
            $setOnInsert: {
              workspaceId,
              channelId,
              userId: targetUserId,
              joinedAt,
            },
          },
          { upsert: true },
        ),
      ),
    );
    if (channel.type === 'PRIVATE')
      await this.conversations.addChannelMembers(
        workspaceId,
        channelId,
        userIds,
      );
    return { userIds };
  }
}
