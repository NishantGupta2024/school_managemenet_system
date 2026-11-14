import type ExcelJSNamespace from 'exceljs';

/**
 * Builds the official ExcelJS workbook instance for MCQ examination questions.
 * Dynamically loads ExcelJS on demand to keep the initial application bundle and
 * the Student Examination Runner bundle lightweight.
 * Configured with:
 *  - Worksheet 1: 'MCQ Questions' (at index 0)
 *  - Headers: 'Serial Number', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Option', 'Marks'
 *  - Worksheet 2: 'Instructions' (detailed formatting guidance and non-importable reference examples)
 */
export async function buildQuestionTemplateWorkbook(): Promise<ExcelJSNamespace.Workbook> {
  const exceljsModule = await import('exceljs');
  const ExcelJS = (exceljsModule.default || exceljsModule) as typeof ExcelJSNamespace;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School ERP Examination Module';
  workbook.lastModifiedBy = 'School ERP Examination Module';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // Worksheet 1: MCQ Questions (Index 0 — parsed by backend Excel importer)
  // =========================================================================
  const questionSheet = workbook.addWorksheet('MCQ Questions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  questionSheet.columns = [
    { header: 'Serial Number', key: 'serialNumber', width: 16 },
    { header: 'Question', key: 'question', width: 45 },
    { header: 'Option A', key: 'optionA', width: 25 },
    { header: 'Option B', key: 'optionB', width: 25 },
    { header: 'Option C', key: 'optionC', width: 25 },
    { header: 'Option D', key: 'optionD', width: 25 },
    { header: 'Correct Option', key: 'correctOption', width: 18 },
    { header: 'Marks', key: 'marks', width: 14 },
  ];

  // Header row formatting: bold, clear fill, border
  const headerRow = questionSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF312E81' }, // Deep indigo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  // Illustrative sample row at Row 2 (clearly visible so teachers can replace or delete it)
  const sampleRow = questionSheet.addRow({
    serialNumber: 'SAMPLE',
    question: '[SAMPLE QUESTION - REPLACE OR DELETE] What is the SI unit of electric current?',
    optionA: 'Ampere',
    optionB: 'Volt',
    optionC: 'Ohm',
    optionD: 'Watt',
    correctOption: 'A',
    marks: 1.00,
  });
  sampleRow.font = { italic: true, color: { argb: 'FF64748B' } };

  // Add validation rules to data rows (rows 2 through 500)
  for (let r = 2; r <= 500; r++) {
    // Column G (Correct Option): Dropdown validation A, B, C, D
    const cellG = questionSheet.getCell(`G${r}`);
    cellG.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"A,B,C,D"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Correct Option',
      error: 'Please choose A, B, C, or D',
    };

    // Column H (Marks): Decimal between 0.01 and 500.00
    const cellH = questionSheet.getCell(`H${r}`);
    cellH.dataValidation = {
      type: 'decimal',
      operator: 'between',
      allowBlank: true,
      formulae: [0.01, 500],
      showErrorMessage: true,
      errorTitle: 'Invalid Marks',
      error: 'Marks must be a positive number between 0.01 and 500.00',
    };
  }

  // =========================================================================
  // Worksheet 2: Instructions & Reference Examples
  // =========================================================================
  const instructionSheet = workbook.addWorksheet('Instructions');
  instructionSheet.columns = [
    { header: 'Requirement / Field', key: 'field', width: 24 },
    { header: 'Validation Rule', key: 'rule', width: 32 },
    { header: 'Detailed Instructions & Best Practices', key: 'instructions', width: 55 },
  ];

  const instrHeader = instructionSheet.getRow(1);
  instrHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  instrHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate-800
  };
  instrHeader.height = 26;

  const instructionsData = [
    {
      field: 'Worksheet Structure',
      rule: 'Do not modify sheet names',
      instructions: "Keep 'MCQ Questions' as the first tab. Do not delete or rename it.",
    },
    {
      field: 'Column Headers',
      rule: 'Exact header matching',
      instructions: 'Do not alter or reorder the headers in row 1: Serial Number, Question, Option A, Option B, Option C, Option D, Correct Option, Marks.',
    },
    {
      field: 'Serial Number',
      rule: 'Unique positive integer',
      instructions: 'Must be a positive whole number (e.g., 1, 2, 3). Each row in the file must have a unique Serial Number.',
    },
    {
      field: 'Question Text',
      rule: '1 to 5,000 characters',
      instructions: 'Mandatory. Formulations should be clear and concise. Equations can be written in plain text or standard LaTeX syntax.',
    },
    {
      field: 'Option A, B, C, D',
      rule: 'All 4 options required and distinct',
      instructions: 'Every question must specify all 4 options. All 4 choices must be distinct (no duplicate choices). Maximum 1,000 characters each.',
    },
    {
      field: 'Correct Option',
      rule: 'Must be A, B, C, or D',
      instructions: 'Indicate the single correct choice: A, B, C, or D. Case-insensitive.',
    },
    {
      field: 'Marks',
      rule: 'Positive number up to 500.00',
      instructions: 'Each question must specify marks (e.g., 1, 2, 2.50). Up to 2 decimal places allowed. Cannot exceed total assessment marks.',
    },
    {
      field: 'Row Capacity',
      rule: 'Maximum 500 questions per file',
      instructions: 'A single import file can contain up to 500 questions. Split larger question banks into multiple files if necessary.',
    },
    {
      field: 'Image Attachments',
      rule: 'Managed after import',
      instructions: 'Diagrams and images cannot be embedded in Excel cells. Import the questions first, then use the Question Management screen to upload images.',
    },
    {
      field: 'File Format',
      rule: '.xlsx (Excel Workbook)',
      instructions: 'Save the file strictly in .xlsx format (max 5 MB file size). Do not use .csv, .xls, or password-protected sheets.',
    },
  ];

  instructionsData.forEach((row) => {
    instructionSheet.addRow(row);
  });

  // Add blank spacing
  instructionSheet.addRow({});
  instructionSheet.addRow({});

  // Reference Examples section in Instructions tab
  const exampleSectionHeader = instructionSheet.addRow({
    field: 'REFERENCE EXAMPLES (DO NOT PASTE INTO THE FIRST TAB UNLESS INTENDED):',
  });
  exampleSectionHeader.font = { bold: true, color: { argb: 'FF4338CA' } };

  instructionSheet.addRow({
    field: 'Example 1',
    rule: 'Serial: 1 | Correct: A | Marks: 2.00',
    instructions: 'Question: "What is the capital of France?" | Opt A: "Paris" | Opt B: "London" | Opt C: "Berlin" | Opt D: "Rome"',
  });
  instructionSheet.addRow({
    field: 'Example 2',
    rule: 'Serial: 2 | Correct: B | Marks: 1.00',
    instructions: 'Question: "Which element has the chemical symbol O?" | Opt A: "Gold" | Opt B: "Oxygen" | Opt C: "Osmium" | Opt D: "Iron"',
  });

  return workbook;
}

/**
 * Returns raw Uint8Array / Buffer binary content of the generated template workbook.
 */
export async function generateQuestionTemplateWorkbookBuffer(): Promise<Uint8Array> {
  const workbook = await buildQuestionTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
}

/**
 * Generates an official, strictly validated Excel (.xlsx) workbook Blob template for MCQ examination questions.
 */
export async function generateQuestionTemplateWorkbook(): Promise<Blob> {
  const uint8 = await generateQuestionTemplateWorkbookBuffer();
  return new Blob([uint8 as any], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Initiates the client-side download of the official Examination MCQ template.
 * Safely creates an object URL, clicks an invisible link, and revokes the URL.
 */
export async function downloadQuestionTemplate(filename = 'Examination_MCQs_Template.xlsx'): Promise<void> {
  const blob = await generateQuestionTemplateWorkbook();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();

  // Safely release temporary object URL after trigger
  setTimeout(() => {
    if (document.body.contains(anchor)) {
      document.body.removeChild(anchor);
    }
    window.URL.revokeObjectURL(url);
  }, 1000);
}
