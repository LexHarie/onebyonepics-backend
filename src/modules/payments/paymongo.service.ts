import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../../config/env';
import { AppLogger } from '../../lib/logger';

export interface PayMongoCheckoutResponse {
  checkoutSessionId: string;
  checkoutUrl: string;
}

export interface PayMongoCheckoutSession {
  id: string;
  type: 'checkout_session';
  attributes: {
    reference_number: string;
    status: 'active' | 'expired' | 'paid';
    checkout_url: string;
    payments: Array<{
      id: string;
      type: 'payment';
      attributes: {
        amount: number;
        status: 'pending' | 'paid' | 'failed';
        paid_at: number | null;
      };
    }>;
  };
}

export class PayMongoService {
  private readonly logger = new AppLogger('PayMongoService');
  private readonly baseUrl = 'https://api.paymongo.com/v1';
  private readonly secretKey: string;
  private readonly webhookSecretKey: string;
  private readonly frontendUrl: string;

  constructor() {
    this.secretKey = config.paymongo.secretKey || '';
    this.webhookSecretKey = config.paymongo.webhookSecretKey || '';
    this.frontendUrl = config.app.frontendUrl || 'http://localhost:5173';
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  private get isLiveMode(): boolean {
    return this.secretKey.startsWith('sk_live_');
  }

  async createCheckoutSession(params: {
    orderNumber: string;
    orderId: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    gridConfigName: string;
  }): Promise<PayMongoCheckoutResponse> {
    const successUrl = `${this.frontendUrl}/order/success?orderNumber=${params.orderNumber}`;
    const cancelUrl = `${this.frontendUrl}/order/failed?orderNumber=${params.orderNumber}&reason=cancelled`;

    const response = await fetch(`${this.baseUrl}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `onebyonepics - ${params.gridConfigName}`,
                quantity: 1,
                amount: params.amount,
                currency: 'PHP',
              },
            ],
            payment_method_types: ['card', 'gcash', 'grab_pay', 'paymaya', 'qrph'],
            success_url: successUrl,
            cancel_url: cancelUrl,
            reference_number: params.orderNumber,
            send_email_receipt: true,
            metadata: {
              order_id: params.orderId,
              order_number: params.orderNumber,
              customer_name: params.customerName,
              customer_email: params.customerEmail,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `PayMongo checkout creation failed: ${response.status} - ${errorBody}`,
      );
      throw new Error(`Failed to create PayMongo checkout: ${response.status}`);
    }

    const data = await response.json();
    return {
      checkoutSessionId: data.data.id,
      checkoutUrl: data.data.attributes.checkout_url,
    };
  }

  async getCheckoutSession(
    checkoutSessionId: string,
  ): Promise<PayMongoCheckoutSession | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/checkout_sessions/${checkoutSessionId}`,
        {
          method: 'GET',
          headers: { Authorization: this.authHeader },
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Failed to get PayMongo checkout: ${response.status}`,
        );
        return null;
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      this.logger.error(
        `Error fetching PayMongo checkout: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async expireCheckoutSession(checkoutSessionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/checkout_sessions/${checkoutSessionId}/expire`,
        {
          method: 'POST',
          headers: { Authorization: this.authHeader },
        },
      );
      return response.ok;
    } catch (error) {
      this.logger.error(
        `Error expiring checkout: ${(error as Error).message}`,
      );
      return false;
    }
  }

  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    if (!this.webhookSecretKey) {
      return true;
    }

    try {
      const parts: Record<string, string> = {};
      for (const part of signatureHeader.split(',')) {
        const [key, value] = part.split('=');
        if (key && value) {
          parts[key] = value;
        }
      }

      const timestamp = parts.t;
      const signature = this.isLiveMode ? parts.li : parts.te;

      if (!timestamp || !signature) {
        return false;
      }

      const signedPayload = `${timestamp}.${payload}`;
      const computedSignature = createHmac('sha256', this.webhookSecretKey)
        .update(signedPayload)
        .digest('hex');

      const signatureBuffer = Buffer.from(signature, 'hex');
      const computedBuffer = Buffer.from(computedSignature, 'hex');

      if (signatureBuffer.length !== computedBuffer.length) {
        return false;
      }

      return timingSafeEqual(signatureBuffer, computedBuffer);
    } catch (error) {
      this.logger.error(
        `Webhook signature verification failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  isWebhookSignatureConfigured(): boolean {
    return Boolean(this.webhookSecretKey);
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }
}
