import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DocxValidatorService } from './docx-validator.service';
import { createInMemoryZip, createValidDocxBuffer } from './test-helpers';

describe('DocxValidatorService', () => {
  let service: DocxValidatorService;

  beforeEach(() => {
    service = new DocxValidatorService();
  });

  it('validates a well-formed DOCX template with required placeholders and table loops', () => {
    const validBuf = createValidDocxBuffer();
    const result = service.validateDocx(validBuf, 'standard_receipt.docx');

    expect(result.isValid).toBe(true);
    expect(result.placeholdersDetected).toContain('receipt.number');
    expect(result.placeholdersDetected).toContain('payment.amount');
    expect(result.placeholdersDetected).toContain('#allocations');
    expect(result.placeholdersDetected).toContain('/allocations');
    expect(result.diagnostics.hasRepeatingAllocations).toBe(true);
    expect(result.diagnostics.errors).toHaveLength(0);
  });

  it('rejects an empty buffer', () => {
    expect(() => service.validateDocx(Buffer.alloc(0), 'receipt.docx')).toThrow(
      BadRequestException,
    );
  });

  it('rejects files larger than 5MB', () => {
    const oversizedBuf = Buffer.alloc(5 * 1024 * 1024 + 1);
    expect(() => service.validateDocx(oversizedBuf, 'receipt.docx')).toThrow(
      /File size exceeds 5MB limit/,
    );
  });

  it('rejects non-.docx file extensions', () => {
    const validBuf = createValidDocxBuffer();
    expect(() => service.validateDocx(validBuf, 'receipt.pdf')).toThrow(
      /Only \.docx Microsoft Word templates are accepted/,
    );
    expect(() => service.validateDocx(validBuf, 'receipt.txt')).toThrow(
      /Only \.docx Microsoft Word templates are accepted/,
    );
  });

  it('rejects macro-enabled .docm files', () => {
    const validBuf = createValidDocxBuffer();
    expect(() => service.validateDocx(validBuf, 'malicious.docm')).toThrow(
      /Macro-enabled documents \(\.docm\) are strictly prohibited/,
    );
  });

  it('rejects files missing standard PK ZIP header', () => {
    const fakeBuf = Buffer.from('NOT A REAL ZIP FILE CONTENT HERE');
    expect(() => service.validateDocx(fakeBuf, 'receipt.docx')).toThrow(
      /Missing standard ZIP file header/,
    );
  });

  it('rejects templates containing embedded VBA macros or executables', () => {
    const macroZip = createInMemoryZip([
      { filename: '[Content_Types].xml', content: '<Types></Types>' },
      { filename: 'word/document.xml', content: '<w:document></w:document>' },
      { filename: 'word/vbaProject.bin', content: 'MALICIOUS_VBA_PAYLOAD' },
    ]);

    expect(() => service.validateDocx(macroZip, 'receipt.docx')).toThrow(
      /Template contains forbidden embedded code or macro: word\/vbaProject\.bin/,
    );
  });

  it('rejects templates containing external SSRF network relationships', () => {
    const externalRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://attacker.com/leak-data" TargetMode="External"/>
</Relationships>`;

    const ssrfZip = createInMemoryZip([
      { filename: '[Content_Types].xml', content: '<Types></Types>' },
      { filename: 'word/document.xml', content: '<w:document></w:document>' },
      { filename: 'word/_rels/document.xml.rels', content: externalRelsXml },
    ]);

    expect(() => service.validateDocx(ssrfZip, 'receipt.docx')).toThrow(
      /External network reference detected in template relationships/,
    );
  });

  it('detects unknown placeholders and flags validation errors', () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Receipt: {receipt.number}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: {payment.amount}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Unknown: {father.occupation} and {student.bloodGroup}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#allocations}{index}{feeHead}{amount}{/allocations}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const zip = createInMemoryZip([
      { filename: '[Content_Types].xml', content: '<Types></Types>' },
      { filename: 'word/document.xml', content: invalidXml },
    ]);

    const result = service.validateDocx(zip, 'receipt.docx');
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.unsupportedPlaceholders).toContain('{father.occupation}');
    expect(result.diagnostics.unsupportedPlaceholders).toContain('{student.bloodGroup}');
    expect(result.diagnostics.errors.some((e) => e.includes('Unsupported placeholders detected'))).toBe(true);
  });

  it('detects missing mandatory placeholders and repeating allocation loops', () => {
    const missingXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>School: {school.name}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const zip = createInMemoryZip([
      { filename: '[Content_Types].xml', content: '<Types></Types>' },
      { filename: 'word/document.xml', content: missingXml },
    ]);

    const result = service.validateDocx(zip, 'receipt.docx');
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.hasRepeatingAllocations).toBe(false);
    expect(result.diagnostics.missingRequiredPlaceholders).toContain('{receipt.number}');
    expect(result.diagnostics.missingRequiredPlaceholders).toContain('{payment.amount}');
  });

  it('accepts aliased placeholders like {{#feeItems}}, {{payment.totalAmount}}, and {{receipt.issueDate}}', () => {
    const aliasXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Receipt: {{receipt.number}} on {{receipt.issueDate}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: {{payment.totalAmount}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{#feeItems}}{{item.feeHead}} - {{item.amount}}{{/feeItems}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const zip = createInMemoryZip([
      { filename: '[Content_Types].xml', content: '<Types></Types>' },
      { filename: 'word/document.xml', content: aliasXml },
    ]);

    const result = service.validateDocx(zip, 'receipt.docx');
    expect(result.isValid).toBe(true);
    expect(result.diagnostics.errors).toHaveLength(0);
    expect(result.placeholdersDetected).toContain('receipt.number');
    expect(result.placeholdersDetected).toContain('receipt.issueDate');
    expect(result.placeholdersDetected).toContain('payment.totalAmount');
    expect(result.placeholdersDetected).toContain('#feeItems');
    expect(result.placeholdersDetected).toContain('/feeItems');
  });

  it('rejects encrypted template archives', () => {
    const zip = createValidDocxBuffer();
    // Set encryption bit (bit 0 of flags) in Central Directory header
    // Find CD header: 0x02014b50
    for (let i = 0; i < zip.length - 4; i++) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) {
        // Flags at offset 8
        zip[i + 8] = zip[i + 8] | 0x01;
        break;
      }
    }

    expect(() => service.validateDocx(zip, 'encrypted.docx')).toThrow(
      /Security violation: Encrypted template archives are strictly prohibited/,
    );
  });

  it('validates the full OpenXML representative-receipt-template.docx fixture on disk', () => {
    const fixturePath = path.join(
      __dirname,
      'fixtures',
      'representative-receipt-template.docx',
    );
    const fixtureBuffer = fs.readFileSync(fixturePath);

    const result = service.validateDocx(
      fixtureBuffer,
      'representative-receipt-template.docx',
    );

    expect(result.isValid).toBe(true);
    expect(result.diagnostics.errors).toHaveLength(0);
    expect(result.diagnostics.warnings).toHaveLength(0);
    expect(result.diagnostics.hasRepeatingAllocations).toBe(true);
    expect(result.placeholdersDetected).toEqual(
      expect.arrayContaining([
        'school.name',
        'school.code',
        'receipt.number',
        'receipt.issueDate',
        'student.fullName',
        'student.admissionNumber',
        'payment.amount',
        'payment.totalAmount',
        'payment.amountInWords',
        'totalPrincipal',
        'totalFines',
        'totalAllocated',
        '#allocations',
        '/allocations',
        'collector.name',
        'watermark',
      ]),
    );
  });
});
