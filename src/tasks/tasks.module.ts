import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectActivityModule } from '../project-activity/project-activity.module';
import { ProjectsModule } from '../projects/projects.module';
import { Sprint, SprintSchema } from '../sprints/schemas/sprint.schema';
import { Task, TaskSchema } from './schemas/task.schema';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Sprint.name, schema: SprintSchema },
    ]),
    PermissionsModule,
    ConversationsModule,
    ProjectActivityModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService, MongooseModule],
})
export class TasksModule {}
