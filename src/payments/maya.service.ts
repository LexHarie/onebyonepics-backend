import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

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

export interface MayaWebhookPayload {
  id: string;
  isPaid: boolean;
  status: string;
  amount: number;
  currency: string;
  canVoid: boolean;
  canRefund: boolean;
  canCapture: boolean;
  createdAt: string;
  updatedAt: string;
  requestReferenceNumber: string;
  receiptNumber?: string;
  paymentScheme?: string;
  metadata?: Record<string, unknown>;
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
  async getCheckout(checkoutId: string): Promise<MayaWebhookPayload | null> {
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
