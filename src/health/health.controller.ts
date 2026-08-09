import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { data: { status: 'ok' }, meta: {} };
  }

  @Get('ready')
  async ready() {
    await this.redis.ensureConnected();
    const redis = await this.redis.client.ping();
    const mongo = this.mongo.readyState === ConnectionStates.connected;
    if (!mongo || redis !== 'PONG')
      throw new ServiceUnavailableException('Dependencies are not ready');
    return { data: { status: 'ready', mongo, redis: true }, meta: {} };
  }
}
