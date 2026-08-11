import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class HuddleMediaService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async credentials(input: {
    huddleId: string;
    workspaceId: string;
    conversationId: string;
    userId: string;
    displayName: string;
    role: 'HOST' | 'PARTICIPANT';
  }) {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) {
      if (this.config.get<string>('NODE_ENV') === 'production')
        throw new ServiceUnavailableException('Huddle media is not configured');
      return { provider: 'DEVELOPMENT' as const };
    }

    const ttl = this.config.get<number>('HUDDLE_TOKEN_TTL_SECONDS', 600);
    const room = `huddle_${input.huddleId}`;
    const token = await this.jwt.signAsync(
      {
        name: input.displayName,
        metadata: JSON.stringify({
          role: input.role,
          huddleId: input.huddleId,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
        }),
        video: {
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      },
      {
        secret: apiSecret,
        issuer: apiKey,
        subject: input.userId,
        expiresIn: ttl,
      },
    );
    return { provider: 'LIVEKIT' as const, url, token };
  }
}
