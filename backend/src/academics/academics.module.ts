import { Module } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { AcademicsController } from './academics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AcademicsController],
  providers: [AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
