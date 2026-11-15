import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Response,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response as ExpressResponse } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { LibraryCatalogueService } from '../services/library-catalogue.service';
import { LibraryCirculationService } from '../services/library-circulation.service';
import { LibraryExcelImportService } from '../services/library-excel-import.service';
import { LibraryFinesService } from '../services/library-fines.service';
import { LibrarySettingsService } from '../services/library-settings.service';
import { BookQueryDto, CreateBookDto, UpdateBookDto } from '../dto/book.dto';
import { CreateCopyDto, UpdateCopyDto } from '../dto/copy.dto';
import {
  IssueBookDto,
  LoanQueryDto,
  RenewBookDto,
  ReturnBookDto,
} from '../dto/circulation.dto';
import { CollectFineDto, FineQueryDto, WaiveFineDto } from '../dto/fine.dto';
import { UpdateLibrarySettingDto } from '../dto/settings.dto';
import { ConfirmCatalogueImportDto } from '../dto/catalogue-import.dto';

@Controller('library')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class LibraryStaffController {
  constructor(
    private readonly catalogueService: LibraryCatalogueService,
    private readonly circulationService: LibraryCirculationService,
    private readonly excelImportService: LibraryExcelImportService,
    private readonly finesService: LibraryFinesService,
    private readonly settingsService: LibrarySettingsService,
  ) {}

  // -------------------------------------------------------------
  // Catalogue Excel Import & Template
  // -------------------------------------------------------------

  /**
   * GET /api/v1/library/catalogue/template
   * Download styled .xlsx template for catalogue bulk import.
   */
  @Get('catalogue/template')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async downloadCatalogueTemplate(@Response() res: ExpressResponse) {
    const buffer = await this.excelImportService.generateTemplate();
    const filename = 'library_catalogue_template.xlsx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * POST /api/v1/library/catalogue/import/preview
   * Upload and preview catalogue spreadsheet with row-level validation.
   * Strictly read-only: does not modify database state.
   */
  @Post('catalogue/import/preview')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (req, file, cb) => {
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
  async previewCatalogueImport(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet file is required');
    }

    const schoolId = req.school.id;
    return this.excelImportService.previewImport(schoolId, file.buffer);
  }

  /**
   * POST /api/v1/library/catalogue/import/confirm
   * Atomically commits validated rows to the database inside a transaction.
   */
  @Post('catalogue/import/confirm')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async confirmCatalogueImport(
    @Request() req: any,
    @Body() dto: ConfirmCatalogueImportDto,
  ) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.excelImportService.confirmImport(schoolId, userId, dto);
  }

  // -------------------------------------------------------------
  // Catalogue Management (Books)
  // -------------------------------------------------------------

  /**
   * GET /api/v1/library/books
   * Search and paginate catalogue with copy counts.
   */
  @Get('books')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async getBooks(@Request() req: any, @Query() query: BookQueryDto) {
    const schoolId = req.school.id;
    return this.catalogueService.getBooks(schoolId, query);
  }

  /**
   * POST /api/v1/library/books
   * Add new book title to catalogue.
   */
  @Post('books')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async createBook(@Request() req: any, @Body() dto: CreateBookDto) {
    const schoolId = req.school.id;
    return this.catalogueService.createBook(schoolId, dto);
  }

  /**
   * PATCH /api/v1/library/books/:id
   * Edit book metadata.
   */
  @Patch('books/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async updateBook(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
  ) {
    const schoolId = req.school.id;
    return this.catalogueService.updateBook(schoolId, id, dto);
  }

  /**
   * DELETE /api/v1/library/books/:id
   * Delete book title (restricted to School Admin).
   */
  @Delete('books/:id')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async deleteBook(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    return this.catalogueService.deleteBook(schoolId, id);
  }

  // -------------------------------------------------------------
  // Physical Copy Management
  // -------------------------------------------------------------

  /**
   * POST /api/v1/library/books/:id/copies
   * Add physical copy to book.
   */
  @Post('books/:id/copies')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async createCopy(
    @Request() req: any,
    @Param('id') bookId: string,
    @Body() dto: CreateCopyDto,
  ) {
    const schoolId = req.school.id;
    return this.catalogueService.createCopy(schoolId, bookId, dto);
  }

  /**
   * PATCH /api/v1/library/copies/:copyId
   * Update copy condition, rack/shelf, or status.
   */
  @Patch('copies/:copyId')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async updateCopy(
    @Request() req: any,
    @Param('copyId') copyId: string,
    @Body() dto: UpdateCopyDto,
  ) {
    const schoolId = req.school.id;
    return this.catalogueService.updateCopy(schoolId, copyId, dto);
  }

  // -------------------------------------------------------------
  // Circulation Desk Operations
  // -------------------------------------------------------------

  /**
   * POST /api/v1/library/circulation/issue
   * Issue a book copy to student or teacher.
   */
  @Post('circulation/issue')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async issueBook(@Request() req: any, @Body() dto: IssueBookDto) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.circulationService.issueBook(schoolId, userId, dto);
  }

  /**
   * POST /api/v1/library/circulation/return
   * Return a book copy and assess overdue fines.
   */
  @Post('circulation/return')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async returnBook(@Request() req: any, @Body() dto: ReturnBookDto) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.circulationService.returnBook(schoolId, userId, dto);
  }

  /**
   * POST /api/v1/library/circulation/renew
   * Renew an active book loan.
   */
  @Post('circulation/renew')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async renewBook(@Request() req: any, @Body() dto: RenewBookDto) {
    const schoolId = req.school.id;
    return this.circulationService.renewBook(schoolId, dto);
  }

  /**
   * GET /api/v1/library/circulation/loans
   * List active, overdue, or history loans with filters.
   */
  @Get('circulation/loans')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async getLoans(@Request() req: any, @Query() query: LoanQueryDto) {
    const schoolId = req.school.id;
    return this.circulationService.getLoans(schoolId, query);
  }

  // -------------------------------------------------------------
  // Library Fines Management
  // -------------------------------------------------------------

  /**
   * GET /api/v1/library/fines
   * List school library fines with status filter.
   */
  @Get('fines')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async getFines(@Request() req: any, @Query() query: FineQueryDto) {
    const schoolId = req.school.id;
    return this.finesService.getFines(schoolId, query);
  }

  /**
   * POST /api/v1/library/fines/:id/collect
   * Record desk settlement / cash collection of library fine.
   */
  @Post('fines/:id/collect')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async collectFine(
    @Request() req: any,
    @Param('id') fineId: string,
    @Body() dto: CollectFineDto,
  ) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.finesService.collectFine(schoolId, fineId, userId, dto);
  }

  /**
   * POST /api/v1/library/fines/:id/waive
   * Waive library fine with mandatory reason.
   */
  @Post('fines/:id/waive')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async waiveFine(
    @Request() req: any,
    @Param('id') fineId: string,
    @Body() dto: WaiveFineDto,
  ) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.finesService.waiveFine(schoolId, fineId, userId, dto);
  }

  // -------------------------------------------------------------
  // Library Settings & Policy
  // -------------------------------------------------------------

  /**
   * GET /api/v1/library/settings
   * Retrieve school library loan rules & fine rates.
   */
  @Get('settings')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.LIBRARIAN)
  async getSettings(@Request() req: any) {
    const schoolId = req.school.id;
    return this.settingsService.getOrCreateSettings(schoolId);
  }

  /**
   * PATCH /api/v1/library/settings
   * Update school library policy (restricted to School Admin).
   */
  @Patch('settings')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async updateSettings(
    @Request() req: any,
    @Body() dto: UpdateLibrarySettingDto,
  ) {
    const schoolId = req.school.id;
    return this.settingsService.updateSettings(schoolId, dto);
  }
}
