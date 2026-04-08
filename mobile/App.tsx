import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider } from './src/themes/ThemeContext';
import { RootNavigator } from './src/navigation';
import { STRIPE_PUBLISHABLE_KEY } from './src/utils/constants';

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#c9a84c',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-eas-project-id', // TODO: Replace with real EAS project ID
    });
    console.log('[Notifications] Push token:', token.data);
    // TODO: Send token to backend: POST /users/push-token { token: token.data }
  } catch (err) {
    console.warn('[Notifications] Failed to get push token:', err);
  }
}

export default function App() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
              <StatusBar style="light" />
              <RootNavigator />
            </StripeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
