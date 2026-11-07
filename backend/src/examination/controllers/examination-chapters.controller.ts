import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationChaptersService } from '../services/examination-chapters.service';
import { CreateChapterDto } from '../dto/create-chapter.dto';
import { QueryChaptersDto } from '../dto/query-chapters.dto';

@Controller('examination/chapters')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationChaptersController {
  constructor(private readonly chaptersService: ExaminationChaptersService) {}

  /**
   * POST /api/v1/examination/chapters
   * Create a curriculum chapter for a grade and subject.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.TEACHER)
  async createChapter(@Request() req: any, @Body() dto: CreateChapterDto) {
    const schoolId = req.school.id;
    return this.chaptersService.createChapter(schoolId, dto, req.user);
  }

  /**
   * GET /api/v1/examination/chapters
   * List syllabus chapters filtered by grade and subject.
   */
  @Get()
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async listChapters(@Request() req: any, @Query() query: QueryChaptersDto) {
    const schoolId = req.school.id;
    return this.chaptersService.listChapters(schoolId, query, req.user);
  }

  /**
   * GET /api/v1/examination/chapters/:id
   * Retrieve a single chapter by ID.
   */
  @Get(':id')
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async getChapterById(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.chaptersService.getChapterById(schoolId, id, req.user);
  }
}
