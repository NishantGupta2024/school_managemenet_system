import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocxValidatorService } from './docx-validator.service';
import { DocxPopulationService } from './docx-population.service';
import { ReceiptTemplateStorageService } from './receipt-template-storage.service';
import { ReceiptPdfEngineService } from './receipt-pdf-engine.service';
import { CreateReceiptTemplateDto } from './dto/create-receipt-template.dto';
import {
  ReceiptTemplateResponseDto,
  ReceiptTemplateVersionResponseDto,
  UploadTemplateVersionResultDto,
} from './dto/receipt-template-response.dto';
import { createSyntheticReceiptSnapshot } from './fixtures/synthetic-receipt.fixture';
import {
  ReceiptTemplateStatus,
  TemplateVersionStatus,
  UserRole,
} from '@prisma/client';

@Injectable()
export class ReceiptTemplatesService {
  private readonly logger = new Logger(ReceiptTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docxValidatorService: DocxValidatorService,
    private readonly docxPopulationService: DocxPopulationService,
    private readonly storageService: ReceiptTemplateStorageService,
    private readonly pdfEngineService: ReceiptPdfEngineService,
  ) {}

  /**
   * Creates a draft receipt template shell for the school.
   */
  async createTemplate(
    schoolId: string,
    user: any,
    dto: CreateReceiptTemplateDto,
  ): Promise<ReceiptTemplateResponseDto> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    // Check duplicate name within school
    const existing = await this.prisma.receiptTemplate.findUnique({
      where: {
        schoolId_name: {
          schoolId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `A receipt template named '${dto.name.trim()}' already exists in this school`,
      );
    }

    const template = await this.prisma.receiptTemplate.create({
      data: {
        schoolId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: ReceiptTemplateStatus.DRAFT,
      },
    });

    return {
      id: template.id,
      schoolId: template.schoolId,
      name: template.name,
      description: template.description,
      status: template.status,
      activeVersionId: template.activeVersionId,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * Uploads and validates a new immutable DOCX template version.
   */
  async uploadVersion(
    schoolId: string,
    user: any,
    templateId: string,
    file: Express.Multer.File,
  ): Promise<UploadTemplateVersionResultDto> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    if (!file || !file.buffer) {
      throw new BadRequestException('DOCX template file is required');
    }

    const template = await this.prisma.receiptTemplate.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: templateId,
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Receipt template ${templateId} not found in this school`);
    }

    // 1. Run security and placeholder validation on uploaded buffer
    const validation = this.docxValidatorService.validateDocx(
      file.buffer,
      file.originalname,
    );

    // 2. Determine next monotonic version number for this template
    const latestVersion = await this.prisma.receiptTemplateVersion.findFirst({
      where: {
        schoolId,
        templateId,
      },
      orderBy: {
        versionNumber: 'desc',
      },
    });

    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    // 3. Store file under private immutable storage key
    const { storagePath, checksumSha256, fileSize } =
      await this.storageService.storeTemplateVersionDocx(
        schoolId,
        templateId,
        nextVersionNumber,
        file.buffer,
      );

    // 4. Check PDF engine availability
    const pdfEngineAvailable = await this.pdfEngineService.isEngineAvailable();
    const activeEngine = await this.pdfEngineService.getActiveEngine();

    // 5. Persist template version record
    const versionStatus = validation.isValid
      ? TemplateVersionStatus.PENDING_PREVIEW
      : TemplateVersionStatus.REJECTED;

    const version = await this.prisma.receiptTemplateVersion.create({
      data: {
        schoolId,
        templateId,
        versionNumber: nextVersionNumber,
        fileName: file.originalname,
        fileSize,
        mimeType:
          file.mimetype ||
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath,
        checksumSha256,
        placeholdersDetected: validation.placeholdersDetected,
        validationDiagnostics: validation.diagnostics as any,
        status: versionStatus,
        uploadedByUserId: user ? user.id : null,
      },
    });

    const versionDto: ReceiptTemplateVersionResponseDto = {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      fileName: version.fileName,
      fileSize: version.fileSize,
      mimeType: version.mimeType,
      checksumSha256: version.checksumSha256,
      placeholdersDetected: version.placeholdersDetected as string[],
      status: version.status,
      uploadedByUserId: version.uploadedByUserId,
      activatedByUserId: version.activatedByUserId,
      activatedAt: version.activatedAt,
      createdAt: version.createdAt,
    };

    return {
      version: versionDto,
      validation: {
        isValid: validation.isValid,
        canActivate: validation.isValid && pdfEngineAvailable,
        placeholdersDetected: validation.placeholdersDetected,
        diagnostics: validation.diagnostics,
        pdfEngineAvailable,
        pdfEngineName: activeEngine.engineName,
      },
    };
  }

  /**
   * Lists all receipt templates and active versions for the school.
   */
  async listTemplates(schoolId: string, user: any): Promise<ReceiptTemplateResponseDto[]> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const templates = await this.prisma.receiptTemplate.findMany({
      where: { schoolId },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => ({
      id: t.id,
      schoolId: t.schoolId,
      name: t.name,
      description: t.description,
      status: t.status,
      activeVersionId: t.activeVersionId,
      activeVersion: t.activeVersion ? this.mapVersionDto(t.activeVersion) : null,
      versions: t.versions.map((v) => this.mapVersionDto(v)),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /**
   * Retrieves single template and all its version histories.
   */
  async getTemplate(
    schoolId: string,
    user: any,
    templateId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const template = await this.prisma.receiptTemplate.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: templateId,
        },
      },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Receipt template ${templateId} not found in this school`);
    }

    return {
      id: template.id,
      schoolId: template.schoolId,
      name: template.name,
      description: template.description,
      status: template.status,
      activeVersionId: template.activeVersionId,
      activeVersion: template.activeVersion ? this.mapVersionDto(template.activeVersion) : null,
      versions: template.versions.map((v) => this.mapVersionDto(v)),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * Generates a synthetic preview PDF without touching live financial records.
   */
  async generateSyntheticPreview(
    schoolId: string,
    user: any,
    templateId: string,
    versionId: string,
  ): Promise<{ pdfBuffer: Buffer; fileName: string }> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const version = await this.prisma.receiptTemplateVersion.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: versionId,
        },
      },
      include: {
        school: true,
      },
    });

    if (!version || version.templateId !== templateId) {
      throw new NotFoundException(`Template version ${versionId} not found in this template`);
    }

    // 1. Mandatory Pre-flight: Check PDF Engine Availability
    const isEngineAvailable = await this.pdfEngineService.isEngineAvailable();
    if (!isEngineAvailable) {
      throw new ServiceUnavailableException(
        'Receipt PDF conversion engine is unavailable. Please configure Gotenberg or install LibreOffice on the server to enable preview generation and template activation.',
      );
    }

    // 2. Read template file from private storage
    const docxBuffer = await this.storageService.readTemplateDocx(version.storagePath);

    // 3. Create deterministic synthetic snapshot (No database writes!)
    const syntheticSnapshot = createSyntheticReceiptSnapshot(
      {
        id: version.school.id,
        code: version.school.code,
        name: version.school.name,
        currency: version.school.currency,
        timezone: version.school.timezone,
        address: version.school.address,
        city: version.school.city,
        state: version.school.state,
      },
      {
        id: user.id,
        name: user.name || 'School Administrator',
        role: user.role,
      },
    );

    // 4. Populate DOCX template with verified synthetic snapshot & sample watermark
    const populatedDocx = this.docxPopulationService.populateTemplate(
      docxBuffer,
      syntheticSnapshot,
      { isPreview: true },
    );

    // 5. Render into PDF using active conversion engine
    const pdfBuffer = await this.pdfEngineService.convertToPdf(populatedDocx);

    // 6. Transition version status to VALIDATED upon verified conversion
    await this.prisma.receiptTemplateVersion.update({
      where: { id: versionId },
      data: {
        status: TemplateVersionStatus.VALIDATED,
      },
    });

    return {
      pdfBuffer,
      fileName: `preview_v${version.versionNumber}_sample.pdf`,
    };
  }

  /**
   * Activates a validated template version as the school's default.
   */
  async activateVersion(
    schoolId: string,
    user: any,
    templateId: string,
    versionId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const version = await this.prisma.receiptTemplateVersion.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: versionId,
        },
      },
    });

    if (!version || version.templateId !== templateId) {
      throw new NotFoundException(`Template version ${versionId} not found in this template`);
    }

    // Version MUST be in VALIDATED state (successfully previewed and converted)
    if (version.status !== TemplateVersionStatus.VALIDATED) {
      if (version.status === TemplateVersionStatus.REJECTED) {
        throw new BadRequestException('Cannot activate a rejected template version with validation errors');
      }
      throw new BadRequestException(
        'Template activation blocked: Template version must be successfully previewed and validated before activation',
      );
    }

    // Mandatory Pre-flight Gate: PDF Engine MUST be operational before activation!
    const isEngineAvailable = await this.pdfEngineService.isEngineAvailable();
    if (!isEngineAvailable) {
      throw new ServiceUnavailableException(
        'Template activation blocked: The PDF conversion engine is not available. High-fidelity PDF generation must be operational before a custom template can be activated.',
      );
    }

    // Execute atomic version activation and deterministic school default selection in a transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Supersede any existing active version for this template
      await tx.receiptTemplateVersion.updateMany({
        where: {
          schoolId,
          templateId,
          status: TemplateVersionStatus.ACTIVE,
        },
        data: {
          status: TemplateVersionStatus.SUPERSEDED,
        },
      });

      // 2. Activate the target version
      await tx.receiptTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: TemplateVersionStatus.ACTIVE,
          activatedAt: new Date(),
          activatedByUserId: user.id,
        },
      });

      // 3. Update the template record
      await tx.receiptTemplate.update({
        where: { id: templateId },
        data: {
          status: ReceiptTemplateStatus.ACTIVE,
          activeVersionId: versionId,
        },
      });

      // 4. Set as deterministic default active template for the school
      await tx.school.update({
        where: { id: schoolId },
        data: {
          defaultReceiptTemplateId: templateId,
        },
      });

      // 5. Ensure any other templates for this school are reverted to DRAFT
      await tx.receiptTemplate.updateMany({
        where: {
          schoolId,
          id: { not: templateId },
          status: ReceiptTemplateStatus.ACTIVE,
        },
        data: {
          status: ReceiptTemplateStatus.DRAFT,
        },
      });
    });

    this.logger.log(
      `Activated template version ${version.versionNumber} for template ${templateId} in school ${schoolId} by user ${user.id}`,
    );

    return this.getTemplate(schoolId, user, templateId);
  }

  /**
   * Archives a template without deleting its historical version files.
   */
  async archiveTemplate(
    schoolId: string,
    user: any,
    templateId: string,
  ): Promise<ReceiptTemplateResponseDto> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const template = await this.prisma.receiptTemplate.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: templateId,
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Receipt template ${templateId} not found in this school`);
    }

    await this.prisma.receiptTemplate.update({
      where: { id: templateId },
      data: {
        status: ReceiptTemplateStatus.ARCHIVED,
      },
    });

    return this.getTemplate(schoolId, user, templateId);
  }

  /**
   * Downloads the raw DOCX file of a specific template version.
   */
  async downloadVersionDocx(
    schoolId: string,
    user: any,
    templateId: string,
    versionId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    this.assertSchoolAdminOrSuper(user, schoolId);

    const version = await this.prisma.receiptTemplateVersion.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: versionId,
        },
      },
    });

    if (!version || version.templateId !== templateId) {
      throw new NotFoundException(`Template version ${versionId} not found in this template`);
    }

    const buffer = await this.storageService.readTemplateDocx(version.storagePath);
    return {
      buffer,
      fileName: version.fileName,
    };
  }

  private mapVersionDto(v: any): ReceiptTemplateVersionResponseDto {
    return {
      id: v.id,
      templateId: v.templateId,
      versionNumber: v.versionNumber,
      fileName: v.fileName,
      fileSize: v.fileSize,
      mimeType: v.mimeType,
      checksumSha256: v.checksumSha256,
      placeholdersDetected: v.placeholdersDetected as string[],
      status: v.status,
      uploadedByUserId: v.uploadedByUserId,
      activatedByUserId: v.activatedByUserId,
      activatedAt: v.activatedAt,
      createdAt: v.createdAt,
    };
  }

  private assertSchoolAdminOrSuper(user: any, schoolId: string): void {
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      return;
    }
    if (user.role === UserRole.SCHOOL_ADMIN) {
      if (user.schoolId !== schoolId) {
        throw new ForbiddenException('Cross-tenant template access forbidden');
      }
      return;
    }
    throw new ForbiddenException('Access denied: Requires SCHOOL_ADMIN or PLATFORM_SUPER_ADMIN role');
  }
}
