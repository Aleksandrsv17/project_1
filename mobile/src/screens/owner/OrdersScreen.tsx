import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';

type FilterType = 'all' | 'requested' | 'confirmed' | 'active';

interface OrderBooking {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  vehicle_id: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  type: string;
  mode: string;
  status: string;
  start_time: string;
  end_time: string;
  total_amount: number;
  pickup_address: string;
  notes: string;
  created_at: string;
}

function useOwnerBookings(status?: string) {
  return useQuery({
    queryKey: ['owner-bookings', status],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 50 };
      if (status && status !== 'all') params.status = status;
      const response = await apiClient.get('/bookings/owner-vehicles', { params });
      const data = response.data?.data ?? response.data;
      return data?.bookings ?? [];
    },
    staleTime: 10_000,
  });
}

export function OrdersScreen() {
  const styles = getStyles();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: bookings = [], isLoading, refetch, isFetching } = useOwnerBookings(filter);

  const approveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      await apiClient.patch(`/bookings/${bookingId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bookings'] });
      Alert.alert('Approved', 'Booking has been approved. Customer will receive the full address.');
    },
    onError: () => Alert.alert('Error', 'Failed to approve booking'),
  });

  const declineMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason: string }) => {
      await apiClient.patch(`/bookings/${bookingId}/decline`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-bookings'] });
      Alert.alert('Declined', 'Booking has been declined.');
    },
    onError: () => Alert.alert('Error', 'Failed to decline booking'),
  });

  function handleApprove(bookingId: string) {
    Alert.alert('Approve Booking', 'Accept this booking request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveMutation.mutate(bookingId) },
    ]);
  }

  function handleDecline(bookingId: string) {
    Alert.alert('Decline Booking', 'Are you sure you want to decline?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => declineMutation.mutate({ bookingId, reason: 'Declined by owner' }) },
    ]);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'requested': return '#F59E0B';
      case 'confirmed': return '#3B82F6';
      case 'active': return '#10B981';
      case 'completed': return '#6B7280';
      case 'declined': return '#EF4444';
      case 'cancelled': return '#6B7280';
      default: return '#9CA3AF';
    }
  }

  function formatType(type: string) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      <View style={styles.filterRow}>
        {([
          { key: 'all', label: 'All' },
          { key: 'requested', label: 'Requests' },
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'active', label: 'Active' },
        ] as const).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.textPrimary} /></View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item: OrderBooking) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={COLORS.textPrimary} />
          }
          renderItem={({ item }: { item: OrderBooking }) => (
            <View style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={[styles.typeBadge, { backgroundColor: item.mode === 'chauffeur' ? '#8B5CF620' : '#3B82F620' }]}>
                  <Text style={[styles.typeBadgeText, { color: item.mode === 'chauffeur' ? '#8B5CF6' : '#3B82F6' }]}>
                    {formatType(item.type)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>

              <Text style={styles.vehicleName}>{item.vehicle_year} {item.vehicle_make} {item.vehicle_model}</Text>

              {/* Customer info */}
              <View style={styles.customerSection}>
                <Text style={styles.customerLabel}>Customer</Text>
                <Text style={styles.customerName}>
                  {(item as any).customer?.first_name ? `${(item as any).customer.first_name} ${(item as any).customer.last_name}` : item.customer_name || item.customer_email || 'Unknown'}
                </Text>
                {(item as any).customer?.email && <Text style={styles.customerEmail}>{(item as any).customer.email}</Text>}
              </View>

              <View style={styles.orderDetails}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Start</Text>
                  <Text style={styles.detailValue}>{formatDate(item.start_time)}</Text>
                </View>
                {item.end_time && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>End</Text>
                    <Text style={styles.detailValue}>{formatDate(item.end_time)}</Text>
                  </View>
                )}
                {item.pickup_address && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Pickup</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{item.pickup_address}</Text>
                  </View>
                )}
                {item.notes && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{item.notes}</Text>
                  </View>
                )}
              </View>

              <View style={styles.orderFooter}>
                <Text style={styles.price}>{formatCurrency(parseFloat(String(item.total_amount)))}</Text>
                {item.status === 'requested' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.id)}>
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => handleApprove(item.id)}>
                      <Text style={styles.acceptBtnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>☰</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Booking requests from customers will appear here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  filterTabText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterTabTextActive: { color: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  orderCard: {
    backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  vehicleName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  customerSection: { marginBottom: SPACING.sm, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  customerLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  customerName: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  customerEmail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  orderDetails: { gap: 6, marginBottom: SPACING.sm },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 12, color: COLORS.textSecondary },
  detailValue: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary, maxWidth: '60%', textAlign: 'right' },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  price: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  declineBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#EF4444' },
  declineBtnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  acceptBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: COLORS.accent === '#000000' ? 'transparent' : COLORS.accent,
    borderWidth: COLORS.accent === '#000000' ? 1 : 0,
    borderColor: '#10B981',
  },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#10B981' },
  emptyContainer: { padding: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyIcon: { fontSize: 48, color: COLORS.textSecondary },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
}); }
