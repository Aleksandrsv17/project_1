import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { useAppModeStore } from '../store/appModeStore';

// Customer screens
import { HomeScreen } from '../screens/customer/HomeScreen';
import { VehicleListScreen } from '../screens/customer/VehicleListScreen';
import { VehicleDetailScreen } from '../screens/customer/VehicleDetailScreen';
import { BookingScreen } from '../screens/customer/BookingScreen';
import { PaymentScreen } from '../screens/customer/PaymentScreen';
import { ActiveTripScreen } from '../screens/customer/ActiveTripScreen';
import { BookingHistoryScreen } from '../screens/customer/BookingHistoryScreen';
import { ProfileScreen } from '../screens/customer/ProfileScreen';
import { SettingsScreen } from '../screens/customer/SettingsScreen';
import { SupportScreen } from '../screens/customer/SupportScreen';
import { ChauffeurSearchScreen } from '../screens/customer/ChauffeurSearchScreen';
import { RentalSearchScreen } from '../screens/customer/RentalSearchScreen';

// Owner screens
import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { FleetMapScreen } from '../screens/owner/FleetMapScreen';
import { MyVehiclesScreen } from '../screens/owner/MyVehiclesScreen';
import { AddVehicleScreen } from '../screens/owner/AddVehicleScreen';
import { OwnerProfileScreen } from '../screens/owner/OwnerProfileScreen';

import { COLORS, BORDER_RADIUS } from '../utils/constants';

// ── Types ────────────────────────────────────────────────────────────────────

export type MainStackParamList = {
  MainTabs: undefined;
  VehicleDetail: { vehicleId: string };
  Booking: { vehicleId: string };
  Payment: { bookingId: string };
  ActiveTrip: { bookingId: string };
  BookingHistory: undefined;
  VehicleList: { category?: string; chauffeurAvailable?: boolean; city?: string } | undefined;
  Settings: undefined;
  Support: undefined;
  EditProfile: undefined;
  KYCStatus: undefined;
  ChauffeurSearch: undefined;
  RentalSearch: undefined;
  AddVehicle: undefined;
};

export type CustomerTabParamList = {
  Home: undefined;
  VehicleList: { category?: string; chauffeurAvailable?: boolean; city?: string } | undefined;
  BookingHistory: undefined;
  Profile: undefined;
};

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  FleetMap: undefined;
  MyVehicles: undefined;
  AddVehicle: undefined;
  OwnerProfile: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();
const CustomerTab = createBottomTabNavigator<CustomerTabParamList>();
const OwnerTab = createBottomTabNavigator<OwnerTabParamList>();

// ── Tab Icon ─────────────────────────────────────────────────────────────────

function TabIcon({ icon, focused, label }: { icon: string; focused: boolean; label: string }) {
  const ts = getTabStyles();
  return (
    <View style={[ts.tabItem, focused && ts.tabItemFocused]}>
      <Text style={ts.tabIcon}>{icon}</Text>
      <Text style={[ts.tabLabel, focused && ts.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

// ── Customer Tabs ────────────────────────────────────────────────────────────

function CustomerTabs() {
  return (
    <CustomerTab.Navigator screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: getTabStyles().tabBar }}>
      <CustomerTab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⌂" focused={focused} label="Home" /> }} />
      <CustomerTab.Screen name="VehicleList" component={VehicleListScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⌕" focused={focused} label="Browse" /> }} />
      <CustomerTab.Screen name="BookingHistory" component={BookingHistoryScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="☰" focused={focused} label="Bookings" /> }} />
      <CustomerTab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="○" focused={focused} label="Profile" /> }} />
    </CustomerTab.Navigator>
  );
}

// ── Owner Tabs ───────────────────────────────────────────────────────────────

function OwnerTabs() {
  return (
    <OwnerTab.Navigator screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: getTabStyles().tabBar }}>
      <OwnerTab.Screen name="OwnerDashboard" component={OwnerDashboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="≡" focused={focused} label="Dashboard" /> }} />
      <OwnerTab.Screen name="FleetMap" component={FleetMapScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="◎" focused={focused} label="Map" /> }} />
      <OwnerTab.Screen name="MyVehicles" component={MyVehiclesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="◆" focused={focused} label="My Fleet" /> }} />
      <OwnerTab.Screen name="AddVehicle" component={AddVehicleScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="+" focused={focused} label="Add" /> }} />
      <OwnerTab.Screen name="OwnerProfile" component={OwnerProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="○" focused={focused} label="Profile" /> }} />
    </OwnerTab.Navigator>
  );
}

// ── Mode-switching Tabs ──────────────────────────────────────────────────────

function MainTabs() {
  const mode = useAppModeStore((s) => s.mode);
  return mode === 'owner' ? <OwnerTabs /> : <CustomerTabs />;
}

// ── Stack (wraps tabs + all modal/push screens) ──────────────────────────────

export function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="BookingHistory" component={BookingHistoryScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="VehicleList" component={VehicleListScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Support" component={SupportScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ChauffeurSearch" component={ChauffeurSearchScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="RentalSearch" component={RentalSearchScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddVehicle" component={AddVehicleScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}

// ── Tab Styles ───────────────────────────────────────────────────────────────

function getTabStyles() { return StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: 68,
    paddingBottom: 8,
    paddingTop: 4,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.md,
    minWidth: 60,
  },
  tabItemFocused: {
    backgroundColor: COLORS.grayLight,
  },
  tabIcon: {
    fontSize: 22, color: COLORS.textSecondary,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelFocused: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
}); }
