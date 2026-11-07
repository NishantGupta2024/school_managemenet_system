import { AcademicYearFormat } from '@prisma/client';

export class ReceiptNumberConfigResponseDto {
  id?: string;
  schoolId: string;
  prefix: string;
  yearFormat: AcademicYearFormat;
  paddingDigits: number;
  separator: string;
  previewSample: string;
  isCustomized: boolean;
  updatedAt?: Date;
}
