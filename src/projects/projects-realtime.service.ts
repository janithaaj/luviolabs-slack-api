import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class ProjectsRealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  toProject(projectId: string, event: string, data: unknown) {
    this.server?.to(`project:${projectId}`).emit(event, { data, meta: {} });
  }

  toWorkspace(workspaceId: string, event: string, data: unknown) {
    this.server?.to(`workspace:${workspaceId}`).emit(event, { data, meta: {} });
  }

  toUsers(userIds: string[], event: string, data: unknown) {
    if (userIds.length === 0) return;
    this.server
      ?.to(userIds.map((id) => `user:${id}`))
      .emit(event, { data, meta: {} });
  }
}
