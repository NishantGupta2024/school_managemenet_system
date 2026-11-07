import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { PaymentsService } from './payments.service';
import { OnlinePaymentsService } from './online-payments.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import {
  CreatePaymentRefundDto,
  UpdateRefundStatusDto,
} from './dto/create-payment-refund.dto';
import { CreateOnlinePaymentOrderDto } from './dto/create-online-payment-order.dto';
import { ReconciliationQueueQueryDto } from './dto/reconciliation-queue-query.dto';
import { ResolveOnlineSurplusDto } from './dto/resolve-online-surplus.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly onlinePaymentsService?: OnlinePaymentsService,
  ) {}

  private resolveMandatoryIdempotencyKey(
    headerKey?: string,
    bodyKey?: string,
    operation: string = 'financial operation',
  ): string {
    const raw = (headerKey || bodyKey || '').trim();
    if (!raw) {
      throw new BadRequestException(
        `Header "idempotency-key" is required for ${operation}`,
      );
    }
    if (raw.length > 255) {
      throw new BadRequestException(
        'Idempotency key must not exceed 255 characters',
      );
    }
    return raw;
  }

  @Post('online/create-order')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.STUDENT,
    UserRole.PARENT,
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async createOnlineOrder(
    @Request() req: any,
    @Body() dto: CreateOnlinePaymentOrderDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const idempotencyKey = this.resolveMandatoryIdempotencyKey(
      idempotencyKeyHeader,
      dto.idempotencyKey,
      'online payment order creation',
    );
    const schoolId = req.school?.id;
    const user = req.user;
    if (!this.onlinePaymentsService) {
      throw new BadRequestException('Online payments service is not available');
    }
    return this.onlinePaymentsService.createOnlineOrder(
      schoolId,
      user,
      dto,
      idempotencyKey,
    );
  }

  @Get('online/reconciliation-queue')
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async getReconciliationQueue(
    @Request() req: any,
    @Query() query: ReconciliationQueueQueryDto,
  ) {
    const schoolId = req.school?.id;
    const user = req.user;
    if (!this.onlinePaymentsService) {
      throw new BadRequestException('Online payments service is not available');
    }
    return this.onlinePaymentsService.getReconciliationQueue(
      schoolId,
      user,
      query,
    );
  }

  @Post('online/reconcile/:orderId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  async resolveSurplusOrder(
    @Request() req: any,
    @Param('orderId') orderId: string,
    @Body() dto: ResolveOnlineSurplusDto,
  ) {
    const schoolId = req.school?.id;
    const user = req.user;
    if (!this.onlinePaymentsService) {
      throw new BadRequestException('Online payments service is not available');
    }
    return this.onlinePaymentsService.resolveSurplusOrder(
      schoolId,
      user,
      orderId,
      dto,
    );
  }

  @Post('collect')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async collectPayment(
    @Request() req: any,
    @Body() dto: CollectPaymentDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const idempotencyKey = this.resolveMandatoryIdempotencyKey(
      idempotencyKeyHeader,
      dto.idempotencyKey,
      'payment collection',
    );
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.collectPayment(
      schoolId,
      user,
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async reversePayment(
    @Request() req: any,
    @Param('id') paymentId: string,
    @Body() dto: ReversePaymentDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const idempotencyKey = this.resolveMandatoryIdempotencyKey(
      idempotencyKeyHeader,
      dto.idempotencyKey,
      'payment reversal',
    );
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.reversePayment(
      schoolId,
      user,
      paymentId,
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async createRefund(
    @Request() req: any,
    @Param('id') paymentId: string,
    @Body() dto: CreatePaymentRefundDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const idempotencyKey = this.resolveMandatoryIdempotencyKey(
      idempotencyKeyHeader,
      dto.idempotencyKey,
      'payment refund',
    );
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.createRefund(
      schoolId,
      user,
      paymentId,
      dto,
      idempotencyKey,
    );
  }

  @Post('refunds/:refundId/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async confirmRefund(
    @Request() req: any,
    @Param('refundId') refundId: string,
    @Body() dto?: UpdateRefundStatusDto,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.confirmRefund(schoolId, user, refundId, dto);
  }

  @Post('refunds/:refundId/fail')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async failRefund(
    @Request() req: any,
    @Param('refundId') refundId: string,
    @Body() dto?: UpdateRefundStatusDto,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.failRefund(schoolId, user, refundId, dto);
  }

  @Post('refunds/:refundId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
  )
  async cancelRefund(
    @Request() req: any,
    @Param('refundId') refundId: string,
    @Body() dto?: UpdateRefundStatusDto,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.cancelRefund(schoolId, user, refundId, dto);
  }

  @Get()
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findAll(@Request() req: any, @Query() query: any) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.findAllPayments(schoolId, user, query);
  }

  @Get('receipts/:receiptNumber')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findReceipt(
    @Request() req: any,
    @Param('receiptNumber') receiptNumber: string,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.findReceiptByNumber(schoolId, user, receiptNumber);
  }

  @Get(['receipts/:receiptNumber/pdf', 'receipts/:receiptNumber/download'])
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async downloadReceiptPdf(
    @Request() req: any,
    @Param('receiptNumber') receiptNumber: string,
    @Res() res: Response,
    @Query('layout') layout?: 'compact' | 'standard',
    @Query('copies') copies?: string,
  ): Promise<void> {
    const schoolId = req.school.id;
    const user = req.user;
    const copiesNum = copies ? parseInt(copies, 10) : undefined;
    const { buffer, fileName, contentType } =
      await this.paymentsService.downloadReceiptPdf(schoolId, user, receiptNumber, {
        layout,
        copies: copiesNum,
      });

    const safeFileName =
      String(fileName || 'receipt.pdf').replace(/[^A-Za-z0-9._-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  @Post('receipts/batch-pdf')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async downloadBatchReceiptsPdf(
    @Request() req: any,
    @Res() res: Response,
    @Body('receiptNumbers') receiptNumbers?: string[],
    @Body('receiptIds') receiptIds?: string[],
    @Query('layout') layout: 'compact' | 'standard' = 'compact',
  ): Promise<void> {
    const schoolId = req.school.id;
    const user = req.user;
    const { buffer, fileName } =
      await this.paymentsService.downloadBatchReceiptsPdf(
        schoolId,
        user,
        { receiptNumbers, receiptIds },
        {
          layout: layout === 'standard' ? 'standard' : 'compact',
        },
      );

    const safeFileName =
      String(fileName || 'batch_receipts.pdf').replace(/[^A-Za-z0-9._-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  @Get('idempotency/:key')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
  )
  async lookupIdempotency(
    @Request() req: any,
    @Param('key') key: string,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.lookupByIdempotencyKey(schoolId, user, key);
  }

  @Get(':id/refunds')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findRefunds(
    @Request() req: any,
    @Param('id') paymentId: string,
  ) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.findRefundsByPaymentId(schoolId, user, paymentId);
  }

  @Get(':id')
  @Roles(
    UserRole.PLATFORM_SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.FEE_STAFF,
    UserRole.STUDENT,
    UserRole.PARENT,
  )
  async findOne(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.findPaymentById(schoolId, user, id);
  }
}
