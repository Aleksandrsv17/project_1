import { format, formatDistanceToNow, parseISO, differenceInMinutes, differenceInHours } from 'date-fns';

/**
 * Format a number as currency (AED by default for UAE market)
 */
export function formatCurrency(amount: number, currency = 'AED'): string {
  if (isNaN(amount)) return `${currency} 0.00`;
  return `${currency} ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Format currency as compact string for display in cards
 */
export function formatCurrencyCompact(amount: number, currency = 'AED'): string {
  if (amount >= 1000) {
    return `${currency} ${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(amount, currency);
}

/**
 * Format a date string or Date object to a readable date
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM dd, yyyy');
}

/**
 * Format a date string or Date object to a readable date and time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM dd, yyyy · h:mm a');
}

/**
 * Format just the time from a date
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 minutes")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format a duration in hours to human-readable
 */
export function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }
  if (Number.isInteger(hours)) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours} hr${wholeHours > 1 ? 's' : ''}`;
  return `${wholeHours} hr${wholeHours > 1 ? 's' : ''} ${minutes} min`;
}

/**
 * Format a distance in kilometers
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('971')) {
    return `+971 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  }
  return phone;
}

/**
 * Format a vehicle's year-make-model
 */
export function formatVehicleName(year: number, make: string, model: string): string {
  return `${year} ${make} ${model}`;
}

/**
 * Format trip ETA in minutes
 */
export function formatETA(minutes: number): string {
  if (minutes < 1) return 'Arriving now';
  if (minutes < 60) return `${Math.round(minutes)} min away`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m away`;
}

/**
 * Format booking status to display label with color
 */
export function getBookingStatusConfig(status: string): { label: string; color: string; bgColor: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: '#f59e0b', bgColor: '#fef3c7' };
    case 'confirmed':
      return { label: 'Confirmed', color: '#3b82f6', bgColor: '#dbeafe' };
    case 'active':
      return { label: 'Active', color: '#10b981', bgColor: '#d1fae5' };
    case 'completed':
      return { label: 'Completed', color: '#6b7280', bgColor: '#f3f4f6' };
    case 'cancelled':
      return { label: 'Cancelled', color: '#ef4444', bgColor: '#fee2e2' };
    default:
      return { label: status, color: '#6b7280', bgColor: '#f3f4f6' };
  }
}

/**
 * Calculate total price for a booking
 */
export function calculateBookingTotal(
  basePrice: number,
  durationHours: number,
  chauffeurFee: number = 0,
  discount: number = 0
): {
  subtotal: number;
  chauffeurFee: number;
  discount: number;
  tax: number;
  total: number;
} {
  const subtotal = basePrice * durationHours;
  const tax = (subtotal + chauffeurFee - discount) * 0.05; // 5% VAT
  const total = subtotal + chauffeurFee - discount + tax;
  return { subtotal, chauffeurFee, discount, tax, total };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}
