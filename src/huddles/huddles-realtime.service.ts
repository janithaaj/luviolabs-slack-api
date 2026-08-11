import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class HuddlesRealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  toWorkspace(workspaceId: string, event: string, data: unknown) {
    this.server?.to(`workspace:${workspaceId}`).emit(event, { data, meta: {} });
  }

  toHuddle(huddleId: string, event: string, data: unknown) {
    this.server?.to(`huddle:${huddleId}`).emit(event, { data, meta: {} });
  }

  toUsers(userIds: string[], event: string, data: unknown) {
    if (userIds.length === 0) return;
    this.server
      ?.to(userIds.map((id) => `user:${id}`))
      .emit(event, { data, meta: {} });
  }

  toRooms(rooms: string[], event: string, data: unknown) {
    if (rooms.length === 0) return;
    this.server?.to([...new Set(rooms)]).emit(event, { data, meta: {} });
  }
}
