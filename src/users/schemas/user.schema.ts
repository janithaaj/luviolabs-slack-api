import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, trim: true, maxlength: 80 }) firstName!: string;
  @Prop({ required: true, trim: true, maxlength: 80 }) lastName!: string;
  @Prop({ required: true, trim: true, maxlength: 120 }) displayName!: string;
  @Prop({ required: true, trim: true }) email!: string;
  @Prop({ required: true, unique: true, index: true, lowercase: true })
  emailNormalized!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop() avatarUrl?: string;
  @Prop({ maxlength: 160 }) customStatus?: string;
  @Prop() customStatusExpiresAt?: Date;
  @Prop() lastSeenAt?: Date;
  @Prop() emailVerifiedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
