import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type HuddleDocument = HydratedDocument<Huddle>;

@Schema({ timestamps: true, versionKey: false })
export class Huddle {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  workspaceId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  conversationId!: Types.ObjectId;
  @Prop({ required: true, enum: ['CHANNEL', 'DM', 'GROUP_DM'] })
  conversationType!: 'CHANNEL' | 'DM' | 'GROUP_DM';
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  startedBy!: Types.ObjectId;
  @Prop({ required: true, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'ENDED';
  @Prop({
    required: true,
    enum: ['AUDIO', 'AUDIO_VIDEO'],
    default: 'AUDIO_VIDEO',
  })
  mediaMode!: 'AUDIO' | 'AUDIO_VIDEO';
  @Prop({ required: true, default: 0, min: 0 }) participantCount!: number;
  @Prop({
    type: {
      allowVideo: { type: Boolean, default: true },
      allowScreenShare: { type: Boolean, default: true },
      allowInvites: { type: Boolean, default: true },
    },
    default: {},
  })
  settings!: {
    allowVideo: boolean;
    allowScreenShare: boolean;
    allowInvites: boolean;
  };
  @Prop({ required: true, default: Date.now }) startedAt!: Date;
  @Prop() endedAt?: Date;
  @Prop({ min: 0 }) durationSeconds?: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const HuddleSchema = SchemaFactory.createForClass(Huddle);
HuddleSchema.index(
  { conversationId: 1, status: 1 },
  {
    unique: true,
    name: 'one_active_huddle_per_conversation',
    partialFilterExpression: { status: 'ACTIVE' },
  },
);
HuddleSchema.index({ conversationId: 1, startedAt: -1 });
HuddleSchema.index({ workspaceId: 1, startedAt: -1 });
HuddleSchema.index({ startedBy: 1, startedAt: -1 });
