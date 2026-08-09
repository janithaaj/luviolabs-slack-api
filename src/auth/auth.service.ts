import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { hash, verify } from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { Session } from './schemas/session.schema';

interface ClientContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
  ) {}

  async register(input: RegisterDto, context: ClientContext) {
    const emailNormalized = input.email.trim().toLowerCase();
    if (await this.users.findByEmailWithPassword(emailNormalized))
      throw new ConflictException('Email is already registered');
    const passwordHash = await hash(input.password, { type: 2 });
    try {
      const user = await this.users.create({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        displayName: input.displayName.trim(),
        email: input.email.trim(),
        emailNormalized,
        passwordHash,
      });
      return this.issueSession(user.id, input.deviceName, context);
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(input: LoginDto, context: ClientContext) {
    const user = await this.users.findByEmailWithPassword(
      input.email.trim().toLowerCase(),
    );
    if (!user || !(await verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('Invalid credentials');
    return this.issueSession(user.id, input.deviceName, context);
  }

  async refresh(input: RefreshDto, context: ClientContext) {
    const tokenHash = this.hashToken(input.refreshToken);
    const session = await this.sessions
      .findOne({
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('+refreshTokenHash')
      .exec();
    if (!session)
      throw new UnauthorizedException('Refresh token is invalid or expired');
    session.revokedAt = new Date();
    await session.save();
    return this.issueSession(
      session.userId.toString(),
      input.deviceName,
      context,
    );
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions
      .updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions
      .updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  private async issueSession(
    userId: string,
    deviceName: string,
    context: ClientContext,
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;
    const session = await this.sessions.create({
      userId,
      refreshTokenHash: this.hashToken(refreshToken),
      deviceName,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    });
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      sid: session.id,
    });
    return {
      data: {
        accessToken,
        refreshToken,
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
      meta: {},
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
