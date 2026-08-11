import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { ProjectActivityModule } from '../project-activity/project-activity.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectDecisionsController } from './project-decisions.controller';
import { ProjectDecisionsService } from './project-decisions.service';
import {
  ProjectDecision,
  ProjectDecisionSchema,
} from './schemas/project-decision.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectDecision.name, schema: ProjectDecisionSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    ProjectActivityModule,
    ConversationsModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [ProjectDecisionsController],
  providers: [ProjectDecisionsService],
  exports: [ProjectDecisionsService],
})
export class ProjectDecisionsModule {}
