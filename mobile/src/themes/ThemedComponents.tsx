import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  TextInput,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from './ThemeContext';

// ── Shine Animation ──────────────────────────────────────────────────────────

function ShineOverlay({ active }: { active: boolean }) {
  const shineAnim = useRef(new Animated.Value(-1)).current;

  React.useEffect(() => {
    if (active) {
      shineAnim.setValue(-1);
      Animated.timing(shineAnim, {
        toValue: 2,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [active]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '30%',
          backgroundColor: 'rgba(255,255,255,0.25)',
          transform: [
            {
              translateX: shineAnim.interpolate({
                inputRange: [-1, 2],
                outputRange: [-100, 400],
              }),
            },
            { skewX: '-20deg' },
          ],
        }}
      />
    </Animated.View>
  );
}

// ── Primary Button ───────────────────────────────────────────────────────────

interface ThemedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'disabled' | 'outline';
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
}

export function ThemedButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  style,
  textStyle,
  disabled = false,
  loading = false,
}: ThemedButtonProps) {
  const { theme } = useTheme();
  const [pressed, setPressed] = React.useState(false);
  const btn = theme.button;

  const isDisabled = disabled || loading || variant === 'disabled';

  const bgColor =
    variant === 'primary' ? theme.colors.accent :
    variant === 'outline' || variant === 'secondary' ? 'transparent' :
    variant === 'disabled' ? theme.colors.disabled :
    theme.colors.accent;

  const txtColor =
    variant === 'primary' ? theme.colors.textOnAccent :
    variant === 'outline' || variant === 'secondary' ? theme.colors.textPrimary :
    variant === 'disabled' ? theme.colors.disabledText :
    theme.colors.textOnAccent;

  const borderColor =
    variant === 'outline' || variant === 'secondary' ? theme.colors.border : 'transparent';

  return (
    <TouchableOpacity
      onPress={isDisabled ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      activeOpacity={0.85}
      disabled={isDisabled}
      style={[
        {
          backgroundColor: bgColor,
          borderRadius: btn.borderRadius,
          paddingVertical: btn.paddingVertical,
          paddingHorizontal: btn.paddingHorizontal,
          borderWidth: variant === 'outline' || variant === 'secondary' ? 1 : 0,
          borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          overflow: 'hidden',
          opacity: isDisabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {icon && <View>{icon}</View>}
      <Text
        style={[
          {
            color: txtColor,
            fontSize: btn.fontSize,
            fontWeight: btn.fontWeight,
            letterSpacing: btn.letterSpacing,
            textTransform: btn.textTransform,
          },
          textStyle,
        ]}
      >
        {loading ? '...' : title}
      </Text>
      {btn.shineEffect && <ShineOverlay active={pressed} />}
    </TouchableOpacity>
  );
}

// ── Themed Input ─────────────────────────────────────────────────────────────

interface ThemedInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function ThemedInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  style,
  icon,
}: ThemedInputProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: theme.input.borderWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.input.borderRadius,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      {icon && <View>{icon}</View>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.gray}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{
          flex: 1,
          fontSize: theme.input.fontSize,
          color: theme.colors.textPrimary,
          paddingVertical: 13,
        }}
      />
    </View>
  );
}

// ── Themed Card ──────────────────────────────────────────────────────────────

interface ThemedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ThemedCard({ children, style }: ThemedCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.card.borderRadius,
          borderWidth: theme.card.borderWidth,
          borderColor: theme.colors.surfaceBorder,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: theme.card.shadowOpacity,
          shadowRadius: 8,
          elevation: theme.card.shadowOpacity > 0 ? 3 : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── Themed Tab Bar ───────────────────────────────────────────────────────────

interface ThemedTabProps {
  tabs: string[];
  active: number;
  onSelect: (index: number) => void;
  style?: ViewStyle;
}

export function ThemedTabs({ tabs, active, onSelect, style }: ThemedTabProps) {
  const { theme } = useTheme();

  return (
    <View style={[{ flexDirection: 'row', gap: theme.spacing.xs }, style]}>
      {tabs.map((label, i) => (
        <TouchableOpacity
          key={label}
          onPress={() => onSelect(i)}
          style={{
            flex: 1,
            backgroundColor: i === active ? theme.tab.activeBackground : theme.tab.inactiveBackground,
            borderRadius: theme.tab.borderRadius,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: i === active ? theme.tab.activeText : theme.tab.inactiveText,
              fontSize: 13,
              fontWeight: i === active ? '700' : '500',
              letterSpacing: theme.button.letterSpacing > 0 ? 1 : 0,
              textTransform: theme.button.textTransform,
            }}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Themed Search Bar ────────────────────────────────────────────────────────

interface ThemedSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSearch: () => void;
  placeholder?: string;
  style?: ViewStyle;
}

export function ThemedSearchBar({ value, onChangeText, onSearch, placeholder, style }: ThemedSearchBarProps) {
  const { theme } = useTheme();
  const [pressed, setPressed] = React.useState(false);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          borderWidth: theme.input.borderWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.input.borderRadius,
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? 'Search...'}
          placeholderTextColor={theme.colors.gray}
          style={{ flex: 1, fontSize: theme.input.fontSize, color: theme.colors.textPrimary, paddingVertical: 12 }}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
      </View>
      <TouchableOpacity
        onPress={onSearch}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          backgroundColor: theme.colors.primary,
          paddingHorizontal: theme.spacing.lg,
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Text style={{
          color: theme.colors.textOnPrimary,
          fontSize: theme.button.fontSize - 2,
          fontWeight: theme.button.fontWeight,
          letterSpacing: theme.button.letterSpacing,
          textTransform: theme.button.textTransform,
        }}>
          SEARCH
        </Text>
        {theme.button.shineEffect && <ShineOverlay active={pressed} />}
      </TouchableOpacity>
    </View>
  );
}
