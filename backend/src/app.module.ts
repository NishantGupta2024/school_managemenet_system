import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
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
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { SchoolsModule } from './schools/schools.module';
import { UsersModule } from './users/users.module';
import { ReceiptTemplatesModule } from './receipt-templates/receipt-templates.module';
import { AcademicsModule } from './academics/academics.module';
import { TeachersModule } from './teachers/teachers.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ExaminationModule } from './examination/examination.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'backend/.env'],
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          name: 'default',
          ttl: parseInt(process.env.THROTTLE_TTL_MS || '60000', 10),
          limit: parseInt(process.env.THROTTLE_LIMIT || '120', 10), // 120 req/min for general API
        },
      ],
    }),
    PrismaModule,
    CryptoModule,
    TenantModule,
    AuthModule,
    HealthModule,
    SchoolsModule,
    UsersModule,
    AcademicsModule,
    TeachersModule,
    AttendanceModule,
    ExaminationModule,
    StudentsModule,
    FeeHeadsModule,
    FeeStructuresModule,
    StudentAllocationsModule,
    FeeGenerationModule,
    ExcelImportsModule,
    FineRulesModule,
    PaymentsModule,
    NotificationsModule,
    ReportsModule,
    ReceiptTemplatesModule,
    BackupModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('{*path}');
  }
}
