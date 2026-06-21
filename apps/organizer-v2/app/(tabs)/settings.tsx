import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { trpc } from '@/lib/trpc';

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && styles.rowPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text
        style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}
      >
        {label}
      </Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !destructive ? (
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

type Profile = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await trpc.user.profile.query();
      setProfile({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const displayFirstName =
    profile?.firstName ?? user?.name?.split(' ')[0] ?? '';
  const displayLastName =
    profile?.lastName ?? user?.name?.split(' ').slice(1).join(' ') ?? '';
  const fullName =
    [displayFirstName, displayLastName].filter(Boolean).join(' ') ||
    'Unknown User';
  const displayEmail = profile?.email ?? user?.email ?? '';

  const initials =
    [displayFirstName, displayLastName]
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            style={{ paddingVertical: 40 }}
            color={colors.accent}
          />
        ) : (
          <>
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.profileName}>{fullName}</Text>
              <Text style={styles.profileEmail}>{displayEmail}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.card}>
                <SettingsRow
                  icon="person-outline"
                  label="Name"
                  value={fullName}
                />
                <View style={styles.divider} />
                <SettingsRow
                  icon="mail-outline"
                  label="Email"
                  value={displayEmail}
                />
              </View>
            </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="code-slash-outline"
              label="Version"
              value="1.0.0"
            />
          </View>
        </View>

        <View style={[styles.section, { marginTop: 8 }]}>
          <View style={styles.card}>
            <SettingsRow
              icon="log-out-outline"
              label="Sign Out"
              onPress={handleSignOut}
              destructive
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    color: colors.text,
    letterSpacing: -0.8,
  },
  profile: {
    alignItems: 'center',
    paddingBottom: 36,
    gap: 4,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: '#FFFFFF',
  },
  profileName: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: colors.text,
  },
  profileEmail: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  rowPressed: {
    backgroundColor: colors.border,
  },
  rowLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  rowLabelDestructive: {
    color: colors.error,
  },
  rowValue: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    maxWidth: 180,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
});
