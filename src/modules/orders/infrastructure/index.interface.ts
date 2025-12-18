import { OrdersRepository } from './database/repositories/orders.repository';
import { IOrdersRepositoryToken } from '../domain/orders.repository.interface';

export const OrdersRepositoryInterfaces = [
  {
    provide: IOrdersRepositoryToken,
    useClass: OrdersRepository,
  },
];
