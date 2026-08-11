import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectActivityModule } from '../project-activity/project-activity.module';
import { ProjectsModule } from '../projects/projects.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Sprint, SprintSchema } from './schemas/sprint.schema';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    ProjectActivityModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
