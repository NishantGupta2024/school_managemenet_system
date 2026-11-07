import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ReceiptTemplatesController } from './receipt-templates.controller';
import { ReceiptTemplatesService } from './receipt-templates.service';
import { ReceiptTemplateStatus, TemplateVersionStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { ROLES_KEY } from '../common/auth/roles.decorator';

describe('ReceiptTemplatesController', () => {
  let controller: ReceiptTemplatesController;
  let service: any;
  let reflector: Reflector;

  const mockReq = {
    school: { id: 'school-alpha' },
    user: {
      id: 'admin-1',
      schoolId: 'school-alpha',
      role: UserRole.SCHOOL_ADMIN,
    },
  };

  const mockRes = {
    setHeader: jest.fn(),
    send: jest.fn(),
  };

  beforeEach(async () => {
    service = {
      createTemplate: jest.fn(),
      listTemplates: jest.fn(),
      getTemplate: jest.fn(),
      uploadVersion: jest.fn(),
      generateSyntheticPreview: jest.fn(),
      activateVersion: jest.fn(),
      downloadVersionDocx: jest.fn(),
      archiveTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptTemplatesController],
      providers: [
        { provide: ReceiptTemplatesService, useValue: service },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReceiptTemplatesController>(ReceiptTemplatesController);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  describe('Authorization Metadata & Role Protection', () => {
    it('restricts entire ReceiptTemplatesController to PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN', () => {
      const requiredRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        ReceiptTemplatesController,
      );
      expect(requiredRoles).toEqual([
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
      ]);
    });
  });

  it('delegates createTemplate to service using server-validated school context', async () => {
    service.createTemplate.mockResolvedValue({
      id: 'tpl-1',
      schoolId: 'school-alpha',
      name: 'Fee Receipt',
      status: ReceiptTemplateStatus.DRAFT,
    });

    const result = await controller.createTemplate(mockReq, { name: 'Fee Receipt' });
    expect(result.id).toBe('tpl-1');
    expect(service.createTemplate).toHaveBeenCalledWith(
      'school-alpha',
      mockReq.user,
      { name: 'Fee Receipt' },
    );
  });

  it('delegates listTemplates to service', async () => {
    service.listTemplates.mockResolvedValue([]);
    const res = await controller.listTemplates(mockReq);
    expect(res).toEqual([]);
    expect(service.listTemplates).toHaveBeenCalledWith('school-alpha', mockReq.user);
  });

  it('delegates getTemplate to service', async () => {
    service.getTemplate.mockResolvedValue({ id: 'tpl-1' });
    const res = await controller.getTemplate(mockReq, 'tpl-1');
    expect(res.id).toBe('tpl-1');
    expect(service.getTemplate).toHaveBeenCalledWith('school-alpha', mockReq.user, 'tpl-1');
  });

  it('delegates uploadVersion to service with uploaded file', async () => {
    const mockFile = {
      buffer: Buffer.from('mock docx'),
      originalname: 'template.docx',
    } as Express.Multer.File;

    service.uploadVersion.mockResolvedValue({
      version: { id: 'ver-1', versionNumber: 1, status: TemplateVersionStatus.PENDING_PREVIEW },
      validation: { isValid: true, canActivate: true },
    });

    const res = await controller.uploadVersion(mockReq, 'tpl-1', mockFile);
    expect(res.version.versionNumber).toBe(1);
    expect(service.uploadVersion).toHaveBeenCalledWith(
      'school-alpha',
      mockReq.user,
      'tpl-1',
      mockFile,
    );
  });

  it('streams PDF preview via GET and POST with correct inline headers', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4 sample content');
    service.generateSyntheticPreview.mockResolvedValue({
      pdfBuffer: pdfBuf,
      fileName: 'preview_v1_sample.pdf',
    });

    // Test GET
    await controller.previewVersionGet(mockReq, 'tpl-1', 'ver-1', mockRes as any);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="preview_v1_sample.pdf"',
    );
    expect(mockRes.send).toHaveBeenCalledWith(pdfBuf);

    // Test POST
    await controller.previewVersionPost(mockReq, 'tpl-1', 'ver-1', mockRes as any);
    expect(service.generateSyntheticPreview).toHaveBeenCalledTimes(2);
  });

  it('delegates activateVersion to service', async () => {
    service.activateVersion.mockResolvedValue({
      id: 'tpl-1',
      status: ReceiptTemplateStatus.ACTIVE,
      activeVersionId: 'ver-1',
    });

    const res = await controller.activateVersion(mockReq, 'tpl-1', 'ver-1');
    expect(res.status).toBe(ReceiptTemplateStatus.ACTIVE);
    expect(service.activateVersion).toHaveBeenCalledWith(
      'school-alpha',
      mockReq.user,
      'tpl-1',
      'ver-1',
    );
  });

  it('streams DOCX template file with correct attachment headers', async () => {
    const docxBuf = Buffer.from('docx binary data');
    service.downloadVersionDocx.mockResolvedValue({
      buffer: docxBuf,
      fileName: 'receipt_v1.docx',
    });

    await controller.downloadVersion(mockReq, 'tpl-1', 'ver-1', mockRes as any);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="receipt_v1.docx"',
    );
    expect(mockRes.send).toHaveBeenCalledWith(docxBuf);
  });

  it('delegates archiveTemplate to service', async () => {
    service.archiveTemplate.mockResolvedValue({
      id: 'tpl-1',
      status: ReceiptTemplateStatus.ARCHIVED,
    });

    const res = await controller.archiveTemplate(mockReq, 'tpl-1');
    expect(res.status).toBe(ReceiptTemplateStatus.ARCHIVED);
    expect(service.archiveTemplate).toHaveBeenCalledWith('school-alpha', mockReq.user, 'tpl-1');
  });
});
