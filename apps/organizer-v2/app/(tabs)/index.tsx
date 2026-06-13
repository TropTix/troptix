import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { Event, STUB_EVENTS } from '../../data/stub';

function formatTime(iso: string) {
  const d = new Date(iso);
  let timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  // Remove :00 for cleaner look if it's on the hour
  timeStr = timeStr.replace(':00', '');
  return timeStr;
}

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const d = new Date(event.date);
  const monthStr = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const dayStr = d.toLocaleDateString('en-US', { day: 'numeric' });
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
  
  const timeStr = formatTime(event.date);
  const subtitle = `${dayOfWeek} ${timeStr} · ${event.venue}`;
  const ticketsSold = event.ticketsSold ?? event.guests.length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.dateCol}>
        <Text style={styles.dateMonth}>{monthStr}</Text>
        <Text style={styles.dateDay}>{dayStr}</Text>
      </View>

      <View style={styles.verticalDivider} />

      <View style={styles.cardInfo}>
        <Text style={styles.eventName} numberOfLines={1}>
          {event.name}
        </Text>
        <Text style={styles.eventSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.eventTickets}>
          {ticketsSold.toLocaleString()} tickets sold
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
  const firstName = user?.name?.split(' ')[0] ?? 'Alex';

  const sections = useMemo(() => {
    const groupedEvents = STUB_EVENTS.reduce((acc, event) => {
      const d = new Date(event.date);
      const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(event);
      return acc;
    }, {} as Record<string, Event[]>);

    return Object.keys(groupedEvents).map(key => ({
      title: key,
      data: groupedEvents[key]
    }));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerEyebrow}>Hello, {firstName}</Text>
          <Text style={styles.headerTitle}>Events</Text>
        </View>
        <Pressable style={styles.addButton}>
          <Ionicons name="add" size={24} color="#FFF" />
        </Pressable>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <View style={styles.sectionCard}>
              {item.data.map((event, index) => (
                <React.Fragment key={event.id}>
                  <EventCard event={event} onPress={() => router.push(`/event/${event.id}`)} />
                  {index < item.data.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No events yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF9F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
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
    backgroundColor: '#6A63F6', 
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6A63F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
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
  cardPressed: {
    backgroundColor: '#F9FAFB',
  },
  dateCol: {
    alignItems: 'center',
    width: 48,
  },
  dateMonth: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#4F46E5', // blueish like in design
    marginBottom: 2,
  },
  dateDay: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.text,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  eventName: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  eventSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSub,
    marginBottom: 4,
  },
  eventTickets: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#9CA3AF',
  },
  cardRight: {
    paddingLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 16,
    alignSelf: 'stretch',
    marginVertical: 2,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textMuted,
  },
});
