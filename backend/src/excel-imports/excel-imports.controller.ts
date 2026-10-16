import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Response,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportsService } from './excel-imports.service';
import { ImportType, PreviewImportDto } from './dto/preview-import.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';
import type { Response as ExpressResponse } from 'express';

@Controller('excel-imports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF)
export class ExcelImportsController {
  constructor(private readonly excelImportsService: ExcelImportsService) {}

  @Get('template')
  async downloadTemplate(
    @Query('type') type: ImportType,
    @Response() res: ExpressResponse,
  ) {
    if (!type || !Object.values(ImportType).includes(type)) {
      throw new BadRequestException('Valid type query parameter is required (STUDENT_MASTER or FEE_ALLOCATION)');
    }

    const buffer = await this.excelImportsService.generateTemplate(type);
    const filename = `template_${type.toLowerCase()}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        // Accept .xlsx files
        const isValidMime =
          file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/octet-stream' ||
          file.originalname.endsWith('.xlsx');

        if (!isValidMime && !file.originalname.match(/\.xlsx$/i)) {
          return cb(
            new BadRequestException('Only .xlsx spreadsheet files are accepted'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required');
    }

    const schoolId = req.school.id;
    return this.excelImportsService.previewImport(schoolId, file.buffer, dto);
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmImportDto, @Request() req: any) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.excelImportsService.confirmImport(schoolId, userId, dto);
  }
}
