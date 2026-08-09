import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
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
import {
  JoinConversationDto,
  RealtimeMessageDto,
  TypingIndicatorDto,
  WorkspacePresenceDto,
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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private readonly server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly workspaces: WorkspacesService,
  ) {}

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
    const directMessageParticipantIds =
      await this.messages.getDirectMessageParticipantIds(
        body.workspaceId,
        body.conversationId,
      );
    const rooms = [
      `conversation:${body.conversationId}`,
      ...directMessageParticipantIds.map((userId) => `user:${userId}`),
    ];
    this.server.to(rooms).emit('message.created', {
      data: message,
      meta: {
        conversationType:
          directMessageParticipantIds.length > 0 ? 'DM' : 'CHANNEL',
      },
    });
    return { data: message, meta: {} };
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
