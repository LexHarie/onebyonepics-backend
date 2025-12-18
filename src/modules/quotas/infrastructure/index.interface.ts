import { QuotasRepository } from './quotas.repository';
import { IQuotasRepositoryToken } from './quotas.repository.interface';

export const QuotasRepositoryInterfaces = [
  {
    provide: IQuotasRepositoryToken,
    useClass: QuotasRepository,
  },
];
