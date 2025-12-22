import { WebhookEventsRepository } from './database/repositories/webhook-events.repository';
import { IWebhookEventsRepositoryToken } from '../domain/webhook-events.repository.interface';

export const WebhookEventsRepositoryInterfaces = [
  {
    provide: IWebhookEventsRepositoryToken,
    useClass: WebhookEventsRepository,
  },
];
