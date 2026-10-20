import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();

      // Verify connected database identity dynamically
      const result = await this.$queryRaw<Array<{ db: string }>>`SELECT current_database() as db`;
      const activeDb = result[0]?.db || 'unknown';

      // Refuse startup against fee_db in non-production environments
      if (
        process.env.NODE_ENV !== 'production' &&
        activeDb.toLowerCase() === 'fee_db' &&
        process.env.ALLOW_UNSAFE_FEE_DB !== 'true'
      ) {
        throw new Error(
          `PrismaService startup blocked: Connected to prohibited database 'fee_db' under NODE_ENV='${process.env.NODE_ENV || 'development'}'. Point DATABASE_URL to an authorized staging or test database.`,
        );
      }

      this.logger.log(`Prisma successfully connected to PostgreSQL (database: ${activeDb})`);
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
