import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthenticatedUser } from '../common/authenticated-user';
import { MessagesService } from '../messages/messages.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { HuddlesService } from '../huddles/huddles.service';
import { HuddlesRealtimeService } from '../huddles/huddles-realtime.service';
import { ProjectsService } from '../projects/projects.service';
import { ProjectsRealtimeService } from '../projects/projects-realtime.service';
import {
  HuddleParticipantStateDto,
  HuddleReactionDto,
  HuddleRoomDto,
} from '../huddles/dto/huddles.dto';
import {
  JoinConversationDto,
  JoinProjectDto,
  RealtimeMessageDto,
  TypingIndicatorDto,
  WorkspacePresenceDto,
  RealtimeDeleteMessageDto,
  RealtimeEditMessageDto,
  RealtimeReactionDto,
} from './dto/realtime-message.dto';

@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket'],
  maxHttpBufferSize: 1_000_000,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private readonly server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly workspaces: WorkspacesService,
    private readonly huddles: HuddlesService,
    private readonly huddleRealtime: HuddlesRealtimeService,
    private readonly projects: ProjectsService,
    private readonly projectsRealtime: ProjectsRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.huddleRealtime.bind(server);
    this.projectsRealtime.bind(server);
  }

  async handleConnection(socket: Socket) {
    try {
      const token = this.readToken(socket);
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(
        token,
      );
      this.setPrincipal(socket, {
        userId: payload.sub,
        sessionId: payload.sid,
      });
      this.setWatchedWorkspaceIds(socket, new Set());
      await socket.join(`user:${payload.sub}`);
      await this.redis.markUserOnline(payload.sub, socket.id);
    } catch {
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = this.getPrincipal(socket)?.userId;
    if (!userId) return;
    try {
      await this.redis.removeUserSocket(userId, socket.id);
      const online = await this.redis.isUserOnline(userId);
      if (!online) {
        for (const workspaceId of this.getWatchedWorkspaceIds(socket)) {
          this.server.to(`workspace:${workspaceId}`).emit('presence.updated', {
            data: { workspaceId, userId, online: false },
            meta: {},
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        },
        'Failed to update presence on disconnect',
      );
    }
  }

  @SubscribeMessage('workspace.watch')
  async watchWorkspace(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: WorkspacePresenceDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const members = (await this.workspaces.listMembers(
      principal.userId,
      body.workspaceId,
    )) as unknown as Array<{ _id: { toString(): string } }>;
    await socket.join(`workspace:${body.workspaceId}`);
    this.getWatchedWorkspaceIds(socket).add(body.workspaceId);
    await this.refreshPresence(principal.userId, socket.id);
    const onlineUserIds = (
      await Promise.all(
        members.map(async (member) => ({
          userId: member._id.toString(),
          online: await this.redis.isUserOnline(member._id.toString()),
        })),
      )
    )
      .filter((member) => member.online)
      .map((member) => member.userId);
    this.server.to(`workspace:${body.workspaceId}`).emit('presence.updated', {
      data: {
        workspaceId: body.workspaceId,
        userId: principal.userId,
        online: true,
      },
      meta: {},
    });
    return { data: { onlineUserIds }, meta: {} };
  }

  @SubscribeMessage('presence.heartbeat')
  async heartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: WorkspacePresenceDto,
  ) {
    const principal = this.requirePrincipal(socket);
    if (!this.getWatchedWorkspaceIds(socket).has(body.workspaceId)) {
      throw new WsException('WORKSPACE_NOT_WATCHED');
    }
    await this.refreshPresence(principal.userId, socket.id);
    return { data: { online: true }, meta: {} };
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: JoinConversationDto,
  ) {
    const principal = this.requirePrincipal(socket);
    await this.messages.assertAccess(
      principal.userId,
      body.workspaceId,
      body.conversationId,
    );
    await socket.join(`conversation:${body.conversationId}`);
    return { data: { joined: true }, meta: {} };
  }

  @SubscribeMessage('conversation.leave')
  async leaveConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: JoinConversationDto,
  ) {
    await socket.leave(`conversation:${body.conversationId}`);
    return { data: { left: true }, meta: {} };
  }

  @SubscribeMessage('project.join')
  async joinProject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: JoinProjectDto,
  ) {
    const principal = this.requirePrincipal(socket);
    await this.projects.requireProjectAccess(
      principal.userId,
      body.projectId,
      'project.view',
    );
    await socket.join(`project:${body.projectId}`);
    return { data: { joined: true }, meta: {} };
  }

  @SubscribeMessage('project.leave')
  async leaveProject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: JoinProjectDto,
  ) {
    await socket.leave(`project:${body.projectId}`);
    return { data: { left: true }, meta: {} };
  }

  @SubscribeMessage('message.send')
  async sendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RealtimeMessageDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const message = await this.messages.create(
      principal.userId,
      body.workspaceId,
      body.conversationId,
      body,
    );
    await this.broadcastMessageEvent(
      body.workspaceId,
      body.conversationId,
      'message.created',
      message,
    );
    return { data: message, meta: {} };
  }

  @SubscribeMessage('message.edit')
  async editMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RealtimeEditMessageDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const message = await this.messages.update(
      principal.userId,
      body.workspaceId,
      body.conversationId,
      body.messageId,
      body,
    );
    await this.broadcastMessageEvent(
      body.workspaceId,
      body.conversationId,
      'message.updated',
      message,
    );
    return { data: message, meta: {} };
  }

  @SubscribeMessage('message.delete')
  async deleteMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RealtimeDeleteMessageDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const message = await this.messages.softDelete(
      principal.userId,
      body.workspaceId,
      body.conversationId,
      body.messageId,
    );
    await this.broadcastMessageEvent(
      body.workspaceId,
      body.conversationId,
      'message.deleted',
      message,
    );
    return { data: message, meta: {} };
  }

  @SubscribeMessage('reaction.toggle')
  async toggleReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RealtimeReactionDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const message = await this.messages.toggleReaction(
      principal.userId,
      body.workspaceId,
      body.conversationId,
      body.messageId,
      body.emoji,
    );
    await this.broadcastMessageEvent(
      body.workspaceId,
      body.conversationId,
      'message.updated',
      message,
    );
    return { data: message, meta: {} };
  }

  private async broadcastMessageEvent(
    workspaceId: string,
    conversationId: string,
    event: string,
    message: unknown,
  ) {
    const directMessageParticipantIds =
      await this.messages.getDirectMessageParticipantIds(
        workspaceId,
        conversationId,
      );
    const rooms = [
      `conversation:${conversationId}`,
      ...directMessageParticipantIds.map((userId) => `user:${userId}`),
    ];
    this.server.to(rooms).emit(event, {
      data: message,
      meta: {
        conversationType:
          directMessageParticipantIds.length > 0 ? 'DM' : 'CHANNEL',
      },
    });
  }

  @SubscribeMessage('typing.update')
  async updateTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: TypingIndicatorDto,
  ) {
    const principal = this.requirePrincipal(socket);
    await this.messages.assertAccess(
      principal.userId,
      body.workspaceId,
      body.conversationId,
    );
    const [user] = await this.users.findPublicByIds([principal.userId]);
    socket.to(`conversation:${body.conversationId}`).emit('typing.updated', {
      data: {
        conversationId: body.conversationId,
        userId: principal.userId,
        displayName: user?.displayName ?? 'A workspace member',
        active: body.active,
      },
      meta: {},
    });
    return { data: { delivered: true }, meta: {} };
  }

  @SubscribeMessage('huddle.room.join')
  async joinHuddleRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleRoomDto,
  ) {
    const principal = this.requirePrincipal(socket);
    await this.huddles.assertActiveParticipant(principal.userId, body.huddleId);
    await this.huddles.heartbeatParticipant(principal.userId, body.huddleId);
    await socket.join(`huddle:${body.huddleId}`);
    return { data: { joined: true }, meta: {} };
  }

  @SubscribeMessage('huddle.room.leave')
  async leaveHuddleRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleRoomDto,
  ) {
    await socket.leave(`huddle:${body.huddleId}`);
    return { data: { left: true }, meta: {} };
  }

  @SubscribeMessage('huddle.heartbeat')
  async huddleHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleRoomDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const state = await this.huddles.heartbeatParticipant(
      principal.userId,
      body.huddleId,
    );
    return { data: state, meta: {} };
  }

  @SubscribeMessage('huddle.participant_state')
  async updateHuddleParticipant(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleParticipantStateDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const participant = await this.huddles.updateParticipant(
      principal.userId,
      body,
    );
    return { data: participant, meta: {} };
  }

  @SubscribeMessage('huddle.raise_hand')
  async raiseHuddleHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleRoomDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const participant = await this.huddles.updateParticipant(principal.userId, {
      ...body,
      handRaised: true,
    });
    this.server.to(`huddle:${body.huddleId}`).emit('huddle.hand_raised', {
      data: { huddleId: body.huddleId, ...participant },
      meta: {},
    });
    return { data: participant, meta: {} };
  }

  @SubscribeMessage('huddle.lower_hand')
  async lowerHuddleHand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleRoomDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const participant = await this.huddles.updateParticipant(principal.userId, {
      ...body,
      handRaised: false,
    });
    this.server.to(`huddle:${body.huddleId}`).emit('huddle.hand_lowered', {
      data: { huddleId: body.huddleId, ...participant },
      meta: {},
    });
    return { data: participant, meta: {} };
  }

  @SubscribeMessage('huddle.reaction')
  async huddleReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: HuddleReactionDto,
  ) {
    const principal = this.requirePrincipal(socket);
    const event = await this.huddles.reaction(
      principal.userId,
      body.huddleId,
      body.emoji,
    );
    return { data: event, meta: {} };
  }

  private requirePrincipal(socket: Socket): AuthenticatedUser {
    const principal = this.getPrincipal(socket);
    if (!principal) throw new WsException('UNAUTHENTICATED');
    return principal;
  }

  private getPrincipal(socket: Socket): AuthenticatedUser | undefined {
    const data = socket.data as unknown as Record<string, unknown>;
    const value = data.principal;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('userId' in value) ||
      !('sessionId' in value) ||
      typeof value.userId !== 'string' ||
      typeof value.sessionId !== 'string'
    ) {
      return undefined;
    }
    return { userId: value.userId, sessionId: value.sessionId };
  }

  private setPrincipal(socket: Socket, principal: AuthenticatedUser): void {
    const data = socket.data as unknown as Record<string, unknown>;
    data.principal = principal;
  }

  private getWatchedWorkspaceIds(socket: Socket): Set<string> {
    const data = socket.data as unknown as Record<string, unknown>;
    if (!(data.watchedWorkspaceIds instanceof Set)) {
      data.watchedWorkspaceIds = new Set<string>();
    }
    return data.watchedWorkspaceIds as Set<string>;
  }

  private setWatchedWorkspaceIds(socket: Socket, value: Set<string>): void {
    const data = socket.data as unknown as Record<string, unknown>;
    data.watchedWorkspaceIds = value;
  }

  private async refreshPresence(userId: string, socketId: string) {
    await this.redis.markUserOnline(userId, socketId);
  }

  private readToken(socket: Socket): string {
    const authToken = socket.handshake.auth?.token as unknown;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;
    const authorization = socket.handshake.headers.authorization;
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
    throw new WsException('UNAUTHENTICATED');
  }
}
