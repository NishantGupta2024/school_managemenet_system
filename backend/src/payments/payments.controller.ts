import {
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
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { PaymentsService } from './payments.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import {
  CreatePaymentRefundDto,
  UpdateRefundStatusDto,
} from './dto/create-payment-refund.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.collectPayment(
      schoolId,
      user,
      dto,
      idempotencyKeyHeader,
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
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.reversePayment(
      schoolId,
      user,
      paymentId,
      dto,
      idempotencyKeyHeader,
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
    const schoolId = req.school.id;
    const user = req.user;
    return this.paymentsService.createRefund(
      schoolId,
      user,
      paymentId,
      dto,
      idempotencyKeyHeader,
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
