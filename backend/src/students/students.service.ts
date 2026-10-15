import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForSchool(schoolId: string) {
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

  async findOneForSchool(schoolId: string, id: string) {
    // Strictly partition by composite unique key [schoolId, id]
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
