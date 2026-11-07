import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExaminationChaptersController } from './controllers/examination-chapters.controller';
import { ExaminationAssessmentsController } from './controllers/examination-assessments.controller';
import { ExaminationQuestionsController } from './controllers/examination-questions.controller';
import { ExaminationStudentAttemptsController } from './controllers/examination-student-attempts.controller';
import { ExaminationParentController } from './controllers/examination-parent.controller';
import { ExaminationLeaderboardController } from './controllers/examination-leaderboard.controller';
import { ExaminationChaptersService } from './services/examination-chapters.service';
import { ExaminationAssessmentsService } from './services/examination-assessments.service';
import { ExaminationQuestionsService } from './services/examination-questions.service';
import { ExaminationStorageService } from './services/examination-storage.service';
import { ExaminationStudentAttemptsService } from './services/examination-student-attempts.service';
import { ExaminationProgressionService } from './services/examination-progression.service';
import { ExaminationLeaderboardService } from './services/examination-leaderboard.service';
import { EXAMINATION_REPOSITORY } from './examination.repository.interface';
import { ExaminationPrismaRepository } from './examination.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [
    ExaminationChaptersController,
    ExaminationAssessmentsController,
    ExaminationQuestionsController,
    ExaminationStudentAttemptsController,
    ExaminationParentController,
    ExaminationLeaderboardController,
  ],
  providers: [
    ExaminationChaptersService,
    ExaminationAssessmentsService,
    ExaminationQuestionsService,
    ExaminationStorageService,
    ExaminationStudentAttemptsService,
    ExaminationProgressionService,
    ExaminationLeaderboardService,
    {
      provide: EXAMINATION_REPOSITORY,
      useClass: ExaminationPrismaRepository,
    },
  ],
  exports: [
    ExaminationChaptersService,
    ExaminationAssessmentsService,
    ExaminationQuestionsService,
    ExaminationStorageService,
    ExaminationStudentAttemptsService,
    ExaminationProgressionService,
    ExaminationLeaderboardService,
    EXAMINATION_REPOSITORY,
  ],
})
export class ExaminationModule {}
