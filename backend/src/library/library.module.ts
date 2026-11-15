import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LibraryStaffController } from './controllers/library-staff.controller';
import { LibraryStudentController } from './controllers/library-student.controller';
import { LibraryCatalogueService } from './services/library-catalogue.service';
import { LibraryCirculationService } from './services/library-circulation.service';
import { LibraryExcelImportService } from './services/library-excel-import.service';
import { LibraryFinesService } from './services/library-fines.service';
import { LibrarySettingsService } from './services/library-settings.service';
import { LibraryStudentService } from './services/library-student.service';

@Module({
  imports: [PrismaModule],
  controllers: [LibraryStaffController, LibraryStudentController],
  providers: [
    LibraryCatalogueService,
    LibraryCirculationService,
    LibraryExcelImportService,
    LibraryFinesService,
    LibrarySettingsService,
    LibraryStudentService,
  ],
  exports: [
    LibraryCatalogueService,
    LibraryCirculationService,
    LibraryExcelImportService,
    LibraryFinesService,
    LibrarySettingsService,
    LibraryStudentService,
  ],
})
export class LibraryModule {}
