import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: PrismaService;
  let tenantContextService: TenantContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            ping: jest.fn().mockResolvedValue(5),
            school: { count: jest.fn().mockResolvedValue(2) },
            user: { count: jest.fn().mockResolvedValue(5) },
            student: { count: jest.fn().mockResolvedValue(100) },
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getSchoolId: jest.fn().mockReturnValue('test-school-id'),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get<PrismaService>(PrismaService);
    tenantContextService = module.get<TenantContextService>(TenantContextService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return ok health status when database responds', async () => {
    const result = await service.checkHealth();

    expect(result.status).toBe('ok');
    expect(result.database.status).toBe('connected');
    expect(result.database.latencyMs).toBe(5);
    expect(result.database.tenantCount).toBe(2);
    expect(result.database.userCount).toBe(5);
    expect(result.database.studentCount).toBe(100);
    expect(result.tenantContext.activeSchoolId).toBe('test-school-id');
  });

  it('should return error status gracefully when database ping fails', async () => {
    jest.spyOn(prismaService, 'ping').mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await service.checkHealth();

    expect(result.status).toBe('error');
    expect(result.database.status).toBe('disconnected');
    expect(result.database.error).toContain('Connection timeout');
  });
});
