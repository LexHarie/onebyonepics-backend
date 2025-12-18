import { QuotasRepository } from './quotas.repository';
import { IQuotasRepositoryToken } from '../domain/quotas.repository.interface';

export const QuotasRepositoryInterfaces = [
  {
    provide: IQuotasRepositoryToken,
    useClass: QuotasRepository,
  },
];
