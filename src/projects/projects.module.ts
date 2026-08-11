import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectActivityModule } from '../project-activity/project-activity.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { UsersModule } from '../users/users.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRealtimeService } from './projects-realtime.service';
import { ProjectsService } from './projects.service';
import {
  ProjectMember,
  ProjectMemberSchema,
} from './schemas/project-member.schema';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: ProjectMember.name, schema: ProjectMemberSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    PermissionsModule,
    ConversationsModule,
    ProjectActivityModule,
    UsersModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsRealtimeService],
  exports: [ProjectsService, ProjectsRealtimeService, MongooseModule],
})
export class ProjectsModule {}