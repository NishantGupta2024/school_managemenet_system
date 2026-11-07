import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ParentsController } from './parents.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, ParentsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
