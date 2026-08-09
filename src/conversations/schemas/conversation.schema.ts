import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;
export type ConversationType = 'CHANNEL' | 'DM' | 'GROUP_DM' | 'MEETING';

@Schema({ timestamps: true, versionKey: false })
export class Conversation {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({
    required: true,
    enum: ['CHANNEL', 'DM', 'GROUP_DM', 'MEETING'],
    index: true,
  })
  type!: ConversationType;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true, sparse: true })
  channelId?: Types.ObjectId;
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  memberIds!: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.ObjectId }) createdBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId }) lastMessageId?: Types.ObjectId;
  @Prop({ index: true, default: Date.now }) lastActivityAt!: Date;
  @Prop() dmMemberKey?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index(
  { workspaceId: 1, dmMemberKey: 1 },
  {
    name: 'workspace_dm_member_key_unique',
    unique: true,
    partialFilterExpression: { dmMemberKey: { $type: 'string' } },
  },
);
