import { OrdersRepository } from './orders.repository';
import { IOrdersRepositoryToken } from './orders.repository.interface';

export const OrdersRepositoryInterfaces = [
  {
    provide: IOrdersRepositoryToken,
    useClass: OrdersRepository,
  },
];
