import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { SchoolPaymentGatewayConfigController } from './school-payment-gateway-config.controller';
import { SchoolPaymentGatewayConfigService } from './school-payment-gateway-config.service';
import { GatewayEnvironment, GatewayProvider, GatewayStatus, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';

describe('SchoolPaymentGatewayConfigController', () => {
  let controller: SchoolPaymentGatewayConfigController;
  let service: any;
  let reflector: Reflector;

  const SCHOOL_ID = 'school-alpha-uuid';
  const MOCK_REQ = {
    school: { id: SCHOOL_ID, name: 'Greenwood High School' },
    user: { id: 'admin-1', role: UserRole.SCHOOL_ADMIN, schoolId: SCHOOL_ID },
  };

  const MOCK_CONFIG = {
    id: 'cfg-1',
    schoolId: SCHOOL_ID,
    provider: GatewayProvider.RAZORPAY,
    merchantName: 'Greenwood High',
    keyId: 'rzp_test_51Abc',
    keySecretMasked: '••••••••••••••••1234',
    hasKeySecret: true,
    hasWebhookSecret: false,
    webhookSecretMasked: null,
    environment: GatewayEnvironment.TEST,
    status: GatewayStatus.ACTIVE,
    lastVerifiedAt: new Date(),
    lastVerificationError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      getConfig: jest.fn(),
      configure: jest.fn(),
      verify: jest.fn(),
      disconnect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolPaymentGatewayConfigController],
      providers: [
        {
          provide: SchoolPaymentGatewayConfigService,
          useValue: service,
        },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchoolPaymentGatewayConfigController>(
      SchoolPaymentGatewayConfigController,
    );
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Authorization Metadata & Role Protection', () => {
    it('restricts entire SchoolPaymentGatewayConfigController class to PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN', () => {
      const requiredRoles = reflector.get<UserRole[]>(
        ROLES_KEY,
        SchoolPaymentGatewayConfigController,
      );
      expect(requiredRoles).toEqual([
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
      ]);
    });
  });

  describe('getConfig', () => {
    it('should derive schoolId strictly from req.school.id and return config', async () => {
      service.getConfig.mockResolvedValue(MOCK_CONFIG);

      const result = await controller.getConfig(MOCK_REQ);

      expect(service.getConfig).toHaveBeenCalledWith(SCHOOL_ID);
      expect(result).toEqual(MOCK_CONFIG);
    });
  });

  describe('configure', () => {
    it('should pass req.school.id, req.user and dto to service', async () => {
      const dto = {
        keyId: 'rzp_test_51Abc',
        keySecret: 'new_secret_12345',
      };
      service.configure.mockResolvedValue(MOCK_CONFIG);

      const result = await controller.configure(MOCK_REQ, dto as any);

      expect(service.configure).toHaveBeenCalledWith(SCHOOL_ID, MOCK_REQ.user, dto);
      expect(result).toEqual(MOCK_CONFIG);
    });
  });

  describe('verify', () => {
    it('should trigger verification for the authenticated school', async () => {
      const verifyResult = {
        success: true,
        status: GatewayStatus.ACTIVE,
        message: 'Successfully connected and verified Razorpay credentials',
        testedAt: new Date(),
      };
      service.verify.mockResolvedValue(verifyResult);

      const result = await controller.verify(MOCK_REQ);

      expect(service.verify).toHaveBeenCalledWith(SCHOOL_ID, MOCK_REQ.user);
      expect(result).toEqual(verifyResult);
    });
  });

  describe('disconnect', () => {
    it('should call service.disconnect with req.school.id', async () => {
      service.disconnect.mockResolvedValue({ success: true, message: 'Disabled' });

      const result = await controller.disconnect(MOCK_REQ);

      expect(service.disconnect).toHaveBeenCalledWith(SCHOOL_ID, MOCK_REQ.user);
      expect(result.success).toBe(true);
    });
  });
});
