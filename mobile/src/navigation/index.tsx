import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { setOnAuthFailure } from '../api/client';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isInitialized, isLoading, initialize, logout } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    setOnAuthFailure(() => {
      logout();
    });
  }, [logout]);

  if (!isInitialized || isLoading) {
    return <LoadingSpinner fullScreen message="Loading VIP Mobility..." />;
  }

  return (
    <NavigationContainer theme={{ dark: true, colors: { primary: '#d9c0a4', background: '#000000', card: '#000000', text: '#FFFFFF', border: '#222222', notification: '#d9c0a4' } } as any}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <Stack.Screen name="Main" component={MainNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
