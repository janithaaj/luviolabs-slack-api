import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ConversationReadDocument = HydratedDocument<ConversationRead>;

@Schema({ timestamps: true, versionKey: false })
export class ConversationRead {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  conversationId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, default: Date.now }) lastReadAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ConversationReadSchema =
  SchemaFactory.createForClass(ConversationRead);
ConversationReadSchema.index(
  { workspaceId: 1, conversationId: 1, userId: 1 },
  { unique: true },
);
