import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { useTheme } from '../../themes/ThemeContext';
import { MainStackParamList } from '../../navigation/MainNavigator';

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Settings'>;
};

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const styles = getStyles();
  const { themeName, setThemeName, availableThemes, theme } = useTheme();
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [locationAlways, setLocationAlways] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Notifications */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <SettingToggle
            icon="●"
            label="Push Notifications"
            subtitle="Booking updates, promotions"
            value={pushNotifications}
            onValueChange={setPushNotifications}
          />
          <View style={styles.divider} />
          <SettingToggle
            icon="✉"
            label="Email Notifications"
            subtitle="Receipts, account updates"
            value={emailNotifications}
            onValueChange={setEmailNotifications}
          />
          <View style={styles.divider} />
          <SettingToggle
            icon="▯"
            label="SMS Notifications"
            subtitle="Trip alerts, OTP codes"
            value={smsNotifications}
            onValueChange={setSmsNotifications}
          />
        </View>

        {/* Location */}
        <Text style={styles.sectionTitle}>Location</Text>
        <View style={styles.card}>
          <SettingToggle
            icon="▼"
            label="Background Location"
            subtitle="Track trips when app is in background"
            value={locationAlways}
            onValueChange={setLocationAlways}
          />
        </View>

        {/* Theme */}
        <Text style={styles.sectionTitle}>App Theme</Text>
        <View style={styles.card}>
          {availableThemes.map(t => {
            const meta: Record<string, { bg: string; br: number; lbl: string; sub: string; preview: string; ls: number }> = {
              'default':      { bg: '#c9a84c', br: 8, lbl: 'VIP Classic',  sub: 'Rounded, gold accents, classic',        preview: 'Btn', ls: 0 },
              'luxury-flat':  { bg: '#1E1E1E', br: 0, lbl: 'Luxury Flat',  sub: 'Sharp corners, monochrome, uppercase',  preview: 'BTN', ls: 1 },
              'concept-car':  { bg: '#2C2A26', br: 2, lbl: 'Concept Car',  sub: 'Angular, warm sand tones, geometric',   preview: 'RIDE', ls: 2 },
              'sandbox':      { bg: '#000000', br: 0, lbl: 'Sandbox',      sub: 'Testing new designs (copy of Luxury)',  preview: 'TEST', ls: 1 },
            };
            const m = meta[t] ?? meta['default'];
            return (
              <TouchableOpacity
                key={t}
                style={[styles.settingRow, themeName === t && { backgroundColor: t === 'concept-car' ? '#F0EBE3' : COLORS.grayLight }]}
                onPress={() => setThemeName(t)}
              >
                <View style={{ width: 48, height: 32, backgroundColor: m.bg, borderRadius: m.br, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: t === 'concept-car' ? '#C8BFA8' : '#fff', fontSize: 8, fontWeight: '700', letterSpacing: m.ls }}>
                    {m.preview}
                  </Text>
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>{m.lbl}</Text>
                  <Text style={styles.settingSubtitle}>{m.sub}</Text>
                </View>
                {themeName === t && <Text style={{ fontSize: 16, color: COLORS.textPrimary, fontWeight: '700' }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <SettingRow icon="◯" label="Language" value="English" />
          <View style={styles.divider} />
          <SettingRow icon="¤" label="Currency" value="AED" />
          <View style={styles.divider} />
          <SettingRow icon="⊡" label="Distance Unit" value="Kilometers" />
        </View>

        {/* Data */}
        <Text style={styles.sectionTitle}>Data & Storage</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingIcon}>✕️</Text>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Clear Cache</Text>
              <Text style={styles.settingSubtitle}>Free up storage space</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingToggle({
  icon,
  label,
  subtitle,
  value,
  onValueChange,
}: {
  icon: string;
  label: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const styles = getStyles();
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.border, true: COLORS.accent }}
        thumbColor={COLORS.white}
      />
    </View>
  );
}

function SettingRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = getStyles();
  return (
    <TouchableOpacity style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Text style={styles.settingValue}>{value}</Text>
      <Text style={styles.settingArrow}>›</Text>
    </TouchableOpacity>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { padding: SPACING.xs },
  backIcon: { fontSize: 22, color: COLORS.textPrimary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  headerSpacer: { width: 30 },
  content: { padding: SPACING.md, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: SPACING.sm, marginTop: SPACING.md, marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: COLORS.grayLight, marginLeft: 54 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md,
  },
  settingIcon: { fontSize: 20, width: 26, textAlign: 'center', color: COLORS.textPrimary },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  settingSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  settingValue: { fontSize: 14, color: COLORS.textSecondary },
  settingArrow: { fontSize: 20, color: COLORS.gray, fontWeight: '300' },
}); }
