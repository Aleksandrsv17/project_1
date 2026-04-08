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
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CustomerTabParamList } from '../../navigation/MainNavigator';
import { useAuthStore } from '../../store/authStore';
import { useAppModeStore } from '../../store/appModeStore';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';

type ProfileScreenProps = {
  navigation: BottomTabNavigationProp<CustomerTabParamList, 'Profile'>;
};

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const styles = getStyles();
  const { user, logout } = useAuthStore();
  const { setMode } = useAppModeStore();

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with mode switch */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.modeSwitch} onPress={() => setMode('owner')}>
            <Text style={styles.modeSwitchIcon}>🚗</Text>
            <Text style={styles.modeSwitchText}>Rent Out</Text>
          </TouchableOpacity>
        </View>

        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          <Text style={styles.userPhone}>{user?.phone || ''}</Text>

          {/* KYC Status */}
          <View style={[styles.kycBadge, user?.kycVerified ? styles.kycVerified : styles.kycPending]}>
            <Text style={[styles.kycText, user?.kycVerified ? styles.kycTextVerified : styles.kycTextPending]}>
              {user?.kycVerified ? '✓ KYC Verified' : '⏳ KYC Pending'}
            </Text>
          </View>
        </View>

        {/* Menu sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <MenuItem
            icon="👤"
            label="Personal Information"
            subtitle="Name, email, phone"
            onPress={() => Alert.alert('Profile', `Name: ${user?.fullName}\nEmail: ${user?.email}\nPhone: ${user?.phone}`)}
          />
          <MenuItem
            icon="🪪"
            label="KYC Verification"
            subtitle={user?.kycVerified ? 'Verified' : 'Complete your verification'}
            onPress={() => Alert.alert('KYC', user?.kycVerified ? 'Your identity is verified.' : 'Please complete KYC from the registration flow or contact support.')}
            badge={!user?.kycVerified ? 'Required' : undefined}
          />
          <MenuItem
            icon="💳"
            label="Payment Methods"
            subtitle="Manage cards & wallets"
            onPress={() => Alert.alert('Coming Soon', 'Payment methods management will be available soon.')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity</Text>

          <MenuItem
            icon="📋"
            label="Order History"
            subtitle="View past bookings & trips"
            onPress={() => navigation.navigate('BookingHistory' as never)}
          />
          <MenuItem
            icon="⭐"
            label="My Reviews"
            subtitle="Reviews you've given"
            onPress={() => Alert.alert('Coming Soon', 'Reviews section will be available soon.')}
          />
          <MenuItem
            icon="❤️"
            label="Saved Vehicles"
            subtitle="Your favorites"
            onPress={() => Alert.alert('Coming Soon', 'Favorites will be available soon.')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <MenuItem
            icon="💬"
            label="Chat with Support"
            subtitle="Get help from our team"
            onPress={() => navigation.navigate('Support' as never)}
          />
          <MenuItem
            icon="❓"
            label="FAQ"
            subtitle="Frequently asked questions"
            onPress={() => Alert.alert('FAQ', 'FAQ section coming soon.')}
          />
          <MenuItem
            icon="📞"
            label="Call Us"
            subtitle="+971 800 VIP (847)"
            onPress={() => Alert.alert('Call Support', 'Phone support: +971 800 VIP (847)')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <MenuItem
            icon="⚙️"
            label="App Settings"
            subtitle="Notifications, language, theme"
            onPress={() => navigation.navigate('Settings' as never)}
          />
          <MenuItem
            icon="🔒"
            label="Privacy & Security"
            subtitle="Password, data, permissions"
            onPress={() => Alert.alert('Coming Soon', 'Privacy settings will be available soon.')}
          />
          <MenuItem
            icon="📄"
            label="Terms & Conditions"
            subtitle="Legal information"
            onPress={() => Alert.alert('Terms', 'Terms & Conditions — coming soon.')}
          />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        {/* App version */}
        <Text style={styles.versionText}>VIP Mobility v1.0.0</Text>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
  badge,
}: {
  icon: string;
  label: string;
  subtitle: string;
  onPress: () => void;
  badge?: string;
}) {
  const styles = getStyles();
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuContent}>
        <View style={styles.menuLabelRow}>
          <Text style={styles.menuLabel}>{label}</Text>
          {badge && (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  modeSwitchIcon: {
    fontSize: 14,
  },
  modeSwitchText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  userCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  userPhone: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  kycBadge: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  kycVerified: {
    backgroundColor: '#d1fae5',
  },
  kycPending: {
    backgroundColor: '#fef3c7',
  },
  kycText: {
    fontSize: 12,
    fontWeight: '700',
  },
  kycTextVerified: {
    color: '#065f46',
  },
  kycTextPending: {
    color: '#92400e',
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    gap: SPACING.md,
  },
  menuIcon: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  menuSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  menuBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#991b1b',
  },
  menuArrow: {
    fontSize: 22,
    color: COLORS.gray,
    fontWeight: '300',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff5f5',
  },
  logoutIcon: {
    fontSize: 18,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.gray,
    marginTop: SPACING.md,
  },
}); }
