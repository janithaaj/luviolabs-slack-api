import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/schemas/conversation.schema';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersModule } from '../users/users.module';
import {
  ChannelMember,
  ChannelMemberSchema,
} from '../channels/schemas/channel-member.schema';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    ConversationsModule,
    PermissionsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: ChannelMember.name, schema: ChannelMemberSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
