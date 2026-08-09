import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ timestamps: true, versionKey: false })
export class Session {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, select: false })
  refreshTokenHash!: string;
  @Prop({ maxlength: 120 }) deviceName?: string;
  @Prop({ maxlength: 500 }) userAgent?: string;
  @Prop() ipAddress?: string;
  @Prop({ required: true, index: true, expires: 0 }) expiresAt!: Date;
  @Prop() revokedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
