import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ReceiptArtifactStatus,
  ReceiptTemplateStatus,
  TemplateVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocxPopulationService } from './docx-population.service';
import { ReceiptTemplateStorageService } from './receipt-template-storage.service';
import { ReceiptPdfEngineService } from './receipt-pdf-engine.service';
import { ReceiptSnapshot } from './fixtures/synthetic-receipt.fixture';

const PDFDocument = require('pdfkit');

/** A PENDING claim older than this is considered abandoned (e.g. crashed worker) and may be retaken. */
const PENDING_STALE_AFTER_MS = 2 * 60 * 1000;

export interface EnsureReceiptArtifactOptions {
  throwOnFailure?: boolean;
}

export interface RenderedReceiptPdfResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  isLegacy: boolean;
  receiptNumber: string;
  templateVersionId: string | null;
}

export interface ReceiptPdfOptions {
  layout?: 'compact' | 'standard';
  copies?: number;
  copyLabels?: string[];
}

/**
 * Resolves the school's currently active default template version ID using strictly
 * tenant-scoped queries. Returns null if no active template is configured or valid.
 */
export async function resolveActiveTemplateVersionForSchool(
  db: any,
  schoolId: string,
  defaultReceiptTemplateId?: string | null,
): Promise<string | null> {
  if (!db || !schoolId) {
    return null;
  }

  let targetTemplateId = defaultReceiptTemplateId;
  if (targetTemplateId === undefined && db.school?.findUnique) {
    try {
      const school = await db.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });
      if (!school || (school.id && school.id !== schoolId)) {
        return null;
      }
      targetTemplateId = (school as any).defaultReceiptTemplateId ?? null;
    } catch {
      targetTemplateId = null;
    }
  }

  if (!targetTemplateId || !db.receiptTemplate?.findUnique) {
    return null;
  }

  const template = await db.receiptTemplate.findUnique({
    where: {
      schoolId_id: {
        schoolId,
        id: targetTemplateId,
      },
    },
    include: {
      activeVersion: true,
    },
  });

  if (
    !template ||
    template.schoolId !== schoolId ||
    template.status !== ReceiptTemplateStatus.ACTIVE ||
    !template.activeVersionId
  ) {
    return null;
  }

  let activeVersion = template.activeVersion;
  if (!activeVersion && db.receiptTemplateVersion?.findUnique) {
    activeVersion = await db.receiptTemplateVersion.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: template.activeVersionId,
        },
      },
    });
  }

  if (
    !activeVersion ||
    activeVersion.schoolId !== schoolId ||
    activeVersion.templateId !== template.id ||
    activeVersion.status !== TemplateVersionStatus.ACTIVE
  ) {
    return null;
  }

  return activeVersion.id;
}

@Injectable()
export class ReceiptArtifactService {
  private readonly logger = new Logger(ReceiptArtifactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docxPopulationService: DocxPopulationService,
    private readonly storageService: ReceiptTemplateStorageService,
    private readonly pdfEngineService: ReceiptPdfEngineService,
  ) {}

  /**
   * Resolves the school's currently active default template version ID using
   * tenant-scoped queries.
   */
  public async resolveActiveTemplateVersionId(
    db: any,
    schoolId: string,
    defaultReceiptTemplateId?: string | null,
  ): Promise<string | null> {
    return resolveActiveTemplateVersionForSchool(
      db || this.prisma,
      schoolId,
      defaultReceiptTemplateId,
    );
  }

  /**
   * Idempotently generates or retrieves the PDF artifact for an issued receipt
   * outside the financial transaction, using the receipt's frozen snapshot and
   * stored templateVersionId.
   */
  public async ensureArtifactForReceipt(
    schoolId: string,
    receiptId: string,
    options: EnsureReceiptArtifactOptions = {},
  ): Promise<any | null> {
    const receipt = await this.prisma.receipt.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: receiptId,
        },
      },
      include: {
        artifact: true,
        templateVersion: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptId} not found in this school`);
    }

    if (receipt.schoolId !== schoolId) {
      throw new ForbiddenException('Cross-tenant receipt access forbidden');
    }

    // Legacy receipts have no templateVersionId; preserve legacy behavior
    if (!receipt.templateVersionId) {
      return null;
    }

    let existingArtifact = receipt.artifact;
    if (!existingArtifact && this.prisma.receiptArtifact?.findUnique) {
      existingArtifact = await this.prisma.receiptArtifact.findUnique({
        where: {
          schoolId_receiptId: {
            schoolId,
            receiptId: receipt.id,
          },
        },
      });
    }

    if (existingArtifact && existingArtifact.schoolId !== schoolId) {
      throw new ForbiddenException('Cross-tenant receipt artifact access forbidden');
    }

    // Idempotency: if artifact is already READY with a valid storagePath, return immediately
    if (
      existingArtifact &&
      existingArtifact.status === ReceiptArtifactStatus.READY &&
      existingArtifact.storagePath
    ) {
      return existingArtifact;
    }

    let templateVersion = receipt.templateVersion;
    if (!templateVersion && this.prisma.receiptTemplateVersion?.findUnique) {
      templateVersion = await this.prisma.receiptTemplateVersion.findUnique({
        where: {
          schoolId_id: {
            schoolId,
            id: receipt.templateVersionId,
          },
        },
      });
    }

    const nextAttempt = (existingArtifact?.generationAttempts ?? 0) + 1;
    const attemptAt = new Date();

    // Claim the generation attempt atomically so concurrent requests cannot both convert.
    let artifactRecord: any;
    if (!existingArtifact) {
      try {
        artifactRecord = await this.prisma.receiptArtifact.create({
          data: {
            schoolId,
            receiptId: receipt.id,
            templateVersionId: receipt.templateVersionId,
            status: ReceiptArtifactStatus.PENDING,
            generationAttempts: nextAttempt,
            lastAttemptAt: attemptAt,
            failureReason: null,
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // A concurrent request created the logical artifact first; defer to it.
          return this.findArtifact(schoolId, receipt.id);
        }
        throw err;
      }
    } else {
      const lastAttemptMs = existingArtifact.lastAttemptAt
        ? new Date(existingArtifact.lastAttemptAt).getTime()
        : 0;
      if (
        existingArtifact.status === ReceiptArtifactStatus.PENDING &&
        Date.now() - lastAttemptMs < PENDING_STALE_AFTER_MS
      ) {
        // Another worker/request is actively generating this artifact.
        return existingArtifact;
      }

      const claim = await this.prisma.receiptArtifact.updateMany({
        where: {
          id: existingArtifact.id,
          schoolId,
          status: existingArtifact.status,
          generationAttempts: existingArtifact.generationAttempts,
        },
        data: {
          status: ReceiptArtifactStatus.PENDING,
          generationAttempts: nextAttempt,
          lastAttemptAt: attemptAt,
          failureReason: null,
        },
      });
      if (claim.count !== 1) {
        return this.findArtifact(schoolId, receipt.id);
      }
      artifactRecord = {
        ...existingArtifact,
        status: ReceiptArtifactStatus.PENDING,
        generationAttempts: nextAttempt,
      };
    }

    if (!templateVersion || templateVersion.schoolId !== schoolId) {
      const reason =
        'Template version not found in this school or cross-tenant reference rejected';
      const failedRecord = await this.finalizeAttempt(
        schoolId,
        receipt.id,
        artifactRecord.id,
        nextAttempt,
        { status: ReceiptArtifactStatus.FAILED, failureReason: reason },
      );
      if (options.throwOnFailure) {
        throw new ForbiddenException(reason);
      }
      return failedRecord;
    }

    try {
      const templateDocxBuffer = await this.storageService.readTemplateDocx(
        templateVersion.storagePath,
      );

      // Populate strictly in OFFICIAL mode using the frozen receipt snapshot
      const populatedDocxBuffer = this.docxPopulationService.populateTemplate(
        templateDocxBuffer,
        receipt.receiptSnapshot as unknown as ReceiptSnapshot,
        { isPreview: false, mode: 'OFFICIAL' },
      );

      const pdfBuffer = await this.pdfEngineService.convertToPdf(
        populatedDocxBuffer,
      );

      const stored = await this.storageService.storeReceiptArtifactPdf(
        schoolId,
        receipt.academicYearId,
        receipt.receiptNumber,
        pdfBuffer,
      );

      return await this.finalizeAttempt(
        schoolId,
        receipt.id,
        artifactRecord.id,
        nextAttempt,
        {
          status: ReceiptArtifactStatus.READY,
          storagePath: stored.storagePath,
          fileSize: stored.fileSize,
          checksumSha256: stored.checksumSha256,
          failureReason: null,
        },
      );
    } catch (err: any) {
      const failureReason =
        err?.message || 'Receipt PDF artifact generation failed';
      this.logger.warn(
        `Artifact generation failed for receipt ${receipt.receiptNumber} (attempt ${nextAttempt}): ${failureReason}`,
      );

      const failedRecord = await this.finalizeAttempt(
        schoolId,
        receipt.id,
        artifactRecord.id,
        nextAttempt,
        { status: ReceiptArtifactStatus.FAILED, failureReason },
      );

      if (options.throwOnFailure) {
        throw err;
      }
      return failedRecord;
    }
  }

  private async findArtifact(schoolId: string, receiptId: string): Promise<any> {
    return this.prisma.receiptArtifact.findUnique({
      where: { schoolId_receiptId: { schoolId, receiptId } },
    });
  }

  /**
   * Compare-and-set finalization: only the attempt that currently owns the PENDING claim
   * may write its outcome, so a late/stale failure can never overwrite a READY artifact.
   */
  private async finalizeAttempt(
    schoolId: string,
    receiptId: string,
    artifactId: string,
    attempt: number,
    data: Record<string, any>,
  ): Promise<any> {
    await this.prisma.receiptArtifact.updateMany({
      where: {
        id: artifactId,
        schoolId,
        status: ReceiptArtifactStatus.PENDING,
        generationAttempts: attempt,
      },
      data,
    });
    return this.findArtifact(schoolId, receiptId);
  }

  /**
   * Retrieves or generates the official PDF for an authorized receipt record
   * using its original receipt number and frozen snapshot.
   */
  public async getOrGenerateReceiptPdf(
    schoolId: string,
    receipt: any,
    options?: ReceiptPdfOptions,
  ): Promise<RenderedReceiptPdfResult> {
    if (!receipt || receipt.schoolId !== schoolId) {
      throw new ForbiddenException('Cross-tenant receipt access forbidden');
    }

    const fileName = `${receipt.receiptNumber}.pdf`;

    // Compact layout requested or legacy receipt without template
    if (options?.layout === 'compact' || !receipt.templateVersionId) {
      const pdfBuffer = await this.renderLegacyReceiptPdf(receipt, options);
      return {
        buffer: pdfBuffer,
        fileName,
        contentType: 'application/pdf',
        isLegacy: !receipt.templateVersionId,
        receiptNumber: receipt.receiptNumber,
        templateVersionId: receipt.templateVersionId ?? null,
      };
    }

    // Custom template receipt path: ensure artifact is READY (supports safe retry on FAILED/PENDING)
    const artifact = await this.ensureArtifactForReceipt(schoolId, receipt.id, {
      throwOnFailure: true,
    });

    if (artifact && artifact.status === ReceiptArtifactStatus.PENDING) {
      throw new ServiceUnavailableException(
        `Receipt PDF for ${receipt.receiptNumber} is being generated; please retry shortly`,
      );
    }

    if (
      !artifact ||
      artifact.schoolId !== schoolId ||
      artifact.status !== ReceiptArtifactStatus.READY ||
      !artifact.storagePath
    ) {
      throw new NotFoundException(
        `Receipt PDF artifact is unavailable for receipt ${receipt.receiptNumber}`,
      );
    }

    const pdfBuffer = await this.storageService.readReceiptArtifactPdf(
      artifact.storagePath,
    );

    return {
      buffer: pdfBuffer,
      fileName,
      contentType: 'application/pdf',
      isLegacy: false,
      receiptNumber: receipt.receiptNumber,
      templateVersionId: receipt.templateVersionId,
    };
  }

  /**
   * Generates a multi-receipt batch PDF scoped strictly to the authorized tenant.
   * Renders 3 receipts per A4 page in compact mode.
   */
  public async renderBatchReceiptsPdf(
    schoolId: string,
    receipts: any[],
    options?: ReceiptPdfOptions,
  ): Promise<RenderedReceiptPdfResult> {
    for (const r of receipts) {
      if (!r || r.schoolId !== schoolId) {
        throw new ForbiddenException('Cross-tenant receipt access forbidden');
      }
    }

    const pdfBuffer = await this.renderCompactReceiptsPdf(receipts, options);
    const fileName = `batch-receipts-${receipts.length}.pdf`;
    return {
      buffer: pdfBuffer,
      fileName,
      contentType: 'application/pdf',
      isLegacy: true,
      receiptNumber: receipts[0]?.receiptNumber || 'BATCH',
      templateVersionId: null,
    };
  }

  /**
   * Renders a deterministic PDF from the frozen receiptSnapshot.
   * If layout === 'standard', generates legacy single-page PDF.
   * Otherwise, generates compact 3-per-page layout (or copies on 1 page if copies specified).
   */
  public async renderLegacyReceiptPdf(
    receipt: any,
    options?: ReceiptPdfOptions,
  ): Promise<Buffer> {
    if (options?.layout === 'standard') {
      return this.renderStandardReceiptPdf(receipt);
    }

    const copies = options?.copies && options.copies > 1 ? options.copies : 1;
    const receiptsToRender = Array.from({ length: copies }, () => receipt);
    return this.renderCompactReceiptsPdf(receiptsToRender, {
      ...options,
      copyLabels:
        copies === 3
          ? ['STUDENT COPY', 'OFFICE COPY', 'ACCOUNTS COPY']
          : undefined,
    });
  }

  /**
   * Preserves existing single-receipt full-page PDF behavior for backwards compatibility.
   */
  public async renderStandardReceiptPdf(receipt: any): Promise<Buffer> {
    const snapshot: Partial<ReceiptSnapshot> =
      receipt?.receiptSnapshot && typeof receipt.receiptSnapshot === 'object'
        ? receipt.receiptSnapshot
        : {};

    const schoolName = snapshot.school?.name || 'School Fee Receipt';
    const receiptNumber = snapshot.receiptNumber || receipt?.receiptNumber || '';
    const paymentNumber = snapshot.paymentNumber || '';
    const studentName =
      snapshot.student?.fullName ||
      [snapshot.student?.firstName, snapshot.student?.lastName]
        .filter(Boolean)
        .join(' ') ||
      '';
    const admissionNumber = snapshot.student?.admissionNumber || '';
    const academicYear = snapshot.academicYear?.name || '';
    const paymentMethod = snapshot.paymentMethod || '';
    const currency = snapshot.school?.currency || 'INR';
    const amountNum =
      typeof snapshot.amount === 'number' && Number.isFinite(snapshot.amount)
        ? snapshot.amount
        : Number(receipt?.totalAmount ?? 0);
    const formattedTotal = Number.isFinite(amountNum)
      ? amountNum.toFixed(2)
      : '0.00';
    const allocations = Array.isArray(snapshot.allocations)
      ? snapshot.allocations
      : [];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.fontSize(16).text(schoolName, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).text('OFFICIAL FEE RECEIPT', { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(10);
      doc.text(`Receipt Number: ${receiptNumber}`);
      if (paymentNumber) doc.text(`Payment Number: ${paymentNumber}`);
      if (academicYear) doc.text(`Academic Year: ${academicYear}`);
      if (studentName) doc.text(`Student Name: ${studentName}`);
      if (admissionNumber) doc.text(`Admission Number: ${admissionNumber}`);
      if (paymentMethod) doc.text(`Payment Method: ${paymentMethod}`);
      doc.moveDown(1);

      if (allocations.length > 0) {
        doc.text('Fee Allocations:');
        allocations.forEach((alloc: any, idx: number) => {
          const head = alloc.feeHeadNameSnapshot || alloc.allocationType || 'Fee';
          const amt = Number(alloc.allocatedAmount ?? 0).toFixed(2);
          doc.text(`${idx + 1}. ${head} (${alloc.allocationType}): ${currency} ${amt}`);
        });
        doc.moveDown(1);
      }

      doc.fontSize(11).text(`Total Amount Paid: ${currency} ${formattedTotal}`);
      doc.end();
    });
  }

  /**
   * Renders multiple receipts (or multiple copies) in compact print mode.
   * Up to 3 receipts are stacked vertically per A4 portrait page (595.28 x 841.89 pt),
   * separated by subtle cut lines. Receipts with long line item lists gracefully fall back
   * to full-page mode to prevent clipping or truncation of financial records.
   */
  public async renderCompactReceiptsPdf(
    receipts: any[],
    options?: ReceiptPdfOptions,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      let currentSlot = 0;
      let pageOpen = false;

      const ensurePage = () => {
        if (!pageOpen) {
          doc.addPage();
          pageOpen = true;
          currentSlot = 0;
        }
      };

      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        const allocs = receipt?.receiptSnapshot?.allocations || receipt?.payment?.allocations || [];
        const isOverflow = allocs.length > 6;
        const copyLabel =
          options?.copyLabels && options.copyLabels[i]
            ? options.copyLabels[i]
            : undefined;

        if (isOverflow) {
          // Finish current page if partially filled, then render full-page receipt
          pageOpen = false;
          currentSlot = 0;
          this.drawFullPageReceipt(doc, receipt, copyLabel);
          continue;
        }

        ensurePage();
        this.drawCompactReceiptSlot(doc, receipt, currentSlot, copyLabel);

        // Draw cut line between slots if another compact receipt follows on this page
        const willHaveNextOnPage =
          currentSlot < 2 &&
          i + 1 < receipts.length &&
          (receipts[i + 1]?.receiptSnapshot?.allocations || []).length <= 6;

        if (willHaveNextOnPage) {
          const cutY = [282, 556][currentSlot];
          this.drawCutLine(doc, cutY, 28, 539);
        }

        currentSlot++;
        if (currentSlot >= 3) {
          pageOpen = false;
          currentSlot = 0;
        }
      }

      // Handle edge case of empty list
      if (!pageOpen && receipts.length === 0) {
        doc.addPage();
      }

      doc.end();
    });
  }

  /**
   * Draws a single compact receipt inside one of the three vertical slots on an A4 page.
   * Slot height: 258 pt. Slots top at: y = 16, 290, 564.
   */
  private drawCompactReceiptSlot(
    doc: any,
    receipt: any,
    slotIndex: number,
    copyLabel?: string,
  ): void {
    const top = [16, 290, 564][slotIndex];
    const left = 28;
    const width = 539;
    const slotHeight = 258;

    // Card outer border
    doc
      .roundedRect(left, top, width, slotHeight - 4, 4)
      .lineWidth(0.5)
      .strokeColor('#CBD5E1')
      .stroke();

    const snapshot = receipt?.receiptSnapshot || {};
    const schoolName =
      snapshot.school?.name || receipt?.school?.name || 'School Fee Receipt';
    const addressParts = [
      snapshot.school?.address,
      snapshot.school?.city,
      snapshot.school?.state,
    ].filter(Boolean);
    const schoolSubtitle =
      addressParts.length > 0
        ? addressParts.join(', ')
        : 'Official Fee Payment Receipt';
    const receiptNumber = snapshot.receiptNumber || receipt?.receiptNumber || 'N/A';
    const status = (receipt?.status || snapshot.status || 'ACTIVE').toUpperCase();
    const statusColor = status === 'CANCELLED' ? '#E11D48' : '#059669';

    // Header: School Name & Receipt Number
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor('#0F172A')
      .text(schoolName, left + 8, top + 7, { width: 330, ellipsis: true });
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#64748B')
      .text(schoolSubtitle, left + 8, top + 20, { width: 330, ellipsis: true });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0F172A')
      .text(receiptNumber, left + 340, top + 7, { width: 191, align: 'right' });

    const statusText = copyLabel
      ? `STATUS: ${status} • ${copyLabel}`
      : `STATUS: ${status}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(statusColor)
      .text(statusText, left + 340, top + 19, { width: 191, align: 'right' });

    // Metadata panel
    const yMeta = top + 32;
    doc.rect(left + 8, yMeta, width - 16, 32).fillColor('#F8FAFC').fill();
    doc
      .rect(left + 8, yMeta, width - 16, 32)
      .lineWidth(0.5)
      .strokeColor('#E2E8F0')
      .stroke();

    const studentName =
      snapshot.student?.fullName ||
      [snapshot.student?.firstName, snapshot.student?.lastName]
        .filter(Boolean)
        .join(' ') ||
      'N/A';
    const admissionNumber = snapshot.student?.admissionNumber || 'N/A';
    const gradeSection =
      [snapshot.student?.grade, snapshot.student?.section]
        .filter(Boolean)
        .join(' - ') || 'N/A';
    const sessionName = snapshot.academicYear?.name || 'N/A';
    const paymentDate = this.formatDate(snapshot.paymentDate || receipt?.issuedDate);
    const paymentMethod = snapshot.paymentMethod || 'CASH';
    const refNo = snapshot.referenceNumber || snapshot.chequeNumber || '';
    const modeText = refNo ? `${paymentMethod} (Ref: ${refNo})` : paymentMethod;

    // Col 1: Student info
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#334155')
      .text('Student: ', left + 14, yMeta + 5, { continued: true })
      .font('Helvetica')
      .text(studentName, { width: 165, ellipsis: true });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#64748B')
      .text('Adm No: ', left + 14, yMeta + 18, { continued: true })
      .font('Helvetica')
      .text(admissionNumber, { width: 165, ellipsis: true });

    // Col 2: Class & Session
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#334155')
      .text('Class: ', left + 185, yMeta + 5, { continued: true })
      .font('Helvetica')
      .text(gradeSection, { width: 165, ellipsis: true });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#64748B')
      .text('Session: ', left + 185, yMeta + 18, { continued: true })
      .font('Helvetica')
      .text(sessionName, { width: 165, ellipsis: true });

    // Col 3: Payment details
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#334155')
      .text('Date: ', left + 355, yMeta + 5, { continued: true })
      .font('Helvetica')
      .text(paymentDate, { width: 170, ellipsis: true });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#64748B')
      .text('Mode: ', left + 355, yMeta + 18, { continued: true })
      .font('Helvetica')
      .text(modeText, { width: 170, ellipsis: true });

    // Fee Line Items Table Header
    const yTable = top + 68;
    const currency = snapshot.school?.currency || 'INR';
    doc.rect(left + 8, yTable, width - 16, 13).fillColor('#F1F5F9').fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#475569')
      .text('FEE HEAD / DESCRIPTION', left + 14, yTable + 3, { width: 250 })
      .text('TYPE / PERIOD', left + 270, yTable + 3, { width: 100 })
      .text(`AMOUNT (${currency})`, left + 380, yTable + 3, {
        width: 155,
        align: 'right',
      });

    const allocations = Array.isArray(snapshot.allocations)
      ? snapshot.allocations
      : [];
    let yRow = yTable + 15;
    for (const alloc of allocations) {
      const head =
        alloc.feeHeadNameSnapshot || alloc.allocationType || 'Fee Obligation';
      const typePeriod = alloc.period || alloc.allocationType || 'REGULAR';
      const amtFormatted = this.formatMoney(alloc.allocatedAmount, currency);

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#1E293B')
        .text(head, left + 14, yRow, { width: 250, ellipsis: true });
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#64748B')
        .text(typePeriod, left + 270, yRow, { width: 100, ellipsis: true });
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#0F172A')
        .text(amtFormatted, left + 380, yRow, { width: 155, align: 'right' });
      yRow += 13;
    }

    // Total Amount Received Bar
    const amountNum =
      typeof snapshot.amount === 'number' && Number.isFinite(snapshot.amount)
        ? snapshot.amount
        : Number(receipt?.totalAmount ?? 0);
    const formattedTotal = this.formatMoney(amountNum, currency);

    const yTotal = top + 194;
    doc.rect(left + 8, yTotal, width - 16, 18).fillColor('#ECFDF5').fill();
    doc
      .rect(left + 8, yTotal, width - 16, 18)
      .lineWidth(0.5)
      .strokeColor('#A7F3D0')
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#065F46')
      .text('TOTAL AMOUNT RECEIVED', left + 14, yTotal + 5);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#065F46')
      .text(formattedTotal, left + 380, yTotal + 4, {
        width: 155,
        align: 'right',
      });

    // Footer: Cashier & Signatory
    const yFoot = top + 218;
    const collectorName = snapshot.collector?.name || 'Cashier';
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#64748B')
      .text(`Collected By: ${collectorName}`, left + 14, yFoot);
    doc
      .font('Helvetica-Oblique')
      .fontSize(6)
      .fillColor('#94A3B8')
      .text(
        'Electronically generated fee receipt. Valid without physical signature.',
        left + 14,
        yFoot + 10,
      );
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#64748B')
      .text(
        'Authorized Signatory: ________________________',
        left + 300,
        yFoot + 8,
        { width: 235, align: 'right' },
      );
  }

  /**
   * Draws a safe full-page fallback receipt when line items exceed compact slot capacity.
   * Eliminates any chance of financial data truncation.
   */
  private drawFullPageReceipt(doc: any, receipt: any, copyLabel?: string): void {
    doc.addPage();
    const left = 36;
    const top = 36;
    const width = 523;

    const snapshot = receipt?.receiptSnapshot || {};
    const schoolName =
      snapshot.school?.name || receipt?.school?.name || 'School Fee Receipt';
    const addressParts = [
      snapshot.school?.address,
      snapshot.school?.city,
      snapshot.school?.state,
    ].filter(Boolean);
    const schoolSubtitle =
      addressParts.length > 0
        ? addressParts.join(', ')
        : 'Official Fee Payment Receipt';
    const receiptNumber = snapshot.receiptNumber || receipt?.receiptNumber || 'N/A';
    const status = (receipt?.status || snapshot.status || 'ACTIVE').toUpperCase();
    const currency = snapshot.school?.currency || 'INR';

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#0F172A')
      .text(schoolName, left, top, { align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#64748B')
      .text(schoolSubtitle, left, top + 18, { align: 'center' });

    const yMeta = top + 38;
    doc.rect(left, yMeta, width, 44).fillColor('#F8FAFC').fill();
    doc
      .rect(left, yMeta, width, 44)
      .lineWidth(0.5)
      .strokeColor('#E2E8F0')
      .stroke();

    const studentName =
      snapshot.student?.fullName ||
      [snapshot.student?.firstName, snapshot.student?.lastName]
        .filter(Boolean)
        .join(' ') ||
      'N/A';
    const admissionNumber = snapshot.student?.admissionNumber || 'N/A';
    const gradeSection =
      [snapshot.student?.grade, snapshot.student?.section]
        .filter(Boolean)
        .join(' - ') || 'N/A';
    const sessionName = snapshot.academicYear?.name || 'N/A';
    const paymentDate = this.formatDate(snapshot.paymentDate || receipt?.issuedDate);
    const paymentMethod = snapshot.paymentMethod || 'CASH';

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#334155')
      .text(`Receipt #: ${receiptNumber}${copyLabel ? ' (' + copyLabel + ')' : ''}`, left + 10, yMeta + 8);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#334155')
      .text(`Student: ${studentName}`, left + 10, yMeta + 24);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(`Adm No: ${admissionNumber}`, left + 200, yMeta + 8);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(`Class: ${gradeSection}`, left + 200, yMeta + 24);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(`Date: ${paymentDate}`, left + 360, yMeta + 8);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(`Method: ${paymentMethod} (Status: ${status})`, left + 360, yMeta + 24);

    let yTable = yMeta + 54;
    doc.rect(left, yTable, width, 16).fillColor('#F1F5F9').fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#475569')
      .text('FEE HEAD / DESCRIPTION', left + 10, yTable + 4, { width: 260 })
      .text('TYPE / PERIOD', left + 280, yTable + 4, { width: 100 })
      .text(`AMOUNT (${currency})`, left + 390, yTable + 4, {
        width: 125,
        align: 'right',
      });

    const allocations = Array.isArray(snapshot.allocations)
      ? snapshot.allocations
      : [];
    let yRow = yTable + 20;

    for (const alloc of allocations) {
      if (yRow > 760) {
        doc.addPage();
        yRow = 40;
        doc.rect(left, yRow, width, 16).fillColor('#F1F5F9').fill();
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#475569')
          .text('FEE HEAD / DESCRIPTION', left + 10, yRow + 4, { width: 260 })
          .text('TYPE / PERIOD', left + 280, yRow + 4, { width: 100 })
          .text(`AMOUNT (${currency})`, left + 390, yRow + 4, {
            width: 125,
            align: 'right',
          });
        yRow += 20;
      }

      const head =
        alloc.feeHeadNameSnapshot || alloc.allocationType || 'Fee Obligation';
      const typePeriod = alloc.period || alloc.allocationType || 'REGULAR';
      const amt = this.formatMoney(alloc.allocatedAmount, currency);

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#1E293B')
        .text(head, left + 10, yRow, { width: 260, ellipsis: true });
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#64748B')
        .text(typePeriod, left + 280, yRow, { width: 100, ellipsis: true });
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#0F172A')
        .text(amt, left + 390, yRow, { width: 125, align: 'right' });
      yRow += 16;
    }

    const amountNum =
      typeof snapshot.amount === 'number' && Number.isFinite(snapshot.amount)
        ? snapshot.amount
        : Number(receipt?.totalAmount ?? 0);
    const formattedTotal = this.formatMoney(amountNum, currency);

    yRow += 8;
    doc.rect(left, yRow, width, 22).fillColor('#ECFDF5').fill();
    doc
      .rect(left, yRow, width, 22)
      .lineWidth(0.5)
      .strokeColor('#A7F3D0')
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#065F46')
      .text('TOTAL AMOUNT RECEIVED', left + 10, yRow + 6);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#065F46')
      .text(formattedTotal, left + 390, yRow + 5, {
        width: 125,
        align: 'right',
      });

    yRow += 32;
    const collectorName = snapshot.collector?.name || 'Cashier';
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(`Collected By: ${collectorName}`, left + 10, yRow);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748B')
      .text(
        'Authorized Signatory: ________________________',
        left + 280,
        yRow,
        { width: 235, align: 'right' },
      );
  }

  /**
   * Draws a subtle cut line with scissor glyph between receipt slots on the same page.
   */
  private drawCutLine(
    doc: any,
    y: number,
    left: number,
    width: number,
  ): void {
    doc.save();
    doc.strokeColor('#94A3B8').dash(3, { space: 3 }).lineWidth(0.5);
    doc.moveTo(left, y).lineTo(left + 195, y).stroke();
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#94A3B8')
      .text('✂ - - [ Cut Here ] - - ✂', left + 195, y - 3, {
        width: 149,
        align: 'center',
      });
    doc.moveTo(left + 344, y).lineTo(left + width, y).stroke();
    doc.restore();
  }

  private formatDate(d: any): string {
    if (!d) return 'N/A';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(d);
    }
  }

  private formatMoney(amount: any, currency = 'INR'): string {
    const num =
      typeof amount === 'number' && Number.isFinite(amount)
        ? amount
        : Number(amount ?? 0);
    return `${currency} ${Number.isFinite(num) ? num.toFixed(2) : '0.00'}`;
  }
}
