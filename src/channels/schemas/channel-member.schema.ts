import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ versionKey: false })
export class ChannelMember {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  channelId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, default: Date.now }) joinedAt!: Date;
}

export const ChannelMemberSchema = SchemaFactory.createForClass(ChannelMember);
ChannelMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
