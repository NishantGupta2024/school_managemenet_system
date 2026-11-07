import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportConfigService } from './report-config.service';
import { ReportsExportService } from './reports-export.service';
import { DailyCollectionQueryDto } from './dto/daily-collection-query.dto';
import { MonthlyCollectionQueryDto } from './dto/monthly-collection-query.dto';
import { CollectionSummaryQueryDto } from './dto/collection-summary-query.dto';
import { OutstandingDuesQueryDto } from './dto/outstanding-dues-query.dto';
import { ClassCollectionQueryDto } from './dto/class-collection-query.dto';
import { FineSummaryQueryDto } from './dto/fine-summary-query.dto';
import { ExportReportQueryDto } from './dto/export-report-query.dto';
import { GatewayReconciliationQueryDto } from './dto/gateway-reconciliation-query.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportConfigService: ReportConfigService,
    private readonly reportsExportService: ReportsExportService,
  ) {}

  @Get('dues/outstanding')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getOutstandingDues(
    @Request() req: any,
    @Query() query: OutstandingDuesQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getOutstandingDues(school, query);
  }

  @Get('dues/defaulters')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getDefaultersReport(
    @Request() req: any,
    @Query() query: OutstandingDuesQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getDefaultersReport(school, query);
  }

  @Get('fines/summary')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getFineSummary(
    @Request() req: any,
    @Query() query: FineSummaryQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getFineSummary(school, query);
  }

  @Get('collections/by-class')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getClassCollections(
    @Request() req: any,
    @Query() query: ClassCollectionQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getClassCollections(school, query);
  }

  @Get('collections/daily')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getDailyCollection(
    @Request() req: any,
    @Query() query: DailyCollectionQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getDailyCollection(school, query);
  }

  @Get('collections/monthly')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getMonthlyCollection(
    @Request() req: any,
    @Query() query: MonthlyCollectionQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getMonthlyCollection(school, query);
  }

  @Get('collections/summary')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getCollectionSummary(
    @Request() req: any,
    @Query() query: CollectionSummaryQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getCollectionSummary(school, query);
  }

  @Get('reconciliation/gateway')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async getGatewayReconciliationReport(
    @Request() req: any,
    @Query() query: GatewayReconciliationQueryDto,
  ) {
    const school = req.school;
    return this.reportsService.getGatewayReconciliationReport(school, query);
  }

  @Get('config/:reportType')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getReportConfig(
    @Request() req: any,
    @Param('reportType') reportType: string,
  ) {
    const school = req.school;
    return this.reportConfigService.getReportConfig(school, reportType);
  }

  @Get('config')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async getAllReportConfigs(@Request() req: any) {
    const school = req.school;
    return this.reportConfigService.getAllReportConfigs(school);
  }

  // --- Subpath Export Routes ---

  @Get('collections/daily/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportDailyCollection(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'DAILY_COLLECTION', query, res);
  }

  @Get('collections/monthly/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportMonthlyCollection(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'MONTHLY_COLLECTION', query, res);
  }

  @Get('collections/summary/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportCollectionSummary(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'COLLECTION_SUMMARY', query, res);
  }

  @Get('dues/outstanding/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportOutstandingDues(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'OUTSTANDING_DUES', query, res);
  }

  @Get('dues/defaulters/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportDefaulters(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'DEFAULTER_REPORT', query, res);
  }

  @Get('collections/by-class/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportClassCollections(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'CLASS_COLLECTION', query, res);
  }

  @Get('fines/summary/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportFineSummary(
    @Request() req: any,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, 'FINE_SUMMARY', query, res);
  }

  // --- Parameterized Export Routes ---

  @Get(':reportType/export')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportReportByParam(
    @Request() req: any,
    @Param('reportType') reportType: string,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, reportType, query, res);
  }

  @Get('export/:reportType')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async exportReportByPrefix(
    @Request() req: any,
    @Param('reportType') reportType: string,
    @Query() query: ExportReportQueryDto,
    @Response() res: ExpressResponse,
  ) {
    return this.handleExport(req.school, reportType, query, res);
  }

  private async handleExport(
    school: any,
    reportType: string,
    query: ExportReportQueryDto,
    res: ExpressResponse,
  ) {
    const result = await this.reportsExportService.exportReport(
      school,
      reportType,
      query,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('x-school-id', school.id);
    res.setHeader('x-report-type', reportType);
    res.send(result.buffer);
  }
}

