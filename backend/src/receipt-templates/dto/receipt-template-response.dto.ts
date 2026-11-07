import {
  ReceiptTemplateStatus,
  TemplateVersionStatus,
} from '@prisma/client';
import { TemplateValidationResult } from './template-validation-result.dto';

export interface ReceiptTemplateVersionResponseDto {
  id: string;
  templateId: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksumSha256: string;
  placeholdersDetected: string[];
  status: TemplateVersionStatus;
  uploadedByUserId: string | null;
  activatedByUserId: string | null;
  activatedAt: Date | null;
  createdAt: Date;
}

export interface ReceiptTemplateResponseDto {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  status: ReceiptTemplateStatus;
  activeVersionId: string | null;
  activeVersion?: ReceiptTemplateVersionResponseDto | null;
  versions?: ReceiptTemplateVersionResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadTemplateVersionResultDto {
  version: ReceiptTemplateVersionResponseDto;
  validation: TemplateValidationResult;
}
