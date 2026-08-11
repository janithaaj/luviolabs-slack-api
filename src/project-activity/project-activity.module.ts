import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProjectActivity,
  ProjectActivitySchema,
} from './project-activity.schema';
import { ProjectActivityService } from './project-activity.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectActivity.name, schema: ProjectActivitySchema },
    ]),
  ],
  providers: [ProjectActivityService],
  exports: [ProjectActivityService, MongooseModule],
})
export class ProjectActivityModule {}
