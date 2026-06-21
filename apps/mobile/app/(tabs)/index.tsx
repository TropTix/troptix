import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { trpc } from '@/lib/trpc';

// Deterministic accent color so each event card has a distinct tint.
const ACCENT_COLORS = [
  '#4F46E5',
  '#F59E0B',
  '#10B981',
  '#EC4899',
  '#8B5CF6',
  '#EF4444',
  '#3B82F6',
  '#14B8A6',
];
function accentForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

type OrganizerEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  imageUrl: string | null;
  isDraft: boolean;
  ticketsSold: number;
};

function EventCard({
  event,
  onPress,
}: {
  event: OrganizerEvent;
  onPress: () => void;
}) {
  const d = new Date(event.startDate);
  const monthStr = d
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
  const dayStr = d.toLocaleDateString('en-US', { day: 'numeric' });
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
  const timeStr = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(':00', '');
  const subtitle = `${dayOfWeek} ${timeStr} · ${event.venue || event.address}`;
  const accent = accentForId(event.id);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.dateCol}>
        <Text style={[styles.dateMonth, { color: accent }]}>{monthStr}</Text>
        <Text style={styles.dateDay}>{dayStr}</Text>
      </View>

      <View style={styles.verticalDivider} />

      <View style={styles.cardInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.eventName} numberOfLines={1}>
            {event.name}
          </Text>
          {event.isDraft && (
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>Draft</Text>
            </View>
          )}
        </View>
        <Text style={styles.eventSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.eventTickets}>
          {event.ticketsSold.toLocaleString()} tickets sold
        </Text>
      </View>

      <View style={styles.cardRight}>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [profileName, setProfileName] = useState<string>('');
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [eventsData, profileData] = await Promise.all([
        trpc.organizer.events.query(),
        trpc.user.profile.query(),
      ]);
      setEvents(eventsData);

      // Use the database firstName, fallback to Supabase name, then empty
      setProfileName(profileData.firstName || user?.name?.split(' ')[0] || '');

      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load data.');
    }
  }, [user?.name]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Group by month/year section header.
  const sections = useMemo(() => {
    const grouped: Record<string, OrganizerEvent[]> = {};
    events.forEach((event) => {
      const key = new Date(event.startDate)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        .toUpperCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    });
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [events]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {profileName ? (
            <Text style={styles.headerEyebrow}>Hello, {profileName}</Text>
          ) : null}
          <Text style={styles.headerTitle}>Events</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color={colors.textMuted}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              fetchEvents().finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              <View style={styles.sectionCard}>
                {item.data.map((event, index) => (
                  <React.Fragment key={event.id}>
                    <EventCard
                      event={event}
                      onPress={() => router.push(`/event/${event.id}`)}
                    />
                    {index < item.data.length - 1 && (
                      <View style={styles.divider} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="calendar-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>No events yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF9F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerLeft: { flex: 1 },
  headerEyebrow: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    color: colors.text,
    letterSpacing: -1,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#8A8A8A',
    marginBottom: 12,
    letterSpacing: 1,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  cardPressed: { backgroundColor: '#F9FAFB' },
  dateCol: { alignItems: 'center', width: 48 },
  dateMonth: {
    fontFamily: fonts.bold,
    fontSize: 12,
    marginBottom: 2,
  },
  dateDay: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.text,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 16,
    alignSelf: 'stretch',
    marginVertical: 2,
  },
  cardInfo: { flex: 1, justifyContent: 'center' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  eventName: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.text,
    flexShrink: 1,
  },
  draftBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  draftBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 4,
  },
  eventTickets: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#9CA3AF',
  },
  cardRight: { paddingLeft: 8 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  retryText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#FFF',
  },
});
