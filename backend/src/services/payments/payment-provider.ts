/**
 * PaymentProvider — single integration point for any real payment processor.
 *
 * For now we ship a mock implementation that no-ops every call and returns
 * synthetic provider refs. Swapping in Stripe Connect / SEPA / etc. is a
 * one-file change: implement PaymentProvider, replace the singleton at the
 * bottom of this file, redeploy. No call sites change.
 *
 * Each method is intentionally idempotent on the provider ref so retries from
 * the ride completion path don't double-charge / double-pay when the real
 * provider lands.
 */

export interface PayoutResult {
  ok: boolean;
  providerRef: string | null;
  error?: string;
}

export interface PaymentProvider {
  /** Charge the customer at trip completion. */
  collectFare(args: {
    bookingId: string;
    customerId: string;
    amount: number;
    currency: string;
  }): Promise<PayoutResult>;

  /** Send the driver's share of the net pool. */
  payoutDriver(args: {
    driverId: string;
    amount: number;
    currency: string;
    bookingId: string;
  }): Promise<PayoutResult>;

  /** Send the company's share of the net pool. */
  payoutCompany(args: {
    companyId: string;
    amount: number;
    currency: string;
    bookingId: string;
  }): Promise<PayoutResult>;
}

/** No-op demo implementation. Replace with a real provider when integrating. */
export class MockPaymentProvider implements PaymentProvider {
  async collectFare(args: { bookingId: string }): Promise<PayoutResult> {
    return { ok: true, providerRef: `mock-collect-${args.bookingId}` };
  }
  async payoutDriver(args: { bookingId: string; driverId: string }): Promise<PayoutResult> {
    return { ok: true, providerRef: `mock-pay-driver-${args.driverId}-${args.bookingId}` };
  }
  async payoutCompany(args: { bookingId: string; companyId: string }): Promise<PayoutResult> {
    return { ok: true, providerRef: `mock-pay-company-${args.companyId}-${args.bookingId}` };
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();
