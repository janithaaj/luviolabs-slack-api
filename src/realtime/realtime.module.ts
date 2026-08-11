import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { HuddlesModule } from '../huddles/huddles.module';
import { ProjectsModule } from '../projects/projects.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    HuddlesModule,
    MessagesModule,
    UsersModule,
    WorkspacesModule,
    ProjectsModule,
  ],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
