import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../../config/env';
import type {
  CreateWebhookRequest,
  MayaCaptureResponse,
  MayaCheckoutWebhookPayload,
  MayaWebhook,
} from '../webhooks/domain/entities/maya-webhook.types';
import { AppLogger } from '../../lib/logger';

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

export class MayaService {
  private readonly logger = new AppLogger('MayaService');
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly webhookSecretKey: string;
  private readonly frontendUrl: string;

  constructor() {
    const isSandbox = config.maya.sandbox;
    this.baseUrl = isSandbox
      ? 'https://pg-sandbox.paymaya.com'
      : 'https://pg.paymaya.com';

    this.publicKey = config.maya.publicKey || '';
    this.secretKey = config.maya.secretKey || '';
    this.webhookSecretKey = config.maya.webhookSecretKey || '';
    this.frontendUrl = config.app.frontendUrl || 'http://localhost:5173';
  }

  private buildRedirectUrl(path: string, params: Record<string, string>): string {
    const base = this.frontendUrl.endsWith('/')
      ? this.frontendUrl
      : `${this.frontendUrl}/`;
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async createCheckout(params: {
    orderNumber: string;
    orderId: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    gridConfigName: string;
  }): Promise<MayaCheckoutResponse> {
    const [firstName, ...lastNameParts] = params.customerName.trim().split(' ');
    const lastName = lastNameParts.join(' ') || firstName;

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
        success: this.buildRedirectUrl('/order/success', {
          orderNumber: params.orderNumber,
        }),
        failure: this.buildRedirectUrl('/order/failed', {
          orderNumber: params.orderNumber,
          reason: 'payment_failed',
        }),
        cancel: this.buildRedirectUrl('/order/failed', {
          orderNumber: params.orderNumber,
          reason: 'cancelled',
        }),
      },
      requestReferenceNumber: params.orderNumber,
      metadata: {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
      },
    };

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
      this.logger.error(
        `Maya checkout creation failed: ${response.status} - ${errorBody}`,
      );
      throw new Error(`Failed to create Maya checkout: ${response.status}`);
    }

    const data = await response.json();

    return {
      checkoutId: data.checkoutId,
      redirectUrl: data.redirectUrl,
    };
  }

  async getCheckout(
    checkoutId: string,
  ): Promise<MayaCheckoutWebhookPayload | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/checkout/v1/checkouts/${checkoutId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
          },
        },
      );

      if (!response.ok) {
        this.logger.error(`Failed to get Maya checkout: ${response.status}`);
        return null;
      }

      return response.json();
    } catch (error) {
      this.logger.error(
        `Error fetching Maya checkout: ${(error as Error).message}`,
      );
      return null;
    }
  }

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
        this.logger.error(
          `Failed to get webhooks: ${response.status} - ${errorBody}`,
        );
        return [];
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Error fetching webhooks: ${(error as Error).message}`);
      return [];
    }
  }

  async registerWebhook(
    name: string,
    callbackUrl: string,
  ): Promise<MayaWebhook | null> {
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
        this.logger.error(
          `Failed to register webhook: ${response.status} - ${errorBody}`,
        );
        return null;
      }

      return response.json();
    } catch (error) {
      this.logger.error(
        `Error registering webhook: ${(error as Error).message}`,
      );
      return null;
    }
  }

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
        this.logger.error(
          `Failed to update webhook: ${response.status} - ${errorBody}`,
        );
        return null;
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Error updating webhook: ${(error as Error).message}`);
      return null;
    }
  }

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
        this.logger.error(
          `Failed to delete webhook: ${response.status} - ${errorBody}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error deleting webhook: ${(error as Error).message}`);
      return false;
    }
  }

  async capturePayment(
    paymentId: string,
    amount?: number,
  ): Promise<MayaCaptureResponse> {
    const body = amount ? { amount: { value: amount, currency: 'PHP' } } : {};

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
      this.logger.error(
        `Failed to capture payment: ${response.status} - ${errorBody}`,
      );
      throw new Error(`Failed to capture payment: ${response.status}`);
    }

    return response.json();
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecretKey) {
      return true;
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
    return Boolean(this.publicKey && this.secretKey);
  }
}
