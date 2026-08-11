import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/schemas/conversation.schema';
import { MessagesModule } from '../messages/messages.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersModule } from '../users/users.module';
import { HuddleMediaService } from './huddle-media.service';
import { HuddlesController } from './huddles.controller';
import { HuddlesRealtimeService } from './huddles-realtime.service';
import { HuddlesService } from './huddles.service';
import {
  HuddleParticipant,
  HuddleParticipantSchema,
} from './schemas/huddle-participant.schema';
import { Huddle, HuddleSchema } from './schemas/huddle.schema';

@Module({
  imports: [
    AuthModule,
    MessagesModule,
    PermissionsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Huddle.name, schema: HuddleSchema },
      { name: HuddleParticipant.name, schema: HuddleParticipantSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [HuddlesController],
  providers: [HuddlesService, HuddleMediaService, HuddlesRealtimeService],
  exports: [HuddlesService, HuddlesRealtimeService],
})
export class HuddlesModule {}
