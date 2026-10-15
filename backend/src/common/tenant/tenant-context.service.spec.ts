import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('should return undefined when no tenant context is set', () => {
    expect(service.getSchoolId()).toBeUndefined();
    expect(service.getStore()).toBeUndefined();
  });

  it('should preserve tenant context within an asynchronous callback', async () => {
    const schoolA = 'school-alpha-id';

    const result = await service.run({ schoolId: schoolA }, async () => {
      // Simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return service.getSchoolId();
    });

    expect(result).toBe(schoolA);
    // Outside the callback, context is empty
    expect(service.getSchoolId()).toBeUndefined();
  });

  it('should maintain independent tenant contexts concurrently', async () => {
    const school1 = 'school-tenant-1';
    const school2 = 'school-tenant-2';

    const task1 = service.run({ schoolId: school1 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return service.getSchoolId();
    });

    const task2 = service.run({ schoolId: school2 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return service.getSchoolId();
    });

    const [res1, res2] = await Promise.all([task1, task2]);

    expect(res1).toBe(school1);
    expect(res2).toBe(school2);
  });
});
