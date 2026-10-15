import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll() {
    const schoolId = this.tenantContext.getSchoolId()!;
    return this.prisma.student.findMany({
      where: { schoolId },
      include: {
        grade: true,
        section: true,
        academicYear: true,
      },
      orderBy: { admissionNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const schoolId = this.tenantContext.getSchoolId()!;
    // Note: Always partition by [schoolId, id]
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
      },
    });

    if (!student) {
      throw new NotFoundException(`Student ${id} not found in this school`);
    }

    return student;
  }
}
