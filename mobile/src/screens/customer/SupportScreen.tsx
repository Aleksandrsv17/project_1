import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { CustomerStackParamList } from '../../navigation/CustomerNavigator';

type SupportScreenProps = {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'Support'>;
};

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'support';
  timestamp: Date;
}

const QUICK_TOPICS = [
  { label: 'Booking issue', message: 'I need help with a booking' },
  { label: 'Payment problem', message: 'I have a payment issue' },
  { label: 'Vehicle complaint', message: 'I want to report an issue with a vehicle' },
  { label: 'Account help', message: 'I need help with my account' },
  { label: 'KYC verification', message: 'I need help with KYC verification' },
  { label: 'Refund request', message: 'I would like to request a refund' },
];

export function SupportScreen({ navigation }: SupportScreenProps) {
  const styles = getStyles();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: `Hi ${user?.fullName?.split(' ')[0] || 'there'}! Welcome to VIP Mobility support. How can we help you today?`,
      sender: 'support',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // Auto-reply after short delay
    setTimeout(() => {
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        text: getAutoReply(text),
        sender: 'support',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reply]);
    }, 1000);
  }

  function getAutoReply(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('booking') || lower.includes('reservation'))
      return 'I can help with your booking. Could you please share your booking ID? You can find it in the Bookings tab.';
    if (lower.includes('payment') || lower.includes('charge') || lower.includes('refund'))
      return 'For payment issues, please provide your booking ID and we\'ll look into it right away. Refunds typically take 5-7 business days.';
    if (lower.includes('kyc') || lower.includes('verification') || lower.includes('identity'))
      return 'For KYC verification, please go to Profile > KYC Verification and upload a valid government-issued ID. Processing takes up to 24 hours.';
    if (lower.includes('vehicle') || lower.includes('car') || lower.includes('damage'))
      return 'Please describe the vehicle issue in detail. If there\'s damage, take photos and share them here. Our team will review within 2 hours.';
    if (lower.includes('account') || lower.includes('password') || lower.includes('email'))
      return 'For account changes, go to Profile > Personal Information. If you\'re locked out, we can help reset your password.';
    return 'Thank you for reaching out. A support agent will be with you shortly. Our average response time is under 15 minutes during business hours (9 AM - 9 PM GST).';
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Support</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListHeaderComponent={
            messages.length <= 1 ? (
              <View style={styles.quickTopics}>
                <Text style={styles.quickTopicsTitle}>Quick topics:</Text>
                <View style={styles.topicGrid}>
                  {QUICK_TOPICS.map(topic => (
                    <TouchableOpacity
                      key={topic.label}
                      style={styles.topicChip}
                      onPress={() => sendMessage(topic.message)}
                    >
                      <Text style={styles.topicChipText}>{topic.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.sender === 'user' ? styles.userBubble : styles.supportBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  item.sender === 'user' ? styles.userText : styles.supportText,
                ]}
              >
                {item.text}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  item.sender === 'user' ? styles.userTime : styles.supportTime,
                ]}
              >
                {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            placeholderTextColor={COLORS.gray}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backButton: { padding: SPACING.xs },
  backIcon: { fontSize: 22, color: COLORS.textPrimary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  onlineText: { fontSize: 11, color: '#10b981', fontWeight: '500' },
  headerSpacer: { width: 30 },
  messageList: { padding: SPACING.md, paddingBottom: SPACING.sm },
  messageBubble: {
    maxWidth: '80%', padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.sm,
  },
  userBubble: {
    backgroundColor: COLORS.primary, alignSelf: 'flex-end',
    borderBottomRightRadius: SPACING.xs,
  },
  supportBubble: {
    backgroundColor: COLORS.white, alignSelf: 'flex-start',
    borderBottomLeftRadius: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border,
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  userText: { color: COLORS.white },
  supportText: { color: COLORS.textPrimary },
  messageTime: { fontSize: 10, marginTop: 4 },
  userTime: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  supportTime: { color: COLORS.textSecondary },
  quickTopics: { marginBottom: SPACING.md },
  quickTopicsTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  topicChip: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  topicChipText: { fontSize: 13, color: COLORS.accent, fontWeight: '500' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.sm,
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm,
  },
  input: {
    flex: 1, backgroundColor: COLORS.grayLight, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: 14, color: COLORS.textPrimary, maxHeight: 100,
  },
  sendButton: {
    backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
}); }
