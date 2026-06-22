import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/constants/theme';
import { trpc } from '@/lib/trpc';

type Guest = {
  id: string;
  name: string;
  ticketType: string;
  ticketId: string;
  checkedIn: boolean;
  checkedInAt?: string;
};

type Tab = 'scanner' | 'guests';
type ScanResult = {
  status: 'success' | 'already_in' | 'unknown';
  guest?: Guest;
  ticketId?: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function ScanResultBanner({
  result,
  onDismiss,
}: {
  result: ScanResult;
  onDismiss: () => void;
}) {
  const config =
    result.status === 'success'
      ? {
          bg: colors.success,
          icon: 'checkmark-circle' as const,
          title: 'Checked In',
          sub: result.guest?.name ?? '',
          badge: result.guest?.ticketType,
        }
      : result.status === 'already_in'
        ? {
            bg: colors.warning,
            icon: 'alert-circle' as const,
            title: 'Already Checked In',
            sub: result.guest?.name ?? '',
            badge: result.guest?.ticketType,
          }
        : {
            bg: colors.error,
            icon: 'close-circle' as const,
            title: 'Ticket Not Found',
            sub: result.ticketId ?? '',
            badge: undefined,
          };

  return (
    <View style={[styles.resultBanner, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon} size={26} color="#fff" />
      <View style={styles.resultBody}>
        <Text style={styles.resultTitle}>{config.title}</Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {config.sub}
        </Text>
      </View>
      {config.badge ? (
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>{config.badge}</Text>
        </View>
      ) : null}
      <Pressable onPress={onDismiss} hitSlop={12} style={{ paddingLeft: 8 }}>
        <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </View>
  );
}

function ScannerTab({
  guests,
  onCheckIn,
}: {
  guests: Guest[];
  onCheckIn: (id: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const cooldown = useRef(false);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (cooldown.current) return;
      cooldown.current = true;

      const guest = guests.find((g) => g.ticketId === data);
      if (!guest) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLastResult({ status: 'unknown', ticketId: data });
      } else if (guest.checkedIn) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setLastResult({ status: 'already_in', guest });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onCheckIn(guest.id);
        setLastResult({
          status: 'success',
          guest: { ...guest, checkedIn: true },
        });
      }

      setTimeout(() => {
        cooldown.current = false;
      }, 2500);
    },
    [guests, onCheckIn]
  );

  if (!permission) return <View style={styles.flex} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionWrap}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionSub}>
          Grant camera access to scan QR codes on guest tickets.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.scannerWrap}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
        onBarcodeScanned={handleScan}
      />
      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayRow}>
          <View style={styles.overlaySide} />
          <View style={styles.scanWindow}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.scanHint}>Point camera at a ticket QR code</Text>
        </View>
      </View>
      {lastResult ? (
        <ScanResultBanner
          result={lastResult}
          onDismiss={() => setLastResult(null)}
        />
      ) : null}
    </View>
  );
}

// ─── Guest List ───────────────────────────────────────────────────────────────

const TICKET_COLORS: Record<string, string> = {
  VIP: '#F59E0B',
  'General Admission': colors.accent,
  'Early Bird': colors.success,
  RSVP: '#8B5CF6',
};

function GuestRow({
  guest,
  onToggle,
}: {
  guest: Guest;
  onToggle: (id: string) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.guestRow,
        pressed && styles.guestRowPressed,
      ]}
      onPress={() => onToggle(guest.id)}
    >
      <View
        style={[styles.guestAvatar, guest.checkedIn && styles.guestAvatarIn]}
      >
        <Text
          style={[
            styles.guestAvatarText,
            guest.checkedIn && styles.guestAvatarTextIn,
          ]}
        >
          {initials(guest.name)}
        </Text>
      </View>

      <View style={styles.guestInfo}>
        <Text style={styles.guestName} numberOfLines={1}>
          {guest.name}
        </Text>
        <Text
          style={[
            styles.ticketPillText,
            { color: TICKET_COLORS[guest.ticketType] ?? colors.textMuted },
          ]}
        >
          {guest.ticketType}
        </Text>
      </View>

      <View
        style={[styles.checkCircle, guest.checkedIn && styles.checkCircleIn]}
      >
        <Ionicons
          name={guest.checkedIn ? 'checkmark' : 'add'}
          size={15}
          color={guest.checkedIn ? '#fff' : colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function GuestListTab({
  guests,
  onToggle,
}: {
  guests: Guest[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? guests.filter(
        (g) =>
          g.name.toLowerCase().includes(query.toLowerCase()) ||
          g.ticketId.toLowerCase().includes(query.toLowerCase())
      )
    : guests;

  const checkedIn = guests.filter((g) => g.checkedIn).length;

  return (
    <View style={styles.flex}>
      <View style={styles.guestHeader}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Name or ticket ID…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            keyboardAppearance="light"
            selectionColor={colors.accent}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons
                name="close-circle"
                size={15}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.guestCount}>
          <Text style={styles.guestCountNum}>{checkedIn}</Text>
          <Text style={styles.guestCountDen}> / {guests.length}</Text>
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.guestList}
        renderItem={({ item }) => <GuestRow guest={item} onToggle={onToggle} />}
        ItemSeparatorComponent={() => <View style={styles.guestSep} />}
        ListEmptyComponent={
          <View style={styles.emptySearch}>
            <Text style={styles.emptySearchText}>
              No guests match "{query}"
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('scanner');

  const [event, setEvent] = useState<any>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEventData = useCallback(async () => {
    try {
      const data = await trpc.organizer.event.query({ id });
      setEvent(data);
      setGuests(data.guests);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEventData();
    setRefreshing(false);

    setShowRefreshToast(true);
    setTimeout(() => {
      setShowRefreshToast(false);
    }, 2500);
  };

  const handleCheckInByScan = useCallback(
    (guestId: string) => {
      setGuests((prev) =>
        prev.map((g) =>
          g.id === guestId
            ? { ...g, checkedIn: true, checkedInAt: new Date().toISOString() }
            : g
        )
      );
      trpc.organizer.checkInTicket.mutate({ ticketId: guestId }).catch(() => {
        // Revert on error by refetching the full event state
        trpc.organizer.event.query({ id }).then((data) => {
          setGuests(data.guests);
        });
      });
    },
    [id]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={{ color: colors.textMuted }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={{ color: colors.error, padding: 24 }}>
          {error ?? 'Event not found.'}
        </Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ color: colors.accent }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const checkedIn = guests.filter((g) => g.checkedIn).length;

  const handleToggleGuest = (guestId: string) => {
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    if (guest.checkedIn) {
      Alert.alert(
        'Undo Check-In',
        `Remove ${guest.name} from the checked-in list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              // Wait, the backend doesn't have an undo-checkin mutation yet.
              // We'll just update local state for now until the undo backend is implemented.
              setGuests((prev) =>
                prev.map((g) =>
                  g.id === guestId
                    ? { ...g, checkedIn: false, checkedInAt: undefined }
                    : g
                )
              );
            },
          },
        ]
      );
    } else {
      Haptics.selectionAsync();
      setGuests((prev) =>
        prev.map((g) =>
          g.id === guestId
            ? { ...g, checkedIn: true, checkedInAt: new Date().toISOString() }
            : g
        )
      );
      trpc.organizer.checkInTicket.mutate({ ticketId: guestId }).catch(() => {
        trpc.organizer.event.query({ id }).then((data) => {
          setGuests(data.guests);
        });
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {showRefreshToast && (
        <View style={styles.refreshToast}>
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.refreshToastText}>Data refreshed</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {event.name}
        </Text>
        <Pressable
          style={styles.backBtn}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={refreshing ? colors.textMuted : colors.text}
          />
        </Pressable>
      </View>

      {/* Event info */}
      <View style={styles.eventInfo}>
        <Text style={styles.eventInfoText}>
          {event.venue} · {event.city}
        </Text>
        <Text style={styles.eventInfoDate}>
          {formatDate(event.date)} · {formatTime(event.date)}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: colors.accent }]}>
            {checkedIn}
          </Text>
          <Text style={styles.statLabel}>Checked In</Text>
        </View>
        <View style={styles.statVDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statNum}>{guests.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statVDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statNum}>{guests.length - checkedIn}</Text>
          <Text style={styles.statLabel}>Remaining</Text>
        </View>
      </View>

      {/* Underline tab switcher */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'scanner' && styles.tabActive]}
          onPress={() => setActiveTab('scanner')}
        >
          <Ionicons
            name="qr-code-outline"
            size={14}
            color={activeTab === 'scanner' ? colors.accent : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'scanner' && styles.tabTextActive,
            ]}
          >
            Scan Tickets
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'guests' && styles.tabActive]}
          onPress={() => setActiveTab('guests')}
        >
          <Ionicons
            name="people-outline"
            size={14}
            color={activeTab === 'guests' ? colors.accent : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'guests' && styles.tabTextActive,
            ]}
          >
            Guest List
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      <View style={styles.flex}>
        {activeTab === 'scanner' ? (
          <ScannerTab guests={guests} onCheckIn={handleCheckInByScan} />
        ) : (
          <GuestListTab guests={guests} onToggle={handleToggleGuest} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER = 20;
const CORNER_W = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.text,
    marginHorizontal: 4,
    letterSpacing: -0.2,
  },

  // Event info
  eventInfo: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 3,
  },
  eventInfoText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSub,
  },
  eventInfoDate: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statNum: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -1,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statVDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // Underline tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  tabTextActive: {
    fontFamily: fonts.semiBold,
    color: colors.accent,
  },

  // Scanner
  scannerWrap: {
    flex: 1,
    backgroundColor: '#000',
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayRow: {
    flexDirection: 'row',
    height: 230,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanWindow: {
    width: 230,
    height: 230,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: 18,
  },
  scanHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.accent,
  },
  cTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderTopLeftRadius: 4,
  },
  cTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderTopRightRadius: 4,
  },
  cBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderBottomLeftRadius: 4,
  },
  cBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderBottomRightRadius: 4,
  },

  // Scan result
  resultBanner: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultBody: { flex: 1, gap: 1 },
  resultTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: '#fff' },
  resultSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  resultBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultBadgeText: { fontFamily: fonts.semiBold, fontSize: 11, color: '#fff' },

  // Permission
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  permissionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  permissionSub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  permissionBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Guest list
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 9 : 5,
    gap: 6,
  },
  scanBannerCloseText: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  refreshToast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  refreshToastText: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  guestCount: {},
  guestCountNum: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accent,
  },
  guestCountDen: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  guestList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 12,
  },
  guestRowPressed: { opacity: 0.6 },
  guestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarIn: {
    backgroundColor: colors.successDim,
    borderColor: `${colors.success}44`,
  },
  guestAvatarText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  guestAvatarTextIn: {
    color: colors.success,
  },
  guestInfo: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  guestName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  ticketPillText: {
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleIn: {
    backgroundColor: colors.success,
  },
  guestSep: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 50,
  },
  emptySearch: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptySearchText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
});
