import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@buiducnhat/nest-better-auth';
import { AdminUsersService } from '../../application/admin-users.service';
import { AdminGuard } from '../guards/admin.guard';
import { UsersQueryDto } from '../dto/users-query.dto';

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  async listUsers(@Query() query: UsersQueryDto) {
    return this.adminUsersService.listUsers({
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.adminUsersService.getUser(id);
  }

  @Get(':id/orders')
  async getUserOrders(@Param('id') id: string) {
    return this.adminUsersService.getUserOrders(id);
  }
}
