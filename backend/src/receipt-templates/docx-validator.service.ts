import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import { PlaceholderValidationDiagnostics } from './dto/template-validation-result.dto';

export interface DocxZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  data: Buffer;
}

export const SUPPORTED_PLACEHOLDERS = new Set<string>([
  // School
  'school.name',
  'school.code',
  'school.address',
  'school.city',
  'school.state',
  'school.currency',

  // Student
  'student.admissionNumber',
  'student.fullName',
  'student.name', // alias for student.fullName
  'student.firstName',
  'student.lastName',
  'student.grade',
  'student.section',

  // Receipt & Payment Master
  'receipt.number',
  'receipt.sequence',
  'receipt.issuedDate',
  'receipt.issueDate', // alias for receipt.issuedDate
  'receipt.issuedTime',
  'receipt.academicYear',
  'payment.number',
  'payment.date',
  'payment.method',
  'payment.amount',
  'payment.totalAmount', // alias for payment.amount
  'payment.amountInWords',
  'payment.referenceNumber',
  'payment.bankName',
  'payment.chequeNumber',
  'payment.chequeDate',
  'payment.chequeDisclaimer',
  'payment.notes',
  'academicYear.name',
  'collector.name',
  'collector.role',

  // Totals & Computed
  'totalAmount',
  'totalAmountInWords',
  'totalPrincipal',
  'totalFines',
  'totalAllocated',

  // Allocation & Fee Head Loop tags
  '#allocations',
  '/allocations',
  '#feeItems', // alias for #allocations
  '/feeItems', // alias for /allocations
  'index',
  'feeHead',
  'item.feeHead', // alias for feeHead
  'type',
  'amount',
  'item.amount', // alias for amount
  'period',
  'item.period', // alias for period
  'watermark',
]);

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ZIP_ENTRIES = 250;
const MAX_TOTAL_UNCOMPRESSED_SIZE = 25 * 1024 * 1024; // 25 MB cumulative safety threshold
const MAX_SINGLE_ENTRY_SIZE = 10 * 1024 * 1024; // 10 MB per entry
const MAX_COMPRESSION_RATIO = 100; // Uncompressed to compressed safety ratio

@Injectable()
export class DocxValidatorService {
  private readonly logger = new Logger(DocxValidatorService.name);

  /**
   * Validates a buffer as a legitimate, safe, macro-free DOCX package,
   * extracts placeholders, and performs linting.
   */
  public validateDocx(buffer: Buffer, originalFilename: string): {
    isValid: boolean;
    placeholdersDetected: string[];
    diagnostics: PlaceholderValidationDiagnostics;
  } {
    // 1. Size bounds check
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new BadRequestException(`File size exceeds 5MB limit (received ${(buffer.length / (1024 * 1024)).toFixed(2)}MB)`);
    }

    // 2. Extension check
    const cleanFilename = (originalFilename || '').toLowerCase().trim();
    if (cleanFilename.endsWith('.docm')) {
      throw new BadRequestException('Security violation: Macro-enabled documents (.docm) are strictly prohibited');
    }
    if (!cleanFilename.endsWith('.docx')) {
      throw new BadRequestException('Invalid file type: Only .docx Microsoft Word templates are accepted');
    }

    // 3. PK ZIP magic bytes check (0x04034b50)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new BadRequestException('Malformed DOCX package: Missing standard ZIP file header');
    }

    // 4. Parse ZIP structure safely with hardened ZIP-bomb and memory safeguards
    const entries = this.parseZipEntries(buffer);

    // 5. Macro and security inspection
    this.inspectPackageSecurity(entries);

    // 6. Extract XML contents
    const xmlContents = this.extractDocumentXmlContents(entries);
    if (!xmlContents || xmlContents.trim().length === 0) {
      throw new BadRequestException('Invalid DOCX template: Main document body (word/document.xml) is missing or empty');
    }

    // 7. Extract placeholders and lint against canonical catalogue
    const { detected, diagnostics } = this.lintPlaceholders(xmlContents);

    const isValid = diagnostics.errors.length === 0;

    return {
      isValid,
      placeholdersDetected: detected,
      diagnostics,
    };
  }

  /**
   * Parses ZIP container safely using End of Central Directory and Central Directory records
   * with cumulative bounds, per-entry limits, and zlib maxOutputLength enforcement.
   */
  public parseZipEntries(buffer: Buffer): DocxZipEntry[] {
    const entries: DocxZipEntry[] = [];
    let totalUncompressed = 0;

    // Find EOCD signature: 0x06054b50
    let eocdOffset = -1;
    const maxScan = Math.min(buffer.length, 65557);
    for (let i = buffer.length - 22; i >= buffer.length - maxScan; i--) {
      if (
        buffer[i] === 0x50 &&
        buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x05 &&
        buffer[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new BadRequestException('Malformed DOCX archive: End of Central Directory signature not found');
    }

    const totalEntriesCount = buffer.readUInt16LE(eocdOffset + 10);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (totalEntriesCount > MAX_ZIP_ENTRIES) {
      throw new BadRequestException(`ZIP safety violation: Archive contains ${totalEntriesCount} entries (max allowed: ${MAX_ZIP_ENTRIES})`);
    }

    if (cdOffset >= buffer.length) {
      throw new BadRequestException('Malformed DOCX archive: Central directory offset is out of file bounds');
    }

    let cursor = cdOffset;
    for (let i = 0; i < totalEntriesCount; i++) {
      if (cursor + 46 > buffer.length) {
        throw new BadRequestException('Malformed DOCX archive: Truncated central directory record');
      }
      const sig = buffer.readUInt32LE(cursor);
      if (sig !== 0x02014b50) {
        throw new BadRequestException('Malformed DOCX archive: Invalid central directory header signature');
      }

      const flags = buffer.readUInt16LE(cursor + 8);
      // Bit 0 indicates encryption
      if ((flags & 0x01) !== 0) {
        throw new BadRequestException('Security violation: Encrypted template archives are strictly prohibited');
      }

      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const fnLen = buffer.readUInt16LE(cursor + 28);
      const extraLen = buffer.readUInt16LE(cursor + 30);
      const commentLen = buffer.readUInt16LE(cursor + 32);
      const localOffset = buffer.readUInt32LE(cursor + 42);

      if (cursor + 46 + fnLen > buffer.length) {
        throw new BadRequestException('Malformed DOCX archive: Filename in central directory exceeds buffer');
      }

      const filename = buffer.toString('utf8', cursor + 46, cursor + 46 + fnLen);
      cursor += 46 + fnLen + extraLen + commentLen;

      // Path traversal check in ZIP filenames
      if (filename.includes('..') || filename.startsWith('/') || filename.startsWith('\\')) {
        throw new BadRequestException(`Security violation: Dangerous path in template archive: ${filename}`);
      }

      // Check per-entry uncompressed size limit
      if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE) {
        throw new BadRequestException(`ZIP bomb detected: Uncompressed size for ${filename} exceeds 10MB entry limit`);
      }

      // Check compression ratio
      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        throw new BadRequestException(`Security violation: Suspicious compression ratio for entry ${filename}`);
      }

      // Read and validate local file header
      if (localOffset + 30 > buffer.length) {
        throw new BadRequestException(`Malformed ZIP entry header for ${filename}`);
      }

      const localSig = buffer.readUInt32LE(localOffset);
      if (localSig !== 0x04034b50) {
        throw new BadRequestException(`Malformed ZIP: Local file header signature mismatch for ${filename}`);
      }

      const localFnLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localFnLen + localExtraLen;

      if (dataStart + compressedSize > buffer.length) {
        throw new BadRequestException(`Truncated data for entry ${filename}`);
      }

      const rawData = buffer.subarray(dataStart, dataStart + compressedSize);
      let decompressed: Buffer;

      const remainingBudget = MAX_TOTAL_UNCOMPRESSED_SIZE - totalUncompressed;
      if (remainingBudget <= 0) {
        throw new BadRequestException('ZIP bomb detected: Cumulative uncompressed size exceeds 25MB threshold');
      }

      const maxEntryBudget = Math.min(MAX_SINGLE_ENTRY_SIZE, remainingBudget);

      try {
        if (method === 0) {
          // Stored (no compression)
          if (rawData.length > maxEntryBudget) {
            throw new BadRequestException('ZIP entry exceeds maximum safe size threshold');
          }
          decompressed = rawData;
        } else if (method === 8) {
          // Deflated — enforce hard maxOutputLength limit at zlib C-level
          decompressed = zlib.inflateRawSync(rawData, {
            maxOutputLength: maxEntryBudget,
          });
        } else {
          throw new BadRequestException(`Unsupported compression method ${method} in template archive`);
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(`Failed decompressing ${filename}: ${err.message}`);
      }

      totalUncompressed += decompressed.length;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_SIZE) {
        throw new BadRequestException('ZIP bomb detected: Cumulative uncompressed size exceeds 25MB safety threshold');
      }

      entries.push({
        filename,
        compressedSize,
        uncompressedSize: decompressed.length,
        data: decompressed,
      });
    }

    return entries;
  }

  /**
   * Inspects entries for VBA macros, suspicious executables, and external SSRF relationships.
   */
  private inspectPackageSecurity(entries: DocxZipEntry[]): void {
    for (const entry of entries) {
      const lower = entry.filename.toLowerCase();

      // Macro / VBA detection
      if (
        lower.includes('vba') ||
        lower.endsWith('.bin') ||
        lower.includes('vbaproject') ||
        lower.endsWith('.exe') ||
        lower.endsWith('.bat') ||
        lower.endsWith('.cmd')
      ) {
        throw new BadRequestException(`Security violation: Template contains forbidden embedded code or macro: ${entry.filename}`);
      }

      // External relationship inspection (SSRF / XXE prevention)
      if (lower.endsWith('.rels')) {
        const relsText = entry.data.toString('utf8');
        const relTagMatches = relsText.match(/<Relationship\b[^>]*\/?>/gi) || [];
        for (const tag of relTagMatches) {
          const isExternal = /TargetMode\s*=\s*["']External["']/i.test(tag);
          const targetMatch = tag.match(/Target\s*=\s*["']([^"']+)["']/i);
          if (isExternal && targetMatch) {
            const target = targetMatch[1];
            if (/^(https?|ftp|file):/i.test(target)) {
              throw new BadRequestException(
                `Security violation: External network reference detected in template relationships (${target})`,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Extracts text from word/document.xml, word/header*.xml, word/footer*.xml.
   */
  private extractDocumentXmlContents(entries: DocxZipEntry[]): string {
    const xmlParts: string[] = [];
    for (const entry of entries) {
      const lower = entry.filename.toLowerCase();
      if (
        lower === 'word/document.xml' ||
        lower.startsWith('word/header') ||
        lower.startsWith('word/footer')
      ) {
        xmlParts.push(entry.data.toString('utf8'));
      }
    }
    return xmlParts.join('\n');
  }

  /**
   * Lints XML content for placeholders, table loops, and unsupported tags.
   */
  private lintPlaceholders(xmlContent: string): {
    detected: string[];
    diagnostics: PlaceholderValidationDiagnostics;
  } {
    // Strip XML tags to get pure plain text with brackets preserved
    const plainText = xmlContent.replace(/<[^>]+>/g, '');

    // Extract all tags enclosed in { } or {{ }}
    const tagRegex = /\{+([#\/]?[a-zA-Z0-9_\.]+)\}+/g;
    const detectedSet = new Set<string>();
    const unsupportedList: string[] = [];
    const missingList: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(plainText)) !== null) {
      const tag = match[1].trim();
      detectedSet.add(tag);

      // Check if tag is in supported catalogue (including aliases)
      if (!SUPPORTED_PLACEHOLDERS.has(tag)) {
        unsupportedList.push(`{${tag}}`);
      }
    }

    const detected = Array.from(detectedSet);

    // Verify presence of repeating allocation / feeItems rows
    const hasAllocationsLoop = detectedSet.has('#allocations') && detectedSet.has('/allocations');
    const hasFeeItemsLoop = detectedSet.has('#feeItems') && detectedSet.has('/feeItems');
    const hasRepeatingAllocations = hasAllocationsLoop || hasFeeItemsLoop;

    if (!hasRepeatingAllocations) {
      errors.push(
        'Missing repeating allocation rows: Template must include a table row with {#allocations}..{/allocations} or {#feeItems}..{/feeItems} to itemize fee heads.',
      );
    }

    // Check mandatory placeholders
    // 1. receipt.number
    if (!detectedSet.has('receipt.number')) {
      missingList.push('{receipt.number}');
      errors.push('Missing mandatory placeholder: {receipt.number} is required for audit and legal compliance.');
    }

    // 2. payment.amount OR payment.totalAmount
    if (!detectedSet.has('payment.amount') && !detectedSet.has('payment.totalAmount')) {
      missingList.push('{payment.amount}');
      errors.push('Missing mandatory placeholder: {payment.amount} or {payment.totalAmount} is required.');
    }

    // Report unsupported placeholders
    if (unsupportedList.length > 0) {
      errors.push(
        `Unsupported placeholders detected: ${unsupportedList.join(', ')}. Only fields authoritatively present in the receipt snapshot are permitted.`,
      );
    }

    // Check for common recommended fields
    if (
      !detectedSet.has('student.admissionNumber') &&
      !detectedSet.has('student.fullName') &&
      !detectedSet.has('student.name')
    ) {
      warnings.push('Recommended student identification ({student.admissionNumber} or {student.fullName}) was not detected.');
    }
    if (!detectedSet.has('school.name')) {
      warnings.push('School name placeholder ({school.name}) was not detected.');
    }

    return {
      detected,
      diagnostics: {
        unsupportedPlaceholders: unsupportedList,
        missingRequiredPlaceholders: missingList,
        hasRepeatingAllocations,
        warnings,
        errors,
      },
    };
  }
}
