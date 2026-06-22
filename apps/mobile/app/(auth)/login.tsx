import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

const RESEND_COOLDOWN = 45;

export default function LoginScreen() {
  const { sendOtp, verifyOtp } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleSendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    const { error } = await sendOtp(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert('Could not send code', error);
      return;
    }
    setSentTo(trimmed);
    setResendIn(RESEND_COOLDOWN);
    setTimeout(() => codeRef.current?.focus(), 400);
  };

  const handleResend = async () => {
    if (!sentTo || resendIn > 0) return;
    setLoading(true);
    const { error } = await sendOtp(sentTo);
    setLoading(false);
    if (error) {
      Alert.alert('Could not resend', error);
      return;
    }
    setResendIn(RESEND_COOLDOWN);
  };

  const handleVerify = async (codeOverride?: string) => {
    if (!sentTo) return;
    const trimmedCode = (codeOverride ?? code).trim();
    if (trimmedCode.length !== 6) {
      Alert.alert(
        'Invalid code',
        'Please enter the 6-digit code from your email.'
      );
      return;
    }
    setLoading(true);
    const { error } = await verifyOtp(sentTo, trimmedCode);
    setLoading(false);
    if (error) {
      Alert.alert(
        'Verification failed',
        'That code is invalid or expired. Try again or resend it.'
      );
      setCode('');
      return;
    }
    // AuthGuard in _layout.tsx reacts to the session change and redirects.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.hero}>
          <Text style={styles.wordmark}>TropTix</Text>
          <Text style={styles.role}>Organizer</Text>
        </View>

        {!sentTo ? (
          <View style={styles.form}>
            <Text style={styles.formHeading}>Welcome back.</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                returnKeyType="done"
                onSubmitEditing={handleSendCode}
                selectionColor={colors.accent}
                keyboardAppearance="light"
                autoFocus
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.buttonText}>Email me a sign-in code</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.formHeading}>Check your email.</Text>
            <Text style={styles.formSubheading}>
              {'We sent a 6-digit code to\n'}
              <Text style={styles.emailHighlight}>{sentTo}</Text>
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Code</Text>
              <TextInput
                ref={codeRef}
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  // Auto-submit when the 6th digit is entered.
                  if (v.length === 6) handleVerify(v);
                }}
                returnKeyType="done"
                onSubmitEditing={() => handleVerify()}
                selectionColor={colors.accent}
                keyboardAppearance="light"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={() => handleVerify()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.buttonText}>Verify code</Text>
              )}
            </Pressable>

            <View style={styles.resendRow}>
              {resendIn > 0 ? (
                <Text style={styles.hint}>Resend in {resendIn}s</Text>
              ) : (
                <Pressable onPress={handleResend} disabled={loading}>
                  <Text style={styles.resendLink}>Resend code</Text>
                </Pressable>
              )}
              <Text style={styles.sep}> · </Text>
              <Pressable
                onPress={() => {
                  setSentTo(null);
                  setCode('');
                  setResendIn(0);
                }}
              >
                <Text style={styles.resendLink}>Use a different email</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hero: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingBottom: 44,
  },
  wordmark: {
    fontFamily: fonts.extraBold,
    fontSize: 44,
    color: colors.text,
    letterSpacing: -1.5,
  },
  role: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  form: { paddingHorizontal: 28, paddingBottom: 36 },
  formHeading: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.text,
    marginBottom: 8,
  },
  formSubheading: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 24,
  },
  emailHighlight: { fontFamily: fonts.semiBold, color: colors.text },
  field: { marginBottom: 14 },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  codeInput: {
    fontFamily: fonts.semiBold,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    flexWrap: 'wrap',
  },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  sep: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  resendLink: { fontFamily: fonts.medium, fontSize: 13, color: colors.accent },
});
