import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { ReceiptTemplatesService } from './receipt-templates.service';
import { CreateReceiptTemplateDto } from './dto/create-receipt-template.dto';
import {
  ReceiptTemplateResponseDto,
  UploadTemplateVersionResultDto,
} from './dto/receipt-template-response.dto';

@Controller('receipt-templates')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
export class ReceiptTemplatesController {
  constructor(
    private readonly receiptTemplatesService: ReceiptTemplatesService,
  ) {}

  /**
   * Creates a new draft receipt template for the school.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Request() req: any,
    @Body() dto: CreateReceiptTemplateDto,
  ): Promise<ReceiptTemplateResponseDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.createTemplate(schoolId, user, dto);
  }

  /**
   * Lists all receipt templates and active versions for the current school.
   */
  @Get()
  async listTemplates(@Request() req: any): Promise<ReceiptTemplateResponseDto[]> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.listTemplates(schoolId, user);
  }

  /**
   * Retrieves single template and its versions.
   */
  @Get(':templateId')
  async getTemplate(
    @Request() req: any,
    @Param('templateId') templateId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.getTemplate(schoolId, user, templateId);
  }

  /**
   * Uploads and validates a new immutable template version.
   */
  @Post(':templateId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
      },
    }),
  )
  async uploadVersion(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadTemplateVersionResultDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.uploadVersion(schoolId, user, templateId, file);
  }

  /**
   * Generates and streams a synthetic preview PDF (supports GET for browser embed & POST).
   */
  @Get(':templateId/versions/:versionId/preview')
  async previewVersionGet(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.streamPreview(req, templateId, versionId, res);
  }

  @Post(':templateId/versions/:versionId/preview')
  async previewVersionPost(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.streamPreview(req, templateId, versionId, res);
  }

  private async streamPreview(
    req: any,
    templateId: string,
    versionId: string,
    res: Response,
  ): Promise<void> {
    const schoolId = req.school.id;
    const user = req.user;
    const { pdfBuffer, fileName } =
      await this.receiptTemplatesService.generateSyntheticPreview(
        schoolId,
        user,
        templateId,
        versionId,
      );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  }

  /**
   * Activates a validated template version.
   */
  @Post(':templateId/versions/:versionId/activate')
  @HttpCode(HttpStatus.OK)
  async activateVersion(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.activateVersion(
      schoolId,
      user,
      templateId,
      versionId,
    );
  }

  /**
   * Downloads the raw DOCX file of a specific version.
   */
  @Get(':templateId/versions/:versionId/download')
  async downloadVersion(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const schoolId = req.school.id;
    const user = req.user;
    const { buffer, fileName } =
      await this.receiptTemplatesService.downloadVersionDocx(
        schoolId,
        user,
        templateId,
        versionId,
      );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  /**
   * Archives a template (soft deactivation without deleting versions).
   */
  @Delete(':templateId')
  @HttpCode(HttpStatus.OK)
  async archiveTemplate(
    @Request() req: any,
    @Param('templateId') templateId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    const schoolId = req.school.id;
    const user = req.user;
    return this.receiptTemplatesService.archiveTemplate(schoolId, user, templateId);
  }
}
