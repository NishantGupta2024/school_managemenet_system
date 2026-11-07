import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReceiptTemplatesController } from './receipt-templates.controller';
import { ReceiptTemplatesService } from './receipt-templates.service';
import { DocxValidatorService } from './docx-validator.service';
import { DocxPopulationService } from './docx-population.service';
import { ReceiptTemplateStorageService } from './receipt-template-storage.service';
import { ReceiptPdfEngineService } from './receipt-pdf-engine.service';
import { ReceiptArtifactService } from './receipt-artifact.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReceiptTemplatesController],
  providers: [
    ReceiptTemplatesService,
    DocxValidatorService,
    DocxPopulationService,
    ReceiptTemplateStorageService,
    ReceiptPdfEngineService,
    ReceiptArtifactService,
  ],
  exports: [
    ReceiptTemplatesService,
    DocxValidatorService,
    DocxPopulationService,
    ReceiptTemplateStorageService,
    ReceiptPdfEngineService,
    ReceiptArtifactService,
  ],
})
export class ReceiptTemplatesModule {}
