import { Module } from '@nestjs/common';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { SchoolPaymentGatewayConfigController } from './school-payment-gateway-config.controller';
import { SchoolPaymentGatewayConfigService } from './school-payment-gateway-config.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, CryptoModule, NotificationsModule],
  controllers: [SchoolsController, SchoolPaymentGatewayConfigController],
  providers: [SchoolsService, SchoolPaymentGatewayConfigService],
  exports: [SchoolsService, SchoolPaymentGatewayConfigService],
})
export class SchoolsModule {}
