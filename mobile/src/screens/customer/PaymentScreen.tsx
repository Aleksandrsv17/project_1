import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import {
  CardField,
  useConfirmPayment,
  CardFieldInput,
} from '@stripe/stripe-react-native';
import { useBooking } from '../../hooks/useBookings';
import { confirmPayment } from '../../api/payments';
import { useBookingStore } from '../../store/bookingStore';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { PriceBreakdown } from '../../components/PriceBreakdown';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type PaymentScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'Payment'>;
  route: RouteProp<CustomerStackParamList, 'Payment'>;
};

export function PaymentScreen({ navigation, route }: PaymentScreenProps) {
  const styles = getStyles();
  const { bookingId } = route.params;
  const { paymentClientSecret, setActiveBooking, setPaymentClientSecret } = useBookingStore();
  const { data: booking, isLoading } = useBooking(bookingId);
  const { confirmPayment: stripeConfirm } = useConfirmPayment();

  const [cardDetails, setCardDetails] = useState<CardFieldInput.Details | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handlePay() {
    if (!cardDetails?.complete) {
      Alert.alert('Card Incomplete', 'Please enter your complete card details.');
      return;
    }
    if (!paymentClientSecret) {
      Alert.alert('Payment Error', 'Payment session expired. Please go back and try again.');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Confirm with Stripe
      const { error, paymentIntent } = await stripeConfirm(paymentClientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Payment Failed', error.message);
        return;
      }

      if (paymentIntent?.status === 'Succeeded') {
        // 2. Notify our backend
        const result = await confirmPayment(paymentIntent.id, bookingId);

        // 3. Update store
        if (booking) {
          setActiveBooking({ ...booking, status: 'confirmed', paymentStatus: 'paid' });
        }
        setPaymentClientSecret(null);

        // 4. Navigate to success
        Alert.alert(
          'Payment Successful! !',
          'Your booking has been confirmed. You can track your vehicle in the Active Trip screen.',
          [
            {
              text: 'View Booking',
              onPress: () => navigation.replace('ActiveTrip', { bookingId }),
            },
          ]
        );
      }
    } catch {
      Alert.alert('Payment Error', 'Something went wrong processing your payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) return <LoadingSpinner fullScreen message="Loading booking details..." />;

  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.errorText}>Booking not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Secure Payment Banner */}
        <View style={styles.secureBanner}>
          <Text style={styles.secureIcon}>▪</Text>
          <Text style={styles.secureText}>Secured by Stripe · 256-bit SSL encryption</Text>
        </View>

        {/* Booking Summary */}
        <View style={styles.bookingSummary}>
          <Text style={styles.summaryTitle}>Booking Summary</Text>
          <SummaryRow
            label="Vehicle"
            value={`${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`}
          />
          <SummaryRow label="Mode" value={booking.mode === 'chauffeur' ? 'With Chauffeur' : 'Self Drive'} />
          <SummaryRow label="Booking #" value={`#${booking.id.slice(-8).toUpperCase()}`} />
        </View>

        {/* Price Breakdown */}
        <PriceBreakdown
          subtotal={booking.pricing.basePrice * booking.pricing.durationHours}
          chauffeurFee={booking.pricing.chauffeurFee}
          discount={booking.pricing.discount}
          tax={booking.pricing.tax}
          total={booking.pricing.total}
        />

        {/* Payment Methods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>

          {/* Stripe Card Field */}
          <View style={styles.cardContainer}>
            <CardField
              postalCodeEnabled={false}
              placeholder={{
                number: '4242 4242 4242 4242',
              }}
              cardStyle={stripeCardStyle}
              style={styles.cardField}
              onCardChange={(details) => setCardDetails(details)}
            />
          </View>

          {__DEV__ && (
            <Text style={styles.testCardHint}>
              Test card: 4242 4242 4242 4242 · Any future date · Any CVC
            </Text>
          )}
        </View>

        {/* Accepted Cards */}
        <View style={styles.acceptedCards}>
          <Text style={styles.acceptedCardsText}>We accept:</Text>
          <View style={styles.cardBrands}>
            {['Visa', 'Mastercard', 'AmEx', 'Apple Pay'].map((brand) => (
              <View key={brand} style={styles.cardBrand}>
                <Text style={styles.cardBrandText}>{brand}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Pay Button */}
      <View style={styles.bottomBar}>
        <SafeAreaView edges={['bottom']}>
          <TouchableOpacity
            style={[styles.payButton, (isProcessing || !cardDetails?.complete) && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={isProcessing || !cardDetails?.complete}
          >
            {isProcessing ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Text style={styles.payButtonText}>
                Pay {formatCurrency(booking.pricing.total)}
              </Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const styles = getStyles();
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const stripeCardStyle: CardFieldInput.Styles = {
  backgroundColor: '#FFFFFF',
  textColor: '#111827',
  placeholderColor: '#9ca3af',
  borderColor: '#e5e7eb',
  borderWidth: 1,
  borderRadius: 8,
};

function getStyles() { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSpacer: {
    width: 30,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: 120,
    gap: SPACING.md,
  },
  secureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.grayLight,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  secureIcon: {
    fontSize: 16, color: COLORS.textPrimary,
  },
  secureText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  bookingSummary: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardField: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.white,
  },
  testCardHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  acceptedCards: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  acceptedCardsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardBrands: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  cardBrand: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.white,
  },
  cardBrandText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  errorText: {
    padding: SPACING.lg,
    color: COLORS.error,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  payButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.sm,
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 17,
  },
}); }
