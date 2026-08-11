import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true, versionKey: false })
export class Message {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  conversationId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  senderId!: Types.ObjectId;
  @Prop({ required: true, enum: ['TEXT', 'FILE', 'SYSTEM'], default: 'TEXT' })
  type!: 'TEXT' | 'FILE' | 'SYSTEM';
  /** Legacy markdown/plain body — kept for older clients */
  @Prop({ maxlength: 40_000 }) text?: string;
  /** TipTap/ProseMirror JSON document */
  @Prop({ type: Object }) contentJson?: Record<string, unknown>;
  /** Derived plain text for search / notifications / a11y */
  @Prop({ maxlength: 40_000 }) plainText?: string;
  @Prop({ type: [Object], default: [] }) attachments!: Record<
    string,
    unknown
  >[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  attachmentIds!: Types.ObjectId[];
  @Prop({ type: MongooseSchema.Types.ObjectId })
  replyToMessageId?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, index: true })
  threadRootId?: Types.ObjectId;
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  mentions!: Types.ObjectId[];
  @Prop({ type: [Object], default: [] })
  reactions!: Array<{ emoji: string; userIds: string[] }>;
  @Prop() editedAt?: Date;
  @Prop() deletedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId }) deletedBy?: Types.ObjectId;
  @Prop({ maxlength: 120 }) clientId?: string;
  @Prop({ default: false }) pinned?: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ threadRootId: 1, createdAt: 1 });
MessageSchema.index(
  { workspaceId: 1, senderId: 1, clientId: 1 },
  { unique: true, sparse: true },
);
