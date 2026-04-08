import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../themes/ThemeContext';
import { SPACING } from '../../utils/constants';
import { AuthStackParamList } from '../../navigation/AuthNavigator';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

function ShineButton({ title, onPress, disabled, loading, theme }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; theme: any;
}) {
  const shineAnim = React.useRef(new Animated.Value(-1)).current;
  const [pressed, setPressed] = React.useState(false);

  React.useEffect(() => {
    if (pressed && theme.button.shineEffect) {
      shineAnim.setValue(-1);
      Animated.timing(shineAnim, { toValue: 2, duration: 600, useNativeDriver: true }).start();
    }
  }, [pressed]);

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      activeOpacity={0.85}
      style={{
        backgroundColor: theme.colors.accent,
        borderRadius: theme.button.borderRadius,
        paddingVertical: theme.button.paddingVertical,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        opacity: disabled ? 0.7 : 1,
        overflow: 'hidden',
      }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
      ) : (
        <Text style={{
          color: theme.colors.textOnAccent,
          fontWeight: theme.button.fontWeight,
          fontSize: theme.button.fontSize,
          letterSpacing: theme.button.letterSpacing,
          textTransform: theme.button.textTransform,
        }}>{title}</Text>
      )}
      {theme.button.shineEffect && pressed && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: 0, bottom: 0, width: '30%',
          backgroundColor: 'rgba(255,255,255,0.25)',
          transform: [
            { translateX: shineAnim.interpolate({ inputRange: [-1, 2], outputRange: [-100, 400] }) },
            { skewX: '-20deg' },
          ],
        }} />
      )}
    </TouchableOpacity>
  );
}

export function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const { login, isLoading } = useAuthStore();
  const { theme } = useTheme();

  function validateForm(): boolean {
    let valid = true;
    setEmailError(''); setPasswordError('');
    if (!email.trim()) { setEmailError('Email is required'); valid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Enter a valid email'); valid = false; }
    if (!password) { setPasswordError('Password is required'); valid = false; }
    else if (password.length < 8) { setPasswordError('Password must be at least 8 characters'); valid = false; }
    return valid;
  }

  async function handleLogin() {
    if (!validateForm()) return;
    try { await login(email.trim().toLowerCase(), password); }
    catch (err: unknown) { Alert.alert('Login Failed', err instanceof Error ? err.message : 'Login failed'); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SPACING.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: SPACING.xl }}>
            <Text style={{
              fontSize: theme.typography.headerSize + 10,
              fontWeight: theme.typography.headerWeight,
              color: theme.colors.accent,
              letterSpacing: theme.typography.headerLetterSpacing,
              textTransform: theme.button.textTransform,
            }}>VIP Mobility</Text>
            <Text style={{ fontSize: 14, color: theme.colors.gray, marginTop: 4, letterSpacing: theme.typography.headerLetterSpacing }}>
              Premium Vehicle Rentals
            </Text>
          </View>

          {/* Form Card */}
          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.card.borderRadius > 0 ? 16 : 0,
            padding: SPACING.lg,
            borderWidth: theme.card.borderWidth,
            borderColor: theme.colors.surfaceBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: theme.card.shadowOpacity > 0 ? 0.15 : 0,
            shadowRadius: 24,
            elevation: theme.card.shadowOpacity > 0 ? 8 : 0,
          }}>
            <Text style={{
              fontSize: theme.typography.headerSize,
              fontWeight: theme.typography.headerWeight,
              color: theme.colors.textPrimary,
              letterSpacing: theme.typography.headerLetterSpacing,
              marginBottom: 4,
            }}>Welcome back</Text>
            <Text style={{ fontSize: 14, color: theme.colors.textSecondary, marginBottom: SPACING.lg }}>
              Sign in to your account
            </Text>

            {/* Email */}
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: SPACING.xs,
                letterSpacing: theme.button.letterSpacing > 0 ? 1 : 0,
                textTransform: theme.button.textTransform,
              }}>Email</Text>
              <TextInput
                style={{
                  borderWidth: theme.input.borderWidth, borderColor: emailError ? theme.colors.error : theme.colors.border,
                  borderRadius: theme.input.borderRadius, paddingHorizontal: SPACING.md,
                  paddingVertical: Platform.OS === 'ios' ? 14 : 11,
                  fontSize: theme.input.fontSize, color: theme.colors.textPrimary, backgroundColor: theme.colors.background,
                }}
                value={email} onChangeText={t => { setEmail(t); setEmailError(''); }}
                placeholder="you@example.com" placeholderTextColor={theme.colors.gray}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              />
              {emailError ? <Text style={{ fontSize: 12, color: theme.colors.error, marginTop: 4 }}>{emailError}</Text> : null}
            </View>

            {/* Password */}
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: SPACING.xs,
                letterSpacing: theme.button.letterSpacing > 0 ? 1 : 0,
                textTransform: theme.button.textTransform,
              }}>Password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={{
                    borderWidth: theme.input.borderWidth, borderColor: passwordError ? theme.colors.error : theme.colors.border,
                    borderRadius: theme.input.borderRadius, paddingHorizontal: SPACING.md, paddingRight: 50,
                    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
                    fontSize: theme.input.fontSize, color: theme.colors.textPrimary, backgroundColor: theme.colors.background,
                  }}
                  value={password} onChangeText={t => { setPassword(t); setPasswordError(''); }}
                  placeholder="Enter your password" placeholderTextColor={theme.colors.gray}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: SPACING.md, top: 0, bottom: 0, justifyContent: 'center' }}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              {passwordError ? <Text style={{ fontSize: 12, color: theme.colors.error, marginTop: 4 }}>{passwordError}</Text> : null}
            </View>

            {/* Forgot */}
            <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: SPACING.lg }}>
              <Text style={{ fontSize: 13, color: theme.colors.accent, fontWeight: '500' }}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login Button with shine */}
            <ShineButton title="Sign In" onPress={handleLogin} disabled={isLoading} loading={isLoading} theme={theme} />

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, gap: SPACING.sm }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            </View>

            {/* Register Link */}
            <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => navigation.navigate('Register')}>
              <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
                Don't have an account?{' '}
                <Text style={{ color: theme.colors.accent, fontWeight: '600' }}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
