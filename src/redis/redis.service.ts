import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly presenceTtlSeconds = 60;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
  }

  async markUserOnline(userId: string, socketId: string): Promise<void> {
    await this.ensureConnected();
    const socketsKey = `presence:sockets:${userId}`;
    await this.client
      .multi()
      .sadd(socketsKey, socketId)
      .set(`presence:socket:${socketId}`, userId, 'EX', this.presenceTtlSeconds)
      .expire(socketsKey, this.presenceTtlSeconds * 2)
      .exec();
  }

  async removeUserSocket(userId: string, socketId: string): Promise<void> {
    await this.ensureConnected();
    await this.client
      .multi()
      .srem(`presence:sockets:${userId}`, socketId)
      .del(`presence:socket:${socketId}`)
      .exec();
  }

  async isUserOnline(userId: string): Promise<boolean> {
    await this.ensureConnected();
    const socketsKey = `presence:sockets:${userId}`;
    const socketIds = await this.client.smembers(socketsKey);
    if (socketIds.length === 0) return false;

    const owners = await this.client.mget(
      ...socketIds.map((socketId) => `presence:socket:${socketId}`),
    );
    const staleSocketIds = socketIds.filter(
      (_socketId, index) => owners[index] !== userId,
    );
    if (staleSocketIds.length > 0) {
      await this.client.srem(socketsKey, ...staleSocketIds);
    }
    const online = owners.some((owner) => owner === userId);
    if (!online) await this.client.del(socketsKey);
    return online;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') await this.client.quit();
  }
}
