import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FineRulesService } from './fine-rules.service';
import { FineRulesController } from './fine-rules.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FineRulesController],
  providers: [FineRulesService],
  exports: [FineRulesService],
})
export class FineRulesModule {}
