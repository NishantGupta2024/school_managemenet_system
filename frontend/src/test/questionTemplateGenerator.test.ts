import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  generateQuestionTemplateWorkbook,
  generateQuestionTemplateWorkbookBuffer,
  downloadQuestionTemplate,
} from '../utils/questionTemplateGenerator';

describe('questionTemplateGenerator Utility', () => {
  it('generates a valid .xlsx workbook binary matching backend parsing requirements', async () => {
    const uint8 = await generateQuestionTemplateWorkbookBuffer();
    expect(uint8).toBeDefined();
    expect(uint8.length).toBeGreaterThan(0);

    // Parse the generated workbook with ExcelJS to verify exact structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(uint8 as any);

    // 1. Verify worksheets count and names
    expect(workbook.worksheets.length).toBe(2);
    expect(workbook.worksheets[0].name).toBe('MCQ Questions');
    expect(workbook.worksheets[1].name).toBe('Instructions');

    // 2. Verify Worksheet 1 is at index 0 (critical: backend inspects workbook.worksheets[0])
    const mcqSheet = workbook.worksheets[0];
    const headerRow = mcqSheet.getRow(1);

    const expectedHeaders = [
      'Serial Number',
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct Option',
      'Marks',
    ];

    expectedHeaders.forEach((expectedHeader, idx) => {
      const cellValue = headerRow.getCell(idx + 1).value;
      expect(cellValue).toBe(expectedHeader);
    });

    // 3. Verify Worksheet 2 contains Instructions and Reference Examples
    const instrSheet = workbook.worksheets[1];
    expect(instrSheet.rowCount).toBeGreaterThan(5);

    // Verify presence of instructions regarding exact headers and .xlsx format
    let foundHeadersRule = false;
    let foundExamplesHeader = false;

    instrSheet.eachRow((row) => {
      const text = row.values ? JSON.stringify(row.values) : '';
      if (text.includes('Serial Number') && text.includes('Option A')) {
        foundHeadersRule = true;
      }
      if (text.includes('REFERENCE EXAMPLES')) {
        foundExamplesHeader = true;
      }
    });

    expect(foundHeadersRule).toBe(true);
    expect(foundExamplesHeader).toBe(true);
  });

  it('generates a Blob with the official .xlsx MIME type', async () => {
    const blob = await generateQuestionTemplateWorkbook();
    expect(blob).toBeDefined();
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('triggers browser file download with object URL and revokes it cleanly', async () => {
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadQuestionTemplate('Examination_MCQs_Template.xlsx');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();

    // Fast-forward or verify revocation
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-uuid');

    clickSpy.mockRestore();
  });
});
