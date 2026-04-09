import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { MyVehiclesScreen } from '../screens/owner/MyVehiclesScreen';
import { FleetMapScreen } from '../screens/owner/FleetMapScreen';
import { AddVehicleScreen } from '../screens/owner/AddVehicleScreen';
import { OwnerProfileScreen } from '../screens/owner/OwnerProfileScreen';
import { COLORS, BORDER_RADIUS } from '../utils/constants';

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  FleetMap: undefined;
  MyVehicles: undefined;
  AddVehicle: undefined;
  OwnerProfile: undefined;
};

export type OwnerStackParamList = {
  OwnerTabs: undefined;
  AddVehicle: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();
const Stack = createNativeStackNavigator<OwnerStackParamList>();

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
      <Text style={tabStyles.tabIcon}>{icon}</Text>
      <Text style={[tabStyles.tabLabel, focused && tabStyles.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

function OwnerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: tabStyles.tabBar,
      }}
    >
      <Tab.Screen
        name="OwnerDashboard"
        component={OwnerDashboardScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="≡" focused={focused} label="Dashboard" />
          ),
        }}
      />
      <Tab.Screen
        name="FleetMap"
        component={FleetMapScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◎" focused={focused} label="Map" />
          ),
        }}
      />
      <Tab.Screen
        name="MyVehicles"
        component={MyVehiclesScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◆" focused={focused} label="My Fleet" />
          ),
        }}
      />
      <Tab.Screen
        name="AddVehicle"
        component={AddVehicleScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="+" focused={focused} label="Add" />
          ),
        }}
      />
      <Tab.Screen
        name="OwnerProfile"
        component={OwnerProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="○" focused={focused} label="Profile" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function OwnerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OwnerTabs" component={OwnerTabs} />
      <Stack.Screen
        name="AddVehicle"
        component={AddVehicleScreen}
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
    color: COLORS.accent,
    fontWeight: '700',
  },
});
