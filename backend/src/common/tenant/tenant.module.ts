import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantGuard } from './tenant.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantContextService, TenantMiddleware, TenantGuard],
  exports: [TenantContextService, TenantMiddleware, TenantGuard],
})
export class TenantModule {}
