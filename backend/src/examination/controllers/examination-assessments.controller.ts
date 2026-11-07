import {
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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ExaminationAssessmentsService } from '../services/examination-assessments.service';
import { CreateAssessmentDraftDto } from '../dto/create-assessment-draft.dto';
import { UpdateAssessmentDraftDto } from '../dto/update-assessment-draft.dto';
import { QueryAssessmentsDto } from '../dto/query-assessments.dto';

@Controller('examination/assessments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ExaminationAssessmentsController {
  constructor(
    private readonly assessmentsService: ExaminationAssessmentsService,
  ) {}

  /**
   * POST /api/v1/examination/assessments/drafts
   * Create a new draft assessment header.
   */
  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.TEACHER)
  async createDraft(
    @Request() req: any,
    @Body() dto: CreateAssessmentDraftDto,
  ) {
    const schoolId = req.school.id;
    return this.assessmentsService.createDraft(schoolId, dto, req.user);
  }

  /**
   * GET /api/v1/examination/assessments
   * List assessments in caller school with optional filters.
   */
  @Get()
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async listAssessments(
    @Request() req: any,
    @Query() query: QueryAssessmentsDto,
  ) {
    const schoolId = req.school.id;
    return this.assessmentsService.listAssessments(schoolId, query, req.user);
  }

  /**
   * GET /api/v1/examination/assessments/:id
   * Retrieve a single assessment by ID.
   */
  @Get(':id')
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  async getAssessmentById(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.assessmentsService.getAssessmentById(schoolId, id, req.user);
  }

  /**
   * PATCH /api/v1/examination/assessments/:id
   * Update an assessment draft.
   */
  @Patch(':id')
  @Roles(UserRole.TEACHER)
  async updateDraft(
    @Request() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssessmentDraftDto,
  ) {
    const schoolId = req.school.id;
    return this.assessmentsService.updateDraft(schoolId, id, dto, req.user);
  }

  /**
   * DELETE /api/v1/examination/assessments/:id
   * Delete an assessment draft.
   */
  @Delete(':id')
  @Roles(UserRole.TEACHER)
  async deleteDraft(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.assessmentsService.deleteDraft(schoolId, id, req.user);
  }

  /**
   * POST /api/v1/examination/assessments/:id/publish
   * Publish an assessment draft atomically.
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  async publishAssessment(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.assessmentsService.publishAssessment(schoolId, id, req.user);
  }

  /**
   * POST /api/v1/examination/assessments/:id/release-results
   * Atomically release results for a CLOSED assessment.
   */
  @Post(':id/release-results')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  async releaseResults(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.assessmentsService.releaseResults(schoolId, id, req.user);
  }

  /**
   * POST /api/v1/examination/assessments/:id/close
   * Close a PUBLISHED assessment.
   */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  async closeAssessment(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const schoolId = req.school.id;
    return this.assessmentsService.closeAssessment(schoolId, id, req.user);
  }
}
