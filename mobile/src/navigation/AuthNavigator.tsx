import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { KYCScreen } from '../screens/auth/KYCScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  KYC: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="KYC"
        component={KYCScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
