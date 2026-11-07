import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { ReceiptSnapshot } from './fixtures/synthetic-receipt.fixture';

export type ReceiptPopulationMode = 'PREVIEW' | 'OFFICIAL';

export interface PopulateTemplateOptions {
  isPreview?: boolean;
  mode?: ReceiptPopulationMode;
}

export const SAMPLE_PREVIEW_WATERMARK = 'SAMPLE PREVIEW — NOT AN OFFICIAL RECEIPT';

const ONES_WORDS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS_WORDS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

@Injectable()
export class DocxPopulationService {
  private readonly logger = new Logger(DocxPopulationService.name);

  /**
   * Populates a raw template DOCX buffer with verified snapshot data.
   * Injects the sample preview disclaimer banner strictly when preview mode is enabled.
   */
  public populateTemplate(
    docxBuffer: Buffer,
    snapshot: ReceiptSnapshot,
    options: PopulateTemplateOptions = {},
  ): Buffer {
    if (!docxBuffer || docxBuffer.length === 0) {
      throw new BadRequestException('Template DOCX buffer is empty');
    }
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException('Receipt snapshot is required');
    }

    const isPreview =
      options?.isPreview !== undefined
        ? Boolean(options.isPreview)
        : options?.mode === 'PREVIEW';

    try {
      // 1. Load DOCX into PizZip
      const zip = new PizZip(docxBuffer);

      // 2. Pre-process XML entries to normalize double braces and (in preview mode only) inject watermark banner
      this.preprocessXmlEntries(zip, isPreview);

      // 3. Custom parser supporting dot-notation (e.g. "receipt.number", "student.fullName") and explicit empty fallback
      const parser = (tag: string) => {
        const trimmedTag = tag.trim();
        return {
          get: (scope: any, context?: any) => {
            if (trimmedTag === '.') return scope ?? '';
            const directVal = this.resolvePathFromScope(scope, trimmedTag);
            if (directVal !== undefined && directVal !== null) {
              return directVal;
            }
            if (context?.scopeList && Array.isArray(context.scopeList)) {
              for (let i = context.scopeList.length - 1; i >= 0; i--) {
                const parentVal = this.resolvePathFromScope(context.scopeList[i], trimmedTag);
                if (parentVal !== undefined && parentVal !== null) {
                  return parentVal;
                }
              }
            }
            return '';
          },
        };
      };

      // 4. Initialize Docxtemplater with paragraph looping, linebreaks, and dot parser
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser,
        nullGetter: () => '',
      });

      // 5. Transform snapshot into template context supporting canonical & alias tokens
      const templateData = this.buildTemplateContext(snapshot, isPreview);

      // 6. Render populated values into template
      doc.render(templateData);

      // 7. Generate populated DOCX buffer
      const outputBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      return outputBuffer;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Failed populating DOCX template: ${err.message}`, err.stack);
      throw new BadRequestException(`Template rendering failed: ${err.message}`);
    }
  }

  private resolvePathFromScope(scope: any, tag: string): any {
    if (scope == null || typeof scope !== 'object') {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(scope, tag)) {
      return scope[tag];
    }
    const parts = tag.split('.');
    let curr = scope;
    for (const part of parts) {
      if (curr == null || typeof curr !== 'object') {
        return undefined;
      }
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Normalizes double-brace placeholders across document, header, and footer XML parts,
   * and injects the sample watermark banner strictly when isPreview is true.
   */
  private preprocessXmlEntries(zip: PizZip, isPreview: boolean): void {
    const fileNames = Object.keys(zip.files);
    for (const fileName of fileNames) {
      const lower = fileName.toLowerCase();
      if (
        lower === 'word/document.xml' ||
        (lower.startsWith('word/header') && lower.endsWith('.xml')) ||
        (lower.startsWith('word/footer') && lower.endsWith('.xml'))
      ) {
        const entry = zip.file(fileName);
        if (!entry) continue;

        let xml = entry.asText();

        // Normalize {{tag}} to {tag} so docxtemplater parses Handlebars-style moustache tags seamlessly
        xml = xml.replace(/\{\{([#\/]?[a-zA-Z0-9_\.]+)\}\}/g, '{$1}');

        if (isPreview && lower === 'word/document.xml') {
          const watermarkBannerXml = `
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:pBdr>
            <w:top w:val="single" w:sz="12" w:space="4" w:color="DC2626"/>
            <w:bottom w:val="single" w:sz="12" w:space="4" w:color="DC2626"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="FEE2E2"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:color w:val="DC2626"/>
            <w:sz w:val="24"/>
          </w:rPr>
          <w:t>*** ${SAMPLE_PREVIEW_WATERMARK} ***</w:t>
        </w:r>
      </w:p>
    `;

          if (/<w:body(\b[^>]*)?>/.test(xml) && !xml.includes(SAMPLE_PREVIEW_WATERMARK)) {
            xml = xml.replace(/<w:body(\b[^>]*)?>/, `<w:body$1>${watermarkBannerXml}`);
          }
        }

        zip.file(fileName, xml);
      }
    }
  }

  /**
   * Maps authoritative ReceiptSnapshot to supported placeholder catalogue keys.
   * Derives all amounts and totals strictly from the supplied snapshot data.
   */
  private buildTemplateContext(
    snapshot: ReceiptSnapshot,
    isPreview: boolean,
  ): Record<string, any> {
    const numericAmount =
      typeof snapshot.amount === 'number' && Number.isFinite(snapshot.amount)
        ? snapshot.amount
        : Number(snapshot.amount);

    if (
      snapshot.amount === null ||
      snapshot.amount === undefined ||
      !Number.isFinite(numericAmount)
    ) {
      throw new BadRequestException('Valid numeric payment amount is required in receipt snapshot');
    }

    const issuedDateStr = this.formatDate(snapshot.issuedAt);
    const issuedTimeStr = this.formatTime(snapshot.issuedAt);
    const paymentDateStr = this.formatDate(snapshot.paymentDate);
    const amountStr = numericAmount.toFixed(2);
    const currency = snapshot.school?.currency || '';
    const amountWords = this.amountToWords(numericAmount, currency || 'INR');

    const rawAllocations = Array.isArray(snapshot.allocations) ? snapshot.allocations : [];
    let principalTotal = 0;
    let finesTotal = 0;
    let allocatedTotal = 0;

    const allocationsList = rawAllocations.map((alloc, idx) => {
      const itemAmount =
        typeof alloc.allocatedAmount === 'number' && Number.isFinite(alloc.allocatedAmount)
          ? alloc.allocatedAmount
          : Number(alloc.allocatedAmount) || 0;
      const allocType = alloc.allocationType ? String(alloc.allocationType) : '';
      const normalizedType = allocType.toUpperCase();

      if (normalizedType === 'PRINCIPAL') {
        principalTotal += itemAmount;
      } else if (normalizedType === 'FINE' || normalizedType === 'LATE_FINE') {
        finesTotal += itemAmount;
      }
      allocatedTotal += itemAmount;

      const feeHead = alloc.feeHeadNameSnapshot ?? '';
      const formattedItemAmount = itemAmount.toFixed(2);
      const period = alloc.period ?? '';

      return {
        index: idx + 1,
        feeHead,
        type: allocType,
        amount: formattedItemAmount,
        period,
        item: {
          feeHead,
          amount: formattedItemAmount,
          period,
        },
      };
    });

    const studentFullName =
      snapshot.student?.fullName ??
      [snapshot.student?.firstName, snapshot.student?.lastName].filter(Boolean).join(' ');

    return {
      school: {
        id: snapshot.school?.id ?? '',
        code: snapshot.school?.code ?? '',
        name: snapshot.school?.name ?? '',
        currency,
        timezone: snapshot.school?.timezone ?? '',
        address: snapshot.school?.address ?? '',
        city: snapshot.school?.city ?? '',
        state: snapshot.school?.state ?? '',
      },
      student: {
        id: snapshot.student?.id ?? '',
        admissionNumber: snapshot.student?.admissionNumber ?? '',
        fullName: studentFullName,
        name: studentFullName, // alias
        firstName: snapshot.student?.firstName ?? '',
        lastName: snapshot.student?.lastName ?? '',
        grade: snapshot.student?.grade ?? '',
        section: snapshot.student?.section ?? '',
      },
      receipt: {
        number: snapshot.receiptNumber ?? '',
        sequence:
          snapshot.sequenceNumber !== undefined && snapshot.sequenceNumber !== null
            ? snapshot.sequenceNumber
            : '',
        issuedDate: issuedDateStr,
        issueDate: issuedDateStr, // alias
        issuedTime: issuedTimeStr,
        academicYear: snapshot.academicYear?.name ?? '',
      },
      payment: {
        number: snapshot.paymentNumber ?? '',
        date: paymentDateStr,
        method: snapshot.paymentMethod ?? '',
        amount: amountStr,
        totalAmount: amountStr, // alias
        amountInWords: amountWords,
        referenceNumber: snapshot.referenceNumber ?? '',
        bankName: snapshot.bankName ?? '',
        chequeNumber: snapshot.chequeNumber ?? '',
        chequeDate: snapshot.chequeDate ? this.formatDate(snapshot.chequeDate) : '',
        chequeDisclaimer: snapshot.chequeDisclaimer ?? '',
        notes: snapshot.notes ?? '',
      },
      academicYear: {
        id: snapshot.academicYear?.id ?? '',
        name: snapshot.academicYear?.name ?? '',
      },
      collector: {
        name: snapshot.collector?.name ?? '',
        role: snapshot.collector?.role ?? '',
      },
      totalAmount: amountStr,
      totalAmountInWords: amountWords,
      totalPrincipal: principalTotal.toFixed(2),
      totalFines: finesTotal.toFixed(2),
      totalAllocated: allocatedTotal.toFixed(2),
      allocations: allocationsList,
      feeItems: allocationsList, // alias
      watermark: isPreview ? SAMPLE_PREVIEW_WATERMARK : '',
    };
  }

  private formatDate(dateVal: Date | string | null | undefined): string {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private formatTime(dateVal: Date | string | null | undefined): string {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  /**
   * Converts a non-negative monetary amount into deterministic English words
   * derived from the actual numeric amount and currency.
   */
  public amountToWords(amount: number, currency: string = 'INR'): string {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return '';
    }

    const totalCents = Math.round(amount * 100);
    const wholePart = Math.floor(totalCents / 100);
    const fractionalPart = totalCents % 100;
    const normalizedCurrency = (currency || 'INR').trim().toUpperCase();

    const isInr = normalizedCurrency === 'INR';
    const wholeWords =
      wholePart === 0
        ? 'Zero'
        : isInr
          ? this.integerToIndianWords(wholePart)
          : this.integerToInternationalWords(wholePart);

    const mainUnit = isInr
      ? wholePart === 1
        ? 'Rupee'
        : 'Rupees'
      : normalizedCurrency;

    if (fractionalPart > 0) {
      const fractionWords = this.convertBelowHundred(fractionalPart);
      const subUnit = isInr
        ? 'Paise'
        : fractionalPart === 1
          ? 'Cent'
          : 'Cents';
      return `${wholeWords} ${mainUnit} and ${fractionWords} ${subUnit} Only`;
    }

    return `${wholeWords} ${mainUnit} Only`;
  }

  private convertBelowHundred(num: number): string {
    if (num < 20) {
      return ONES_WORDS[num];
    }
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return ones > 0 ? `${TENS_WORDS[tens]} ${ONES_WORDS[ones]}` : TENS_WORDS[tens];
  }

  private convertBelowThousand(num: number): string {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    const parts: string[] = [];
    if (hundreds > 0) {
      parts.push(`${ONES_WORDS[hundreds]} Hundred`);
    }
    if (remainder > 0) {
      parts.push(this.convertBelowHundred(remainder));
    }
    return parts.join(' ');
  }

  private integerToIndianWords(num: number): string {
    const parts: string[] = [];
    let remaining = num;

    const crores = Math.floor(remaining / 10000000);
    remaining %= 10000000;
    if (crores > 0) {
      parts.push(`${this.integerToIndianWords(crores)} Crore`);
    }

    const lakhs = Math.floor(remaining / 100000);
    remaining %= 100000;
    if (lakhs > 0) {
      parts.push(`${this.convertBelowHundred(lakhs)} Lakh`);
    }

    const thousands = Math.floor(remaining / 1000);
    remaining %= 1000;
    if (thousands > 0) {
      parts.push(`${this.convertBelowHundred(thousands)} Thousand`);
    }

    if (remaining > 0) {
      parts.push(this.convertBelowThousand(remaining));
    }

    return parts.join(' ');
  }

  private integerToInternationalWords(num: number): string {
    const scales = ['', 'Thousand', 'Million', 'Billion'];
    const parts: string[] = [];
    let remaining = num;
    let scaleIdx = 0;

    while (remaining > 0) {
      const chunk = remaining % 1000;
      if (chunk > 0) {
        const chunkWords = this.convertBelowThousand(chunk);
        const scaleLabel = scales[scaleIdx];
        parts.unshift(scaleLabel ? `${chunkWords} ${scaleLabel}` : chunkWords);
      }
      remaining = Math.floor(remaining / 1000);
      scaleIdx++;
    }

    return parts.join(' ');
  }
}
