import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class WebhookInitializerService implements OnModuleInit {
  private readonly logger = new Logger(WebhookInitializerService.name);

  async onModuleInit(): Promise<void> {
    // Webhook registration is disabled - register webhooks manually via Maya Manager/Dashboard
    // The /payments/v1/webhooks endpoint requires a different key scope than Checkout API keys
    this.logger.log(
      'Automatic webhook registration is disabled. Register webhooks manually in Maya Manager.',
    );
  }
}
