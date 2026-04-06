import apiClient from './client';

export interface PaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface PaymentMethod {
  id: string;
  type: 'card';
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  isDefault: boolean;
}

export async function createPaymentIntent(bookingId: string): Promise<PaymentIntent> {
  const response = await apiClient.post<PaymentIntent>('/payments/create-intent', { bookingId });
  return response.data;
}

export async function confirmPayment(paymentIntentId: string, bookingId: string): Promise<{
  success: boolean;
  booking: { id: string; paymentStatus: string; status: string };
}> {
  const response = await apiClient.post('/payments/confirm', { paymentIntentId, bookingId });
  return response.data;
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await apiClient.get<PaymentMethod[]>('/payments/methods');
  return response.data;
}

export async function addPaymentMethod(paymentMethodId: string): Promise<PaymentMethod> {
  const response = await apiClient.post<PaymentMethod>('/payments/methods', { paymentMethodId });
  return response.data;
}

export async function removePaymentMethod(methodId: string): Promise<void> {
  await apiClient.delete(`/payments/methods/${methodId}`);
}

export async function setDefaultPaymentMethod(methodId: string): Promise<PaymentMethod> {
  const response = await apiClient.patch<PaymentMethod>(`/payments/methods/${methodId}/default`);
  return response.data;
}

export async function requestRefund(bookingId: string, reason: string): Promise<{
  success: boolean;
  refundId: string;
}> {
  const response = await apiClient.post('/payments/refund', { bookingId, reason });
  return response.data;
}
