import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsModule } from '../conversations/conversations.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import {
  ChannelMember,
  ChannelMemberSchema,
} from './schemas/channel-member.schema';
import { Channel, ChannelSchema } from './schemas/channel.schema';

@Module({
  imports: [
    PermissionsModule,
    ConversationsModule,
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelMember.name, schema: ChannelMemberSchema },
    ]),
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
