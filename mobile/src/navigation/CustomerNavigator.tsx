import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
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
import { COLORS, BORDER_RADIUS } from '../utils/constants';

// Stack param lists
export type CustomerStackParamList = {
  CustomerTabs: undefined;
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
};

export type CustomerTabParamList = {
  Home: undefined;
  VehicleList: { category?: string; chauffeurAvailable?: boolean; city?: string } | undefined;
  BookingHistory: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<CustomerStackParamList>();
const Tab = createBottomTabNavigator<CustomerTabParamList>();

function TabIcon({
  icon,
  focused,
  label,
}: {
  icon: string;
  focused: boolean;
  label: string;
}) {
  return (
    <View style={[tabStyles.tabItem, focused && tabStyles.tabItemFocused]}>
      <Text style={[tabStyles.tabIcon, focused && tabStyles.tabIconFocused]}>{icon}</Text>
      <Text style={[tabStyles.tabLabel, focused && tabStyles.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: tabStyles.tabBar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" focused={focused} label="Home" />
          ),
        }}
      />
      <Tab.Screen
        name="VehicleList"
        component={VehicleListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🚗" focused={focused} label="Browse" />
          ),
        }}
      />
      <Tab.Screen
        name="BookingHistory"
        component={BookingHistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📋" focused={focused} label="Bookings" />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen
        name="VehicleDetail"
        component={VehicleDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Booking"
        component={BookingScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="ActiveTrip"
        component={ActiveTripScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="BookingHistory"
        component={BookingHistoryScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="VehicleList"
        component={VehicleListScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ChauffeurSearch"
        component={ChauffeurSearchScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="RentalSearch"
        component={RentalSearchScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.white,
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
    backgroundColor: '#fefce8',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabIconFocused: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelFocused: {
    color: COLORS.accent,
    fontWeight: '700',
  },
});
