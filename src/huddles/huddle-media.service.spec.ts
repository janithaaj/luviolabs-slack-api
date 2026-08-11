import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HuddleMediaService } from './huddle-media.service';

describe('HuddleMediaService', () => {
  const input = {
    huddleId: '507f1f77bcf86cd799439011',
    workspaceId: '507f1f77bcf86cd799439012',
    conversationId: '507f1f77bcf86cd799439013',
    userId: '507f191e810c19729de860ea',
    displayName: 'Alex Doe',
    role: 'HOST' as const,
  };

  it('uses an explicit development mode when LiveKit is not configured', async () => {
    const service = new HuddleMediaService(
      new ConfigService({ NODE_ENV: 'development' }),
      new JwtService(),
    );
    await expect(service.credentials(input)).resolves.toEqual({
      provider: 'DEVELOPMENT',
    });
  });

  it('fails closed in production when the SFU is not configured', async () => {
    const service = new HuddleMediaService(
      new ConfigService({ NODE_ENV: 'production' }),
      new JwtService(),
    );
    await expect(service.credentials(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('mints a short-lived, room-scoped LiveKit token without exposing the secret', async () => {
    const secret = 'livekit-secret-at-least-sixteen-characters';
    const jwt = new JwtService();
    const service = new HuddleMediaService(
      new ConfigService({
        NODE_ENV: 'production',
        LIVEKIT_URL: 'wss://livekit.example.com',
        LIVEKIT_API_KEY: 'livekit-key',
        LIVEKIT_API_SECRET: secret,
        HUDDLE_TOKEN_TTL_SECONDS: 600,
      }),
      jwt,
    );

    const credentials = await service.credentials(input);
    expect(credentials.provider).toBe('LIVEKIT');
    expect(credentials).not.toHaveProperty('secret');
    const claims = await jwt.verifyAsync<{
      sub: string;
      iss: string;
      exp: number;
      iat: number;
      video: { room: string; roomJoin: boolean };
    }>(credentials.token!, { secret });
    expect(claims.sub).toBe(input.userId);
    expect(claims.iss).toBe('livekit-key');
    expect(claims.video).toMatchObject({
      room: `huddle_${input.huddleId}`,
      roomJoin: true,
    });
    expect(claims.exp - claims.iat).toBe(600);
  });
});
