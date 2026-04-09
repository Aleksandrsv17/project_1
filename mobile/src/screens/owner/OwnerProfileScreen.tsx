import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useAppModeStore } from '../../store/appModeStore';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';

export function OwnerProfileScreen() {
  const styles = getStyles();
  const { user, logout } = useAuthStore();
  const { setMode } = useAppModeStore();

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.modeSwitch} onPress={() => setMode('customer')}>
            <Text style={styles.modeSwitchIcon}>⌂</Text>
            <Text style={styles.modeSwitchText}>Customer</Text>
          </TouchableOpacity>
        </View>

        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.fullName || 'Owner'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          <Text style={styles.userRole}>Vehicle Owner</Text>
        </View>

        {/* Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <MenuItem icon="○" label="Personal Information" subtitle="Name, email, phone"
            onPress={() => Alert.alert('Profile', `Name: ${user?.fullName}\nEmail: ${user?.email}\nPhone: ${user?.phone}`)} />
          <MenuItem icon="¤" label="Earnings & Payouts" subtitle="View your earnings history"
            onPress={() => Alert.alert('Earnings', 'Earnings details available on the dashboard.')} />
          <MenuItem icon="▬" label="Bank Account" subtitle="Manage payout methods"
            onPress={() => Alert.alert('Coming Soon', 'Bank account management will be available soon.')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fleet</Text>
          <MenuItem icon="◆" label="My Vehicles" subtitle="Manage your fleet"
            onPress={() => Alert.alert('Fleet', 'Go to the My Fleet tab to manage vehicles.')} />
          <MenuItem icon="≡" label="Analytics" subtitle="Booking stats & performance"
            onPress={() => Alert.alert('Coming Soon', 'Analytics will be available soon.')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <MenuItem icon="⊟" label="Contact Support" subtitle="Get help from our team"
            onPress={() => Alert.alert('Support', 'Email: support@vipmobility.com\nPhone: +971 800 VIP')} />
          <MenuItem icon="≡" label="Terms & Conditions" subtitle="Legal information"
            onPress={() => Alert.alert('Terms', 'Terms & Conditions — coming soon.')} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>→</Text>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>VIP Mobility v1.0.0</Text>
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, subtitle, onPress }: {
  icon: string; label: string; subtitle: string; onPress: () => void;
}) {
  const styles = getStyles();
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuContent}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  modeSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.textPrimary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full },
  modeSwitchIcon: { fontSize: 14, color: COLORS.textPrimary },
  modeSwitchText: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  userCard: {
    backgroundColor: COLORS.primary, marginHorizontal: SPACING.md, marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, alignItems: 'center',
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  avatarText: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  userName: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  userEmail: { fontSize: 13, color: COLORS.gray, marginTop: 4 },
  userRole: { fontSize: 12, color: COLORS.accent, fontWeight: '600', marginTop: 4 },
  section: { marginTop: SPACING.lg, paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm, marginLeft: SPACING.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs, gap: SPACING.md },
  menuIcon: { fontSize: 22, width: 30, textAlign: 'center', color: COLORS.textPrimary },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  menuSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  menuArrow: { fontSize: 22, color: COLORS.gray, fontWeight: '300' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.md, marginTop: SPACING.lg, paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.grayLight, backgroundColor: COLORS.grayLight,
  },
  logoutIcon: { fontSize: 18, color: COLORS.textPrimary },
  logoutText: { fontSize: 15, fontWeight: '600', color: COLORS.error },
  versionText: { textAlign: 'center', fontSize: 12, color: COLORS.gray, marginTop: SPACING.md },
}); }
