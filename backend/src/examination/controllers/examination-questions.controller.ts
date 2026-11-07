import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationQuestionsService } from '../services/examination-questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { ConfirmQuestionImportDto } from '../dto/confirm-question-import.dto';

@Controller('examination/assessments/:assessmentId/questions')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationQuestionsController {
  constructor(
    private readonly questionsService: ExaminationQuestionsService,
  ) {}

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions
   * Add a single MCQ question to a draft assessment.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.TEACHER)
  async createQuestion(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.createQuestion(
      schoolId,
      assessmentId,
      dto,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/questions
   * List all questions in an assessment with marks reconciliation summary.
   */
  @Get()
  @Roles(UserRole.TEACHER)
  async listQuestions(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.listQuestions(
      schoolId,
      assessmentId,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/questions/:id
   * Retrieve a single question by ID.
   */
  @Get(':id')
  @Roles(UserRole.TEACHER)
  async getQuestionById(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.getQuestionById(
      schoolId,
      assessmentId,
      id,
      req.user,
    );
  }

  /**
   * PATCH /api/v1/examination/assessments/:assessmentId/questions/:id
   * Update a question in a draft assessment.
   */
  @Patch(':id')
  @Roles(UserRole.TEACHER)
  async updateQuestion(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.updateQuestion(
      schoolId,
      assessmentId,
      id,
      dto,
      req.user,
    );
  }

  /**
   * DELETE /api/v1/examination/assessments/:assessmentId/questions/:id
   * Delete a question from a draft assessment.
   */
  @Delete(':id')
  @Roles(UserRole.TEACHER)
  async deleteQuestion(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.deleteQuestion(
      schoolId,
      assessmentId,
      id,
      req.user,
    );
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions/import/preview
   * Parse uploaded Excel spreadsheet, validate rows, check duplicates and marks reconciliation.
   * Does NOT mutate the database.
   */
  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
      fileFilter: (req, file, cb) => {
        const isValidMime =
          file.mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/octet-stream' ||
          file.originalname.endsWith('.xlsx');

        if (!isValidMime && !file.originalname.match(/\.xlsx$/i)) {
          return cb(
            new BadRequestException('Only .xlsx spreadsheet files are accepted'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async previewImport(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required');
    }

    const schoolId = req.school.id;
    return this.questionsService.previewImport(
      schoolId,
      assessmentId,
      file.buffer,
      req.user,
    );
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions/import/confirm
   * Atomically commit validated questions into the draft assessment.
   */
  @Post('import/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  async confirmImport(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: ConfirmQuestionImportDto,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.confirmImport(
      schoolId,
      assessmentId,
      dto,
      req.user,
    );
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions/:id/image
   * Attach or replace an image diagram for a question.
   */
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
      },
    }),
  )
  async uploadQuestionImage(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) questionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const schoolId = req.school.id;
    return this.questionsService.uploadQuestionImage(
      schoolId,
      assessmentId,
      questionId,
      file,
      req.user,
    );
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/questions/:id/image
   * Stream question image diagram.
   */
  @Get(':id/image')
  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  async getQuestionImage(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) questionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const schoolId = req.school.id;
    const { buffer, mimeType, fileName } = await this.questionsService.getQuestionImage(
      schoolId,
      assessmentId,
      questionId,
      req.user,
    );

    const safeFileName = String(fileName || 'image').replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }

  /**
   * DELETE /api/v1/examination/assessments/:assessmentId/questions/:id/image
   * Remove question image diagram.
   */
  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  async deleteQuestionImage(
    @Request() req: any,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('id', new ParseUUIDPipe()) questionId: string,
  ) {
    const schoolId = req.school.id;
    return this.questionsService.deleteQuestionImage(
      schoolId,
      assessmentId,
      questionId,
      req.user,
    );
  }
}
