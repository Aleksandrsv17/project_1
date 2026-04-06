import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { OwnerNavigator } from './OwnerNavigator';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { setOnAuthFailure } from '../api/client';

export type RootStackParamList = {
  Auth: undefined;
  Customer: undefined;
  Owner: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isInitialized, isLoading, initialize, logout } = useAuthStore();

  // Initialize auth state from SecureStore on app start
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Wire up auth failure callback (e.g. refresh token expired)
  useEffect(() => {
    setOnAuthFailure(() => {
      logout();
    });
  }, [logout]);

  // Show splash/loading while restoring auth
  if (!isInitialized || isLoading) {
    return <LoadingSpinner fullScreen message="Loading VIP Mobility..." />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Not authenticated
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : user.role === 'owner' ? (
          // Owner dashboard
          <Stack.Screen name="Owner" component={OwnerNavigator} />
        ) : (
          // Customer (default)
          <Stack.Screen name="Customer" component={CustomerNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
