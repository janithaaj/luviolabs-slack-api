import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { Conversation } from '../conversations/schemas/conversation.schema';
import { MessagesService } from '../messages/messages.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { HuddleParticipantStateDto, StartHuddleDto } from './dto/huddles.dto';
import { HuddleMediaService } from './huddle-media.service';
import { HuddlesRealtimeService } from './huddles-realtime.service';
import { Huddle, HuddleDocument } from './schemas/huddle.schema';
import { HuddleParticipant } from './schemas/huddle-participant.schema';

@Injectable()
export class HuddlesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HuddlesService.name);
  private cleanupQueue?: Queue<{ huddleId?: string }>;
  private cleanupWorker?: Worker<{ huddleId?: string }>;
  private queueConnection?: Redis;
  private workerConnection?: Redis;

  constructor(
    @InjectModel(Huddle.name) private readonly huddles: Model<Huddle>,
    @InjectModel(HuddleParticipant.name)
    private readonly participants: Model<HuddleParticipant>,
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    private readonly messages: MessagesService,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly media: HuddleMediaService,
    private readonly realtime: HuddlesRealtimeService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.redis.ensureConnected();
    this.queueConnection = this.redis.client.duplicate({
      maxRetriesPerRequest: null,
    });
    this.workerConnection = this.redis.client.duplicate({
      maxRetriesPerRequest: null,
    });
    this.cleanupQueue = new Queue('huddle-cleanup', {
      connection: this.queueConnection,
    });
    this.cleanupWorker = new Worker(
      'huddle-cleanup',
      async (job) => {
        if (job.name === 'empty' && job.data.huddleId)
          await this.cleanupIfEmpty(job.data.huddleId);
        if (job.name === 'sweep') await this.sweepEmptyHuddles();
      },
      { connection: this.workerConnection },
    );
    await this.cleanupQueue.upsertJobScheduler(
      'periodic-sweep',
      { every: 60_000 },
      {
        name: 'sweep',
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 50 },
      },
    );
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.cleanupWorker?.close(),
      this.cleanupQueue?.close(),
      this.workerConnection?.quit(),
      this.queueConnection?.quit(),
    ]);
  }

  async start(userId: string, input: StartHuddleDto) {
    const conversation = await this.messages.assertAccess(
      userId,
      input.workspaceId,
      input.conversationId,
    );
    if (
      conversation.type === 'MEETING' ||
      conversation.type === 'PROJECT' ||
      conversation.type === 'TASK'
    )
      throw new ForbiddenException('Huddles are not available here');
    const conversationType: 'CHANNEL' | 'DM' | 'GROUP_DM' = conversation.type;
    await this.ensureUserAvailable(userId);
    await this.redis.ensureConnected();
    const activeKey = this.conversationActiveKey(input.conversationId);
    const lockValue = `creating:${userId}:${crypto.randomUUID()}`;
    const existing = await this.acquireConversationStartLock(
      input.conversationId,
      lockValue,
    );
    if (existing) return this.join(userId, existing.id);

    try {
      const huddle = await this.huddles.create({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        conversationType,
        startedBy: userId,
        status: 'ACTIVE',
        mediaMode: 'AUDIO_VIDEO',
        participantCount: 0,
        settings: {
          allowVideo: true,
          allowScreenShare: true,
          allowInvites: true,
        },
        startedAt: new Date(),
      });
      await this.redis.client.set(activeKey, huddle.id, 'EX', 86_400);
      const session = await this.joinInternal(userId, huddle, 'HOST');
      this.logger.log(
        `huddle.created workspaceId=${input.workspaceId} conversationId=${input.conversationId} huddleId=${huddle.id} userId=${userId}`,
      );
      this.realtime.toWorkspace(input.workspaceId, 'huddle.started', {
        huddle: session.huddle,
        participants: session.participants,
      });
      if (conversationType === 'DM' || conversationType === 'GROUP_DM') {
        const inviteeIds = conversation.memberIds
          .map((memberId) => memberId.toString())
          .filter((memberId) => memberId !== userId);
        const [inviter] = await this.users.findPublicByIds([userId]);
        this.realtime.toUsers(inviteeIds, 'huddle.invited', {
          huddleId: huddle.id,
          conversationId: input.conversationId,
          invitedBy: userId,
          invitedByName: inviter?.displayName ?? 'A teammate',
        });
      }
      return session;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) {
        const active = await this.activeDocument(input.conversationId);
        if (active) return this.join(userId, active.id);
      }
      throw error;
    } finally {
      await this.deleteRedisKeyIfValueMatches(activeKey, lockValue);
    }
  }

  private async acquireConversationStartLock(
    conversationId: string,
    lockValue: string,
  ): Promise<HuddleDocument | null> {
    const activeKey = this.conversationActiveKey(conversationId);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const locked = await this.redis.client.set(
        activeKey,
        lockValue,
        'EX',
        5,
        'NX',
      );
      if (locked) return null;

      const active = await this.activeDocument(conversationId);
      if (active) return active;

      const currentValue = await this.redis.client.get(activeKey);
      if (currentValue && !currentValue.startsWith('creating:')) {
        await this.deleteRedisKeyIfValueMatches(activeKey, currentValue);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new ConflictException(
      'The Huddle is taking longer than expected to start. Try again.',
    );
  }

  private async deleteRedisKeyIfValueMatches(key: string, value: string) {
    await this.redis.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      value,
    );
  }

  async active(userId: string, conversationId: string) {
    const conversation = await this.conversation(conversationId);
    await this.messages.assertAccess(
      userId,
      conversation.workspaceId.toString(),
      conversationId,
    );
    const huddle = await this.activeDocument(conversationId);
    if (!huddle) return { active: false, participants: [] };
    return {
      active: true,
      huddle: huddle.toObject(),
      participants: await this.listParticipantsInternal(huddle.id),
    };
  }

  async join(userId: string, huddleId: string) {
    const huddle = await this.activeHuddle(huddleId);
    await this.messages.assertAccess(
      userId,
      huddle.workspaceId.toString(),
      huddle.conversationId.toString(),
    );
    await this.ensureUserAvailable(userId, huddleId);
    return this.joinInternal(
      userId,
      huddle,
      huddle.startedBy.toString() === userId ? 'HOST' : 'PARTICIPANT',
    );
  }

  async leave(userId: string, huddleId: string) {
    const huddle = await this.activeHuddle(huddleId);
    await this.messages.assertAccess(
      userId,
      huddle.workspaceId.toString(),
      huddle.conversationId.toString(),
    );
    const now = new Date();
    const participant = await this.participants
      .findOne({ huddleId, userId, leftAt: { $exists: false } })
      .exec();
    if (!participant) return { left: true };
    participant.leftAt = now;
    participant.durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - participant.joinedAt.getTime()) / 1000),
    );
    await participant.save();
    await this.redis.ensureConnected();
    await this.redis.client
      .multi()
      .srem(this.participantSetKey(huddleId), userId)
      .del(
        this.userActiveKey(userId),
        this.participantStateKey(huddleId, userId),
      )
      .exec();
    const count = await this.refreshParticipantCount(huddleId);
    this.realtime.toHuddle(huddleId, 'huddle.participant_left', {
      huddleId,
      userId,
    });
    if (count === 0) await this.scheduleEmptyCleanup(huddleId);
    return { left: true };
  }

  async end(userId: string, huddleId: string) {
    const huddle = await this.activeHuddle(huddleId);
    const workspaceId = huddle.workspaceId.toString();
    const member = await this.permissions.requireMembership(
      userId,
      workspaceId,
    );
    if (
      huddle.startedBy.toString() !== userId &&
      !['OWNER', 'ADMIN'].includes(member.role)
    )
      throw new ForbiddenException(
        'Only a host or workspace administrator can end this Huddle',
      );
    return this.endInternal(huddle, userId);
  }

  async listParticipants(userId: string, huddleId: string) {
    const huddle = await this.activeHuddle(huddleId);
    await this.messages.assertAccess(
      userId,
      huddle.workspaceId.toString(),
      huddle.conversationId.toString(),
    );
    return this.listParticipantsInternal(huddleId);
  }

  async invite(userId: string, huddleId: string, userIds: string[]) {
    const huddle = await this.activeHuddle(huddleId);
    const active = await this.participants.exists({
      huddleId,
      userId,
      leftAt: { $exists: false },
    });
    if (!active)
      throw new ForbiddenException('Join the Huddle before inviting people');
    const unique = [...new Set(userIds)].filter((id) => id !== userId);
    await Promise.all(
      unique.map((id) =>
        this.messages.assertAccess(
          id,
          huddle.workspaceId.toString(),
          huddle.conversationId.toString(),
        ),
      ),
    );
    const [inviter] = await this.users.findPublicByIds([userId]);
    this.realtime.toUsers(unique, 'huddle.invited', {
      huddleId,
      conversationId: huddle.conversationId.toString(),
      invitedBy: userId,
      invitedByName: inviter?.displayName ?? 'A teammate',
    });
    return { invitedUserIds: unique };
  }

  async history(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 20,
  ) {
    const conversation = await this.conversation(conversationId);
    await this.messages.assertAccess(
      userId,
      conversation.workspaceId.toString(),
      conversationId,
    );
    const query: Record<string, unknown> = { conversationId, status: 'ENDED' };
    if (cursor) query._id = { $lt: cursor };
    const items = await this.huddles
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    const starters = await this.users.findPublicByIds([
      ...new Set(items.map((item) => item.startedBy.toString())),
    ]);
    const byId = new Map(starters.map((user) => [user._id.toString(), user]));
    return items.map((item) => ({
      ...item,
      startedByUser: byId.get(item.startedBy.toString()),
    }));
  }

  async assertActiveParticipant(userId: string, huddleId: string) {
    const huddle = await this.activeHuddle(huddleId);
    const participant = await this.participants
      .findOne({ huddleId, userId, leftAt: { $exists: false } })
      .lean()
      .exec();
    if (!participant) throw new ForbiddenException('Join the Huddle first');
    return huddle;
  }

  async updateParticipant(userId: string, input: HuddleParticipantStateDto) {
    await this.assertActiveParticipant(userId, input.huddleId);
    const patch = Object.fromEntries(
      ['muted', 'videoEnabled', 'screenSharing', 'handRaised']
        .filter(
          (key) => input[key as keyof HuddleParticipantStateDto] !== undefined,
        )
        .map((key) => [key, input[key as keyof HuddleParticipantStateDto]]),
    );
    const [current] = await this.listParticipantViews(input.huddleId, userId);
    if (!current) throw new NotFoundException('Huddle participant not found');
    const view = { ...current, ...patch };
    await this.cacheParticipant(input.huddleId, userId, view);
    this.realtime.toHuddle(input.huddleId, 'huddle.participant_updated', {
      huddleId: input.huddleId,
      ...view,
    });
    return view;
  }

  async reaction(userId: string, huddleId: string, emoji: string) {
    await this.assertActiveParticipant(userId, huddleId);
    await this.enforceReactionLimit(userId, huddleId);
    const [user] = await this.users.findPublicByIds([userId]);
    const event = {
      huddleId,
      userId,
      displayName: user?.displayName ?? 'Workspace member',
      emoji,
      eventId: crypto.randomUUID(),
    };
    this.realtime.toHuddle(huddleId, 'huddle.reaction', event);
    return event;
  }

  private async joinInternal(
    userId: string,
    huddle: HuddleDocument,
    role: 'HOST' | 'PARTICIPANT',
  ) {
    const existing = await this.participants
      .findOne({ huddleId: huddle.id, userId, leftAt: { $exists: false } })
      .exec();
    if (!existing)
      await this.participants.create({
        huddleId: huddle.id,
        userId,
        role,
        joinedAt: new Date(),
      });
    await this.cancelEmptyCleanup(huddle.id);
    await this.redis.ensureConnected();
    await this.redis.client
      .multi()
      .set(this.userActiveKey(userId), huddle.id, 'EX', 86_400)
      .sadd(this.participantSetKey(huddle.id), userId)
      .expire(this.participantSetKey(huddle.id), 86_400)
      .exec();
    await this.refreshParticipantCount(huddle.id);
    const participants = await this.listParticipantsInternal(huddle.id);
    const current = participants.find((item) => item.userId === userId)!;
    await this.cacheParticipant(huddle.id, userId, current);
    const refreshed = await this.huddles.findById(huddle.id).lean().exec();
    if (!refreshed) throw new NotFoundException('Huddle not found');
    const [user] = await this.users.findPublicByIds([userId]);
    const media = await this.media.credentials({
      huddleId: huddle.id,
      workspaceId: huddle.workspaceId.toString(),
      conversationId: huddle.conversationId.toString(),
      userId,
      displayName: user?.displayName ?? 'Workspace member',
      role,
    });
    if (!existing)
      this.realtime.toHuddle(huddle.id, 'huddle.participant_joined', {
        huddleId: huddle.id,
        ...current,
      });
    return { huddle: refreshed, media, participants };
  }

  private async activeHuddle(huddleId: string) {
    if (!Types.ObjectId.isValid(huddleId))
      throw new NotFoundException('Huddle not found');
    const huddle = await this.huddles
      .findOne({ _id: huddleId, status: 'ACTIVE' })
      .exec();
    if (!huddle) throw new NotFoundException('Active Huddle not found');
    return huddle;
  }

  private activeDocument(conversationId: string) {
    return this.huddles.findOne({ conversationId, status: 'ACTIVE' }).exec();
  }

  private async conversation(conversationId: string) {
    if (!Types.ObjectId.isValid(conversationId))
      throw new NotFoundException('Conversation not found');
    const conversation = await this.conversations
      .findById(conversationId)
      .lean()
      .exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async listParticipantsInternal(huddleId: string) {
    const rows = await this.participants
      .find({ huddleId, leftAt: { $exists: false } })
      .sort({ joinedAt: 1 })
      .lean()
      .exec();
    return this.presentParticipants(huddleId, rows);
  }

  private async listParticipantViews(huddleId: string, userId: string) {
    const rows = await this.participants
      .find({ huddleId, userId, leftAt: { $exists: false } })
      .lean()
      .exec();
    return this.presentParticipants(huddleId, rows);
  }

  private async presentParticipants(
    huddleId: string,
    rows: Array<{
      userId: Types.ObjectId;
      role: 'HOST' | 'PARTICIPANT';
      muted: boolean;
      videoEnabled: boolean;
      screenSharing: boolean;
      handRaised: boolean;
      joinedAt: Date;
    }>,
  ) {
    const users = await this.users.findPublicByIds(
      rows.map((row) => row.userId.toString()),
    );
    const byId = new Map(users.map((user) => [user._id.toString(), user]));
    await this.redis.ensureConnected();
    const cached = rows.length
      ? await this.redis.client.mget(
          ...rows.map((row) =>
            this.participantStateKey(huddleId, row.userId.toString()),
          ),
        )
      : [];
    return rows.map((row, index) => {
      const user = byId.get(row.userId.toString());
      const base = {
        userId: row.userId.toString(),
        displayName: user?.displayName ?? 'Workspace member',
        avatarUrl: user?.avatarUrl,
        role: row.role,
        muted: true,
        videoEnabled: false,
        screenSharing: false,
        handRaised: false,
        joinedAt: row.joinedAt,
      };
      if (!cached[index]) return base;
      try {
        const state = JSON.parse(cached[index]) as Partial<typeof base>;
        return { ...base, ...state, userId: base.userId, role: base.role };
      } catch {
        return base;
      }
    });
  }

  private async refreshParticipantCount(huddleId: string) {
    const count = await this.participants
      .countDocuments({ huddleId, leftAt: { $exists: false } })
      .exec();
    await this.huddles
      .updateOne(
        { _id: huddleId, status: 'ACTIVE' },
        { $set: { participantCount: count } },
      )
      .exec();
    return count;
  }

  private async ensureUserAvailable(userId: string, expectedHuddleId?: string) {
    await this.redis.ensureConnected();
    const current = await this.redis.client.get(this.userActiveKey(userId));
    if (current && current !== expectedHuddleId) {
      const active = await this.huddles.exists({
        _id: current,
        status: 'ACTIVE',
      });
      if (active)
        throw new ConflictException(
          'Leave your current Huddle before joining another one',
        );
      await this.redis.client.del(this.userActiveKey(userId));
    }
  }

  private async cacheParticipant(
    huddleId: string,
    userId: string,
    value: unknown,
  ) {
    const ttl = this.config.get<number>('HUDDLE_PARTICIPANT_TTL_SECONDS', 120);
    await this.redis.client.set(
      this.participantStateKey(huddleId, userId),
      JSON.stringify(value),
      'EX',
      ttl,
    );
  }

  async heartbeatParticipant(userId: string, huddleId: string) {
    await this.assertActiveParticipant(userId, huddleId);
    const [view] = await this.listParticipantViews(huddleId, userId);
    if (!view) throw new NotFoundException('Huddle participant not found');
    await this.cacheParticipant(huddleId, userId, view);
    await this.redis.client
      .multi()
      .set(this.userActiveKey(userId), huddleId, 'EX', 86_400)
      .expire(this.participantSetKey(huddleId), 86_400)
      .exec();
    return { active: true };
  }

  private async enforceReactionLimit(userId: string, huddleId: string) {
    const key = `huddle:${huddleId}:reaction_rate:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 3);
    if (count > 5)
      throw new HttpException(
        'Reaction rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  private async scheduleEmptyCleanup(huddleId: string) {
    await this.cancelEmptyCleanup(huddleId);
    const seconds = this.config.get<number>('HUDDLE_EMPTY_GRACE_SECONDS', 30);
    await this.cleanupQueue?.add(
      'empty',
      { huddleId },
      {
        delay: seconds * 1000,
        jobId: `empty-${huddleId}`,
        removeOnComplete: true,
        removeOnFail: 20,
      },
    );
  }

  private async cancelEmptyCleanup(huddleId: string) {
    const job = await this.cleanupQueue?.getJob(`empty-${huddleId}`);
    if (job) await job.remove().catch(() => undefined);
  }

  private async cleanupIfEmpty(huddleId: string) {
    const count = await this.participants
      .countDocuments({ huddleId, leftAt: { $exists: false } })
      .exec();
    if (count !== 0) return;
    const huddle = await this.huddles
      .findOne({ _id: huddleId, status: 'ACTIVE' })
      .exec();
    if (huddle) await this.endInternal(huddle);
  }

  private async endInternal(huddle: HuddleDocument, endedBy?: string) {
    const endedAt = new Date();
    huddle.status = 'ENDED';
    huddle.endedAt = endedAt;
    huddle.durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - huddle.startedAt.getTime()) / 1000),
    );
    huddle.participantCount = 0;
    await huddle.save();
    this.logger.log(
      `huddle.ended workspaceId=${huddle.workspaceId.toString()} conversationId=${huddle.conversationId.toString()} huddleId=${huddle.id}`,
    );
    await this.participants
      .updateMany({ huddleId: huddle.id, leftAt: { $exists: false } }, [
        {
          $set: {
            leftAt: endedAt,
            durationSeconds: {
              $floor: {
                $divide: [{ $subtract: [endedAt, '$joinedAt'] }, 1000],
              },
            },
          },
        },
      ])
      .exec();
    await this.redis.ensureConnected();
    const userIds = await this.redis.client.smembers(
      this.participantSetKey(huddle.id),
    );
    await this.redis.client.del(
      this.conversationActiveKey(huddle.conversationId.toString()),
      this.participantSetKey(huddle.id),
      ...userIds.flatMap((id) => [
        this.userActiveKey(id),
        this.participantStateKey(huddle.id, id),
      ]),
    );
    await this.cancelEmptyCleanup(huddle.id);
    this.realtime.toRooms(
      [
        `workspace:${huddle.workspaceId.toString()}`,
        `huddle:${huddle.id}`,
        ...userIds.map((userId) => `user:${userId}`),
      ],
      'huddle.ended',
      {
        huddleId: huddle.id,
        conversationId: huddle.conversationId.toString(),
        endedBy,
      },
    );
    return huddle.toObject();
  }

  private conversationActiveKey(id: string) {
    return `conversation:${id}:active_huddle`;
  }
  private userActiveKey(id: string) {
    return `user:${id}:active_huddle`;
  }
  private participantSetKey(id: string) {
    return `huddle:${id}:participants`;
  }
  private participantStateKey(huddleId: string, userId: string) {
    return `huddle:${huddleId}:participant:${userId}`;
  }

  private async sweepEmptyHuddles() {
    const active = await this.huddles
      .find({ status: 'ACTIVE' })
      .select({ _id: 1 })
      .lean()
      .exec();
    await Promise.all(
      active.map(async (huddle) => {
        const count = await this.participants
          .countDocuments({ huddleId: huddle._id, leftAt: { $exists: false } })
          .exec();
        if (count === 0) await this.scheduleEmptyCleanup(huddle._id.toString());
      }),
    );
  }
}
