import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '../utils/constants';
import { formatCurrency } from '../utils/formatters';

interface PriceBreakdownProps {
  subtotal: number;
  chauffeurFee?: number;
  discount?: number;
  tax: number;
  total: number;
  currency?: string;
}

export function PriceBreakdown({
  subtotal,
  chauffeurFee = 0,
  discount = 0,
  tax,
  total,
  currency = 'AED',
}: PriceBreakdownProps) {
  const fmt = (amount: number) => formatCurrency(amount, currency);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Price Breakdown</Text>

      <View style={styles.rows}>
        <Row label="Subtotal" value={fmt(subtotal)} />
        {chauffeurFee > 0 && <Row label="Chauffeur fee" value={fmt(chauffeurFee)} />}
        {discount > 0 && <Row label="Discount" value={`-${fmt(discount)}`} valueColor={COLORS.success} />}
        <Row label="VAT (5%)" value={fmt(tax)} />
      </View>

      <View style={styles.divider} />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{fmt(total)}</Text>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  rows: {
    gap: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
