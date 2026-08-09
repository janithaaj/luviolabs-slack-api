import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, MessagesModule, UsersModule, WorkspacesModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
