import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { FeeHeadsModule } from './fee-heads/fee-heads.module';
import { FeeStructuresModule } from './fee-structures/fee-structures.module';
import { StudentAllocationsModule } from './student-allocations/student-allocations.module';
import { FeeGenerationModule } from './fee-generation/fee-generation.module';
import { ExcelImportsModule } from './excel-imports/excel-imports.module';
import { FineRulesModule } from './fine-rules/fine-rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    HealthModule,
    StudentsModule,
    FeeHeadsModule,
    FeeStructuresModule,
    StudentAllocationsModule,
    FeeGenerationModule,
    ExcelImportsModule,
    FineRulesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('{*path}');
  }
}
