import { rowToOrder } from '../orders/domain/entities/order.entity';
import { httpError } from '../../lib/http-error';
import type { AdminRepository } from './admin.repository';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class AdminUsersService {
  constructor(private readonly adminRepository: AdminRepository) {}

  private normalizePagination(page?: number, pageSize?: number) {
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, offset };
  }

  async listUsers(params: { search?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, offset } = this.normalizePagination(
      params.page,
      params.pageSize,
    );

    const { rows, total } = await this.adminRepository.listUsers({
      search: params.search?.trim() || null,
      limit: pageSize,
      offset,
    });

    return {
      items: rows,
      total,
      page,
      pageSize,
    };
  }

  async getUser(userId: string) {
    const user = await this.adminRepository.findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }
    return user;
  }

  async getUserOrders(userId: string) {
    const user = await this.adminRepository.findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const rows = await this.adminRepository.findUserOrders(userId);
    return rows.map(rowToOrder);
  }
}
