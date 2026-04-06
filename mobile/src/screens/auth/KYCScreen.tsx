import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { submitKYC } from '../../api/auth';
import { COLORS, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { AuthStackParamList } from '../../navigation/AuthNavigator';

type KYCScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'KYC'>;
};

type DocType = 'passport' | 'national_id' | 'drivers_license';

const DOC_TYPES: { value: DocType; label: string; icon: string }[] = [
  { value: 'passport', label: 'Passport', icon: '📘' },
  { value: 'national_id', label: 'National ID', icon: '🪪' },
  { value: 'drivers_license', label: "Driver's License", icon: '🚗' },
];

export function KYCScreen({ navigation }: KYCScreenProps) {
  const [docType, setDocType] = useState<DocType>('passport');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // TODO: Implement actual image picker using expo-image-picker
  function handlePickFront() {
    Alert.alert('Upload Front', 'In production: open camera or photo library', [
      { text: 'OK', onPress: () => setFrontImage('https://via.placeholder.com/300x200?text=ID+Front') },
    ]);
  }

  function handlePickBack() {
    Alert.alert('Upload Back', 'In production: open camera or photo library', [
      { text: 'OK', onPress: () => setBackImage('https://via.placeholder.com/300x200?text=ID+Back') },
    ]);
  }

  function handlePickSelfie() {
    Alert.alert('Take Selfie', 'In production: open front camera', [
      { text: 'OK', onPress: () => setSelfieImage('https://via.placeholder.com/200x200?text=Selfie') },
    ]);
  }

  async function handleSubmit() {
    if (!frontImage || !selfieImage) {
      Alert.alert('Missing Documents', 'Please upload your document front and a selfie.');
      return;
    }

    setIsLoading(true);
    try {
      await submitKYC({
        documentType: docType,
        documentNumber: 'PENDING_VERIFICATION',
        documentImageFront: frontImage,
        documentImageBack: backImage ?? undefined,
        selfieImage,
      });

      Alert.alert(
        'KYC Submitted',
        'Your identity verification has been submitted. You can continue using the app while we review your documents.',
        [{ text: 'Continue', onPress: () => navigation.navigate('Login') }]
      );
    } catch {
      Alert.alert('Submission Failed', 'Please try again or skip for now.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    Alert.alert(
      'Skip Verification',
      'Some features may be restricted until you verify your identity. You can complete this later in your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: () => navigation.navigate('Login') },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.stepBadge}>Identity Verification</Text>
          <Text style={styles.title}>Verify Your Identity</Text>
          <Text style={styles.subtitle}>
            This helps us keep VIP Mobility safe and secure for everyone.
          </Text>
        </View>

        {/* Doc Type Selector */}
        <Text style={styles.sectionTitle}>Document Type</Text>
        <View style={styles.docTypeRow}>
          {DOC_TYPES.map((dt) => (
            <TouchableOpacity
              key={dt.value}
              style={[styles.docTypeOption, docType === dt.value && styles.docTypeSelected]}
              onPress={() => setDocType(dt.value)}
            >
              <Text style={styles.docTypeIcon}>{dt.icon}</Text>
              <Text style={[styles.docTypeLabel, docType === dt.value && styles.docTypeLabelSelected]}>
                {dt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Document Front */}
        <Text style={styles.sectionTitle}>Document Front *</Text>
        <TouchableOpacity style={styles.uploadBox} onPress={handlePickFront}>
          {frontImage ? (
            <Image source={{ uri: frontImage }} style={styles.uploadedImage} resizeMode="cover" />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadIcon}>📄</Text>
              <Text style={styles.uploadText}>Tap to upload front of document</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Document Back (optional for passport) */}
        {docType !== 'passport' && (
          <>
            <Text style={styles.sectionTitle}>Document Back</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={handlePickBack}>
              {backImage ? (
                <Image source={{ uri: backImage }} style={styles.uploadedImage} resizeMode="cover" />
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Text style={styles.uploadIcon}>📄</Text>
                  <Text style={styles.uploadText}>Tap to upload back of document</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Selfie */}
        <Text style={styles.sectionTitle}>Selfie *</Text>
        <TouchableOpacity style={[styles.uploadBox, styles.selfieBox]} onPress={handlePickSelfie}>
          {selfieImage ? (
            <Image source={{ uri: selfieImage }} style={styles.selfieImage} resizeMode="cover" />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadIcon}>🤳</Text>
              <Text style={styles.uploadText}>Tap to take a selfie</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🔒 Your documents are encrypted and stored securely. We only use them for identity verification.
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Verification</Text>
          )}
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  docTypeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  docTypeOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  docTypeSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#fefce8',
  },
  docTypeIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  docTypeLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  docTypeLabelSelected: {
    color: '#78350f',
    fontWeight: '700',
  },
  uploadBox: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    height: 140,
    backgroundColor: COLORS.white,
  },
  selfieBox: {
    height: 180,
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  uploadIcon: {
    fontSize: 32,
  },
  uploadText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  selfieImage: {
    width: '100%',
    height: '100%',
  },
  infoBox: {
    backgroundColor: '#dbeafe',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: SPACING.lg,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  skipButton: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
