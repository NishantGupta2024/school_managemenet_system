import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { FeeGenerationModule } from '../fee-generation/fee-generation.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [FeeGenerationModule, UsersModule, NotificationsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
  })
export class StudentsModule {}
