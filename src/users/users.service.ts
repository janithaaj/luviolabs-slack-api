import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  create(
    input: Pick<
      User,
      | 'firstName'
      | 'lastName'
      | 'displayName'
      | 'email'
      | 'emailNormalized'
      | 'passwordHash'
    >,
  ) {
    return this.users.create(input);
  }

  findByEmailWithPassword(
    emailNormalized: string,
  ): Promise<UserDocument | null> {
    return this.users
      .findOne({ emailNormalized })
      .select('+passwordHash')
      .exec();
  }

  findByEmail(emailNormalized: string): Promise<UserDocument | null> {
    return this.users.findOne({ emailNormalized }).exec();
  }

  findById(userId: string): Promise<UserDocument | null> {
    return this.users.findById(userId).exec();
  }

  updateStatus(
    userId: string,
    customStatus?: string,
    customStatusExpiresAt?: Date,
  ) {
    const update = customStatus
      ? { $set: { customStatus, customStatusExpiresAt } }
      : { $unset: { customStatus: 1, customStatusExpiresAt: 1 } };
    return this.users.findByIdAndUpdate(userId, update, { new: true }).exec();
  }

  findPublicByIds(userIds: string[]) {
    return this.users
      .find({ _id: { $in: userIds } })
      .select({
        firstName: 1,
        lastName: 1,
        displayName: 1,
        avatarUrl: 1,
        customStatus: 1,
      })
      .lean()
      .exec();
  }
}
