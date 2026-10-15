import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma successfully connected to PostgreSQL 18 (fee_db)');
    } catch (error) {
      this.logger.error('Prisma connection error:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL');
  }

  async ping(): Promise<number> {
    const start = Date.now();
    await this.$queryRaw`SELECT 1`;
    return Date.now() - start;
  }
}
