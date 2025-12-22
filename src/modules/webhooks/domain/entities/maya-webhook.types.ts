// =============================================================================
// PAYMENT STATUSES
// =============================================================================

/**
 * All possible Maya payment statuses
 * @see https://developers.maya.ph/reference/payment-statuses
 */
export type MayaPaymentStatus =
  | 'PENDING_TOKEN'
  | 'PENDING_PAYMENT'
  | 'FOR_AUTHENTICATION'
  | 'AUTHENTICATING'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'AUTHORIZED'
  | 'VOIDED'
  | 'REFUNDED';

/**
 * Checkout-specific statuses (used in `status` field of checkout webhooks)
 */
export type MayaCheckoutStatus = 'COMPLETED' | 'EXPIRED' | 'PENDING';

// =============================================================================
// FUND SOURCE TYPES
// =============================================================================

/**
 * All supported payment method types
 */
export type MayaFundSourceType =
  | 'card'
  | 'paymaya'
  | 'gcash'
  | 'qrph'
  | 'maya-wallet';

// -----------------------------------------------------------------------------
// Card Fund Source
// -----------------------------------------------------------------------------

export interface MayaCardFundSourceDetails {
  scheme: string;
  last4: string;
  first6: string;
  masked: string;
  issuer: string;
}

export interface MayaCardFundSource {
  type: 'card' | 'paymaya';
  id: string | null;
  description: string;
  details: MayaCardFundSourceDetails;
}

// -----------------------------------------------------------------------------
// GCash Fund Source
// -----------------------------------------------------------------------------

export interface MayaGCashFundSourceDetails {
  mid: string;
  acquirementId: string;
  merchantTransId: string;
  transactionId: string;
  checkoutUrl: string;
  subMerchantId: string;
  subMerchantName: string;
  buyerUserId: string;
}

export interface MayaGCashFundSource {
  type: 'gcash';
  id: string;
  description: string;
  details: MayaGCashFundSourceDetails;
}

// -----------------------------------------------------------------------------
// QRPh Fund Source
// -----------------------------------------------------------------------------

export interface MayaQRPhFundSourceDetails {
  [key: string]: unknown;
}

export interface MayaQRPhFundSource {
  type: 'qrph';
  id: string;
  description: string;
  details: MayaQRPhFundSourceDetails;
}

// -----------------------------------------------------------------------------
// Maya Wallet Fund Source
// -----------------------------------------------------------------------------

export interface MayaWalletFundSourceDetails {
  firstName: string;
  middleName: string;
  lastName: string;
  msisdn: string;
  profileId: string;
  email: string;
  masked: string;
}

export interface MayaWalletFundSource {
  type: 'maya-wallet';
  id: string;
  description: string;
  details: MayaWalletFundSourceDetails;
}

// -----------------------------------------------------------------------------
// Union Type for All Fund Sources
// -----------------------------------------------------------------------------

export type MayaFundSource =
  | MayaCardFundSource
  | MayaGCashFundSource
  | MayaQRPhFundSource
  | MayaWalletFundSource;

// =============================================================================
// COMMON TYPES
// =============================================================================

export interface MayaAmount {
  value: number | string;
  currency?: string;
  details?: {
    discount?: string;
    serviceCharge?: string;
    shippingFee?: string;
    tax?: string;
    subtotal?: string;
  };
}

export interface MayaReceipt {
  transactionId: string;
  receiptNo: string;
  approval_code?: string;
  approvalCode?: string;
  batchNo?: string;
}

export interface MayaBuyer {
  firstName?: string;
  lastName?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
  billingAddress?: MayaAddress;
  shippingAddress?: MayaAddress;
}

export interface MayaAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  countryCode?: string;
}

export interface MayaItem {
  name: string;
  code?: string;
  description?: string;
  quantity: string | number;
  amount: MayaAmount;
  totalAmount: MayaAmount;
}

export interface MayaRedirectUrls {
  success: string;
  failure: string;
  cancel?: string;
}

export interface MayaError {
  logref: string;
  code: number;
  message: string;
  receiptNo?: string;
  links?: Array<{ rel: string; href: string }>;
}

// =============================================================================
// CHECKOUT WEBHOOK PAYLOAD
// =============================================================================

/**
 * Webhook payload received from Maya Checkout flow
 * This is sent when a checkout session completes (success, failure, or expiry)
 */
export interface MayaCheckoutWebhookPayload {
  // Identification
  id: string;
  requestReferenceNumber: string;
  receiptNumber: string | null;
  transactionReferenceNumber: string | null;

  // Items
  items?: MayaItem[];

  // Status
  status: MayaCheckoutStatus;
  paymentStatus: MayaPaymentStatus;

  // Payment details
  paymentScheme: string | null;
  paymentDetails: MayaPaymentDetails;
  expressCheckout: boolean;
  refundedAmount: string;
  canPayPal: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  expiredAt: string;

  // Parties
  buyer?: MayaBuyer;
  merchant?: MayaMerchant;

  // Amounts
  totalAmount: MayaAmount;

  // URLs
  redirectUrl?: MayaRedirectUrls;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface MayaPaymentDetails {
  responses?: {
    efs?: MayaEfsResponse;
  };
  paymentAt: string | null;
  '3ds'?: boolean;
}

export interface MayaEfsResponse {
  paymentTransactionReferenceNo?: string;
  status: string;
  receipt?: MayaReceipt;
  payer?: {
    fundingInstrument?: {
      card?: {
        cardNumber: string;
        expiryMonth: number;
        expiryYear: string;
      };
    };
  };
  amount?: {
    total?: MayaAmount;
  };
  created_at?: string;
  unhandledError?: MayaError[];
}

export interface MayaMerchant {
  currency: string;
  email: string;
  locale: string;
  homepageUrl: string;
  isEmailToMerchantEnabled: boolean;
  isEmailToBuyerEnabled: boolean;
  isPaymentFacilitator: boolean;
  isPageCustomized: boolean;
  supportedSchemes: string[];
  canPayPal: boolean;
  payPalEmail: string | null;
  payPalWebExperienceId: string | null;
  expressCheckout: boolean;
  name: string;
}

// =============================================================================
// PAYMENT WEBHOOK PAYLOAD (Direct Payment / Charge API)
// =============================================================================

/**
 * Webhook payload received from Maya Direct Payment / Charge API
 * This is sent for card payments, e-wallet payments, etc.
 */
export interface MayaPaymentWebhookPayload {
  // Identification
  id: string;
  requestReferenceNumber: string;
  receiptNumber?: string;

  // Status
  isPaid: boolean;
  status: MayaPaymentStatus;

  // Amount
  amount: string | number;
  currency: string;

  // Capabilities
  canVoid: boolean;
  canRefund: boolean;
  canCapture: boolean;

  // Authorization (for auth/capture flow)
  authorizationType?: 'NORMAL' | 'FINAL';
  capturedAmount?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Payment method
  paymentTokenId?: string;
  fundSource?: MayaFundSource;

  // Receipt
  receipt?: MayaReceipt;
  approvalCode?: string;

  // Description
  description?: string;

  // Error information (for failed payments)
  errorCode?: string;
  errorMessage?: string;

  // Metadata
  metadata?: Record<string, unknown>;
}

// =============================================================================
// DISCRIMINATED UNION & TYPE GUARDS
// =============================================================================

/**
 * Union type for all Maya webhook payloads
 */
export type MayaWebhookPayload =
  | MayaCheckoutWebhookPayload
  | MayaPaymentWebhookPayload;

/**
 * Type guard to check if payload is from Checkout flow
 * Checkout webhooks have both `status` and `paymentStatus` fields
 */
export function isCheckoutWebhook(
  payload: MayaWebhookPayload,
): payload is MayaCheckoutWebhookPayload {
  return (
    'paymentStatus' in payload &&
    'status' in payload &&
    typeof (payload as MayaCheckoutWebhookPayload).paymentStatus === 'string' &&
    ['COMPLETED', 'EXPIRED', 'PENDING'].includes(
      (payload as MayaCheckoutWebhookPayload).status,
    )
  );
}

/**
 * Type guard to check if payload is from Direct Payment flow
 * Payment webhooks have `isPaid` field
 */
export function isPaymentWebhook(
  payload: MayaWebhookPayload,
): payload is MayaPaymentWebhookPayload {
  return (
    'isPaid' in payload &&
    typeof (payload as MayaPaymentWebhookPayload).isPaid === 'boolean'
  );
}

/**
 * Extract the effective payment status from any webhook payload
 */
export function extractPaymentStatus(
  payload: MayaWebhookPayload,
): MayaPaymentStatus {
  if (isCheckoutWebhook(payload)) {
    return payload.paymentStatus;
  }
  return payload.status;
}

/**
 * Extract fund source type from webhook payload
 */
export function extractFundSourceType(
  payload: MayaWebhookPayload,
): MayaFundSourceType | null {
  if (isPaymentWebhook(payload) && payload.fundSource) {
    return payload.fundSource.type;
  }
  if (isCheckoutWebhook(payload) && payload.paymentScheme) {
    const schemeMap: Record<string, MayaFundSourceType> = {
      'master-card': 'card',
      mastercard: 'card',
      visa: 'card',
      jcb: 'card',
      gcash: 'gcash',
      qrph: 'qrph',
      maya: 'maya-wallet',
    };
    return schemeMap[payload.paymentScheme.toLowerCase()] || null;
  }
  return null;
}

// =============================================================================
// WEBHOOK MANAGEMENT API TYPES
// =============================================================================

/**
 * Registered webhook from Maya API
 */
export interface MayaWebhook {
  id: string;
  name: string;
  callbackUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to register a new webhook
 */
export interface CreateWebhookRequest {
  name: string;
  callbackUrl: string;
}

/**
 * Request to update an existing webhook
 */
export interface UpdateWebhookRequest {
  callbackUrl: string;
}

// =============================================================================
// CAPTURE API TYPES
// =============================================================================

/**
 * Request to capture an authorized payment
 */
export interface MayaCaptureRequest {
  amount?: {
    value: number;
    currency: string;
  };
}

/**
 * Response from capture API
 */
export interface MayaCaptureResponse {
  id: string;
  status: string;
  amount: string;
  currency: string;
  capturedAt: string;
}

// =============================================================================
// WEBHOOK EVENT NAMES
// =============================================================================

/**
 * Maya webhook event names for registration
 */
export const MAYA_WEBHOOK_EVENTS = [
  'CHECKOUT_SUCCESS',
  'CHECKOUT_FAILURE',
  'CHECKOUT_DROPOUT',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'AUTHORIZED',
] as const;

export type MayaWebhookEventName = typeof MAYA_WEBHOOK_EVENTS[number];

// =============================================================================
// ERROR CODES REFERENCE
// =============================================================================

/**
 * Common Maya error codes
 * @see https://developers.maya.ph/reference/payment-errors
 */
export const MAYA_ERROR_CODES = {
  PY0009: 'Payment does not exist',
  PY0016: 'Payment processor service error',
  PY0124: 'Transaction could not be verified',
  PY0138: 'Acquirer decline',
  2089: 'Card Security Code/Card Verification Value is incorrect',
  2553: 'Invalid fields (check parameter object for details)',
} as const;
