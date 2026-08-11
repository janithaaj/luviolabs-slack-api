import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type HuddleParticipantDocument = HydratedDocument<HuddleParticipant>;

@Schema({ timestamps: false, versionKey: false })
export class HuddleParticipant {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  huddleId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['HOST', 'PARTICIPANT'] }) role!:
    'HOST' | 'PARTICIPANT';
  @Prop({ required: true, default: true }) muted!: boolean;
  @Prop({ required: true, default: false }) videoEnabled!: boolean;
  @Prop({ required: true, default: false }) screenSharing!: boolean;
  @Prop({ required: true, default: false }) handRaised!: boolean;
  @Prop({ required: true, default: Date.now }) joinedAt!: Date;
  @Prop() leftAt?: Date;
  @Prop({ min: 0 }) durationSeconds?: number;
}

export const HuddleParticipantSchema =
  SchemaFactory.createForClass(HuddleParticipant);
HuddleParticipantSchema.index({ huddleId: 1, userId: 1, joinedAt: -1 });
HuddleParticipantSchema.index(
  { huddleId: 1, userId: 1 },
  {
    unique: true,
    name: 'one_active_participant_session',
    partialFilterExpression: { leftAt: { $exists: false } },
  },
);
