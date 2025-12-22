import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  CreateWebhookRequest,
  MayaCaptureResponse,
  MayaCheckoutWebhookPayload,
  MayaWebhook,
} from '../../webhooks/domain/entities/maya-webhook.types';

export interface MayaCheckoutItem {
  name: string;
  quantity: number;
  amount: { value: number };
  totalAmount: { value: number };
}

export interface MayaBuyer {
  firstName: string;
  lastName: string;
  contact?: {
    email?: string;
    phone?: string;
  };
}

export interface MayaRedirectUrls {
  success: string;
  failure: string;
  cancel: string;
}

export interface MayaCheckoutRequest {
  totalAmount: { value: number; currency: string };
  buyer: MayaBuyer;
  items: MayaCheckoutItem[];
  redirectUrl: MayaRedirectUrls;
  requestReferenceNumber: string;
  metadata?: Record<string, unknown>;
}

export interface MayaCheckoutResponse {
  checkoutId: string;
  redirectUrl: string;
}

@Injectable()
export class MayaService {
  private readonly logger = new Logger(MayaService.name);
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly webhookSecretKey: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const isSandbox = this.configService.get<boolean>('maya.sandbox', true);
    this.baseUrl = isSandbox
      ? 'https://pg-sandbox.paymaya.com'
      : 'https://pg.paymaya.com';

    this.publicKey = this.configService.get<string>('maya.publicKey') || '';
    this.secretKey = this.configService.get<string>('maya.secretKey') || '';
    this.webhookSecretKey = this.configService.get<string>('maya.webhookSecretKey') || '';
    this.frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

    if (!this.publicKey || !this.secretKey) {
      this.logger.warn('Maya API keys not configured. Payment integration will not work.');
    }
  }

  /**
   * Create a Maya Checkout session
   */
  async createCheckout(params: {
    orderNumber: string;
    orderId: string;
    amount: number; // in centavos
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    gridConfigName: string;
  }): Promise<MayaCheckoutResponse> {
    const [firstName, ...lastNameParts] = params.customerName.trim().split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

    // Convert centavos to PHP (Maya expects whole number for PHP)
    const amountInPhp = params.amount / 100;

    const body: MayaCheckoutRequest = {
      totalAmount: {
        value: amountInPhp,
        currency: 'PHP',
      },
      buyer: {
        firstName,
        lastName,
        contact: {
          email: params.customerEmail,
          phone: params.customerPhone,
        },
      },
      items: [
        {
          name: `onebyonepics - ${params.gridConfigName}`,
          quantity: 1,
          amount: { value: amountInPhp },
          totalAmount: { value: amountInPhp },
        },
      ],
      redirectUrl: {
        success: `${this.frontendUrl}/order/success?orderNumber=${params.orderNumber}`,
        failure: `${this.frontendUrl}/order/failed?orderNumber=${params.orderNumber}&reason=payment_failed`,
        cancel: `${this.frontendUrl}/order/failed?orderNumber=${params.orderNumber}&reason=cancelled`,
      },
      requestReferenceNumber: params.orderNumber,
      metadata: {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
      },
    };

    this.logger.debug(`Creating Maya checkout for order ${params.orderNumber}`);

    const response = await fetch(`${this.baseUrl}/checkout/v1/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(this.publicKey + ':').toString('base64')}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Maya checkout creation failed: ${response.status} - ${errorBody}`);
      throw new Error(`Failed to create Maya checkout: ${response.status}`);
    }

    const data = await response.json();

    this.logger.log(`Maya checkout created: ${data.checkoutId} for order ${params.orderNumber}`);

    return {
      checkoutId: data.checkoutId,
      redirectUrl: data.redirectUrl,
    };
  }

  /**
   * Retrieve checkout details by checkout ID
   */
  async getCheckout(
    checkoutId: string,
  ): Promise<MayaCheckoutWebhookPayload | null> {
    try {
      const response = await fetch(`${this.baseUrl}/checkout/v1/checkouts/${checkoutId}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
      });

      if (!response.ok) {
        this.logger.error(`Failed to get Maya checkout: ${response.status}`);
        return null;
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Error fetching Maya checkout: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get all registered webhooks
   * GET /payments/v1/webhooks
   */
  async getWebhooks(): Promise<MayaWebhook[]> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/v1/webhooks`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Failed to get webhooks: ${response.status} - ${errorBody}`);
        return [];
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Error fetching webhooks: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Register a webhook URL for an event type
   * POST /payments/v1/webhooks
   */
  async registerWebhook(name: string, callbackUrl: string): Promise<MayaWebhook | null> {
    try {
      const body: CreateWebhookRequest = { name, callbackUrl };

      const response = await fetch(`${this.baseUrl}/payments/v1/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Failed to register webhook: ${response.status} - ${errorBody}`);
        return null;
      }

      const webhook = await response.json();
      this.logger.log(`Registered webhook: ${name} -> ${callbackUrl}`);
      return webhook;
    } catch (error) {
      this.logger.error(`Error registering webhook: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Update an existing webhook
   * PUT /payments/v1/webhooks/{id}
   */
  async updateWebhook(id: string, callbackUrl: string): Promise<MayaWebhook | null> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/v1/webhooks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
        body: JSON.stringify({ callbackUrl }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Failed to update webhook: ${response.status} - ${errorBody}`);
        return null;
      }

      const webhook = await response.json();
      this.logger.log(`Updated webhook ${id} -> ${callbackUrl}`);
      return webhook;
    } catch (error) {
      this.logger.error(`Error updating webhook: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Delete a webhook
   * DELETE /payments/v1/webhooks/{id}
   */
  async deleteWebhook(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/v1/webhooks/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Failed to delete webhook: ${response.status} - ${errorBody}`);
        return false;
      }

      this.logger.log(`Deleted webhook ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting webhook: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Capture an authorized payment
   * POST /payments/v1/payments/{paymentId}/capture
   */
  async capturePayment(paymentId: string, amount?: number): Promise<MayaCaptureResponse> {
    const body = amount
      ? { amount: { value: amount, currency: 'PHP' } }
      : {};

    const response = await fetch(
      `${this.baseUrl}/payments/v1/payments/${paymentId}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Failed to capture payment: ${response.status} - ${errorBody}`);
      throw new Error(`Failed to capture payment: ${response.status}`);
    }

    const result = await response.json();
    this.logger.log(`Captured payment ${paymentId}`);
    return result;
  }

  /**
   * Verify webhook signature
   * Maya uses HMAC-SHA256 with the webhook secret key
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecretKey) {
      this.logger.warn('Webhook secret key not configured, skipping signature verification');
      return true; // In development, allow unsigned webhooks
    }

    try {
      const expectedSignature = createHmac('sha256', this.webhookSecretKey)
        .update(payload)
        .digest('hex');

      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (signatureBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Check if Maya is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.publicKey && this.secretKey);
  }
}
