import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { LibraryStudentService } from '../services/library-student.service';
import { StudentCatalogueQueryDto } from '../dto/settings.dto';

@Controller('library/student')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class LibraryStudentController {
  constructor(private readonly studentService: LibraryStudentService) {}

  /**
   * GET /api/v1/library/student/catalogue
   * Search school catalogue & view copy availability.
   * Read-only. Never leaks borrower identities.
   */
  @Get('catalogue')
  @Roles(UserRole.STUDENT)
  async getCatalogue(
    @Request() req: any,
    @Query() query: StudentCatalogueQueryDto,
  ) {
    const schoolId = req.school.id;
    return this.studentService.getCatalogue(schoolId, query);
  }

  /**
   * GET /api/v1/library/student/my-loans
   * View own active loans, due dates, and borrowing history.
   * Student ID is derived strictly from authenticated session (req.user.id).
   */
  @Get('my-loans')
  @Roles(UserRole.STUDENT)
  async getMyLoans(@Request() req: any) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.studentService.getMyLoans(schoolId, userId);
  }

  /**
   * GET /api/v1/library/student/my-fines
   * View own library fines status.
   * Strictly isolated from tuition invoices and fee balances.
   */
  @Get('my-fines')
  @Roles(UserRole.STUDENT)
  async getMyFines(@Request() req: any) {
    const schoolId = req.school.id;
    const userId = req.user.id;
    return this.studentService.getMyFines(schoolId, userId);
  }
}
