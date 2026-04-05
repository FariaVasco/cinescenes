import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { supabase } from '@/lib/supabase';

const lcClapperboard = require('@/assets/lc-clapperboard.png');
import { Game } from '@/lib/database.types';

const db = supabase as unknown as { from: (t: string) => any };

type LobbyEntry = {
  game: Game;
  playerCount: number;
  collectionName: string;
};

export default function LobbyBrowserScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<LobbyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      fetchGames();
      pollRef.current = setInterval(fetchGames, 5000);
      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    }, [])
  );

  async function fetchGames() {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: games } = await db
        .from('games')
        .select('*')
        .eq('status', 'lobby')
        .eq('visibility', 'public')
        .gt('created_at', tenMinAgo)
        .order('created_at', { ascending: false }) as { data: Game[] | null };

      if (!games || games.length === 0) { setEntries([]); return; }

      const gameIds = games.map((g) => g.id);

      const { data: players } = await db
        .from('players').select('game_id').in('game_id', gameIds) as { data: { game_id: string }[] | null };

      const countByGame: Record<string, number> = {};
      for (const p of players ?? []) {
        countByGame[p.game_id] = (countByGame[p.game_id] ?? 0) + 1;
      }

      const collectionIds = [...new Set(games.filter((g) => g.collection_id).map((g) => g.collection_id!))];
      const collectionNames: Record<string, string> = {};
      if (collectionIds.length > 0) {
        const { data: cols } = await db
          .from('collections').select('id, name').in('id', collectionIds) as { data: { id: string; name: string }[] | null };
        for (const c of cols ?? []) { collectionNames[c.id] = c.name; }
      }

      const result: LobbyEntry[] = games
        .map((g) => ({
          game: g,
          playerCount: countByGame[g.id] ?? 0,
          collectionName: g.game_mode === 'collection' && g.collection_id
            ? (collectionNames[g.collection_id] ?? 'Collection')
            : 'Classic',
        }))
        .filter((e) => e.playerCount > 0);

      setEntries(result);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() { setRefreshing(true); fetchGames(); }

  function joinGame(code: string) {
    router.push({ pathname: '/local-lobby', params: { joinCode: code } });
  }

  const canJoinByCode = inviteCode.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>

      {/* Geometric accent */}
      <View style={styles.accentTopRight} pointerEvents="none" />

      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.sectionLabel}>Online</Text>
          <Text style={styles.title}>Join Game</Text>
          <View style={styles.titleUnderline} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={C.ochre} />
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.game.id}
            contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={C.ochre}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Image source={lcClapperboard} style={styles.emptyIcon} resizeMode="contain" />
                <Text style={styles.emptyText}>No open games right now</Text>
                <Text style={styles.emptyHint}>Pull to refresh</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.gameCard}>
                <View style={styles.gameCardLeft}>
                  <Text style={styles.collectionName}>{item.collectionName}</Text>
                  <Text style={styles.playerCount}>
                    {item.playerCount} / {item.game.max_players} players
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.joinBtn}
                  onPress={() => joinGame(item.game.game_code)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.joinBtnText}>Join</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        {/* Invite code footer */}
        <View style={styles.inviteFooter}>
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <Text style={styles.inviteLabel}>Have an invite code?</Text>
            </View>
            <Text style={styles.inviteSub}>Enter the code your host shared with you</Text>
            <View style={styles.inviteRow}>
              <TextInput
                style={styles.inviteInput}
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={() => { if (canJoinByCode) joinGame(inviteCode.trim()); }}
              />
              <TouchableOpacity
                style={[styles.inviteJoinBtn, !canJoinByCode && styles.inviteJoinBtnDisabled]}
                onPress={() => joinGame(inviteCode.trim())}
                disabled={!canJoinByCode}
                activeOpacity={0.8}
              >
                <Text style={styles.inviteJoinBtnText}>Join →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Geometric accent
  accentTopRight: {
    position: 'absolute', top: -60, right: -60,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(74,158,196,0.07)',
  },

  // Header
  header: {
    borderBottomWidth: 2,
    borderBottomColor: C.inkFaint,
    paddingBottom: SP.sm,
  },
  headerText: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.xs,
    gap: 2,
  },
  sectionLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, letterSpacing: 2.5,
    textTransform: 'uppercase', color: C.textMuted,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'], color: C.ink, letterSpacing: 0.5,
  },
  titleUnderline: {
    width: 40, height: 2,
    backgroundColor: C.cerulean, marginTop: 4,
  },

  // States
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: SP.lg, paddingTop: SP.md, gap: 10, paddingBottom: SP.lg },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 8, paddingTop: 80,
  },
  emptyIcon: { width: 64, height: 64 },
  emptyText: {
    fontFamily: Fonts.bodyBold,
    color: C.textSub, fontSize: FS.lg,
  },
  emptyHint: {
    fontFamily: Fonts.label,
    color: C.textMuted, fontSize: FS.sm,
  },

  // Game card
  gameCard: {
    backgroundColor: C.surface,
    borderRadius: R.card, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: SP.md, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  gameCardLeft: { flex: 1, gap: 3 },
  collectionName: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.md, letterSpacing: 0.3,
  },
  playerCount: {
    fontFamily: Fonts.label,
    color: C.textSub, fontSize: FS.sm,
  },
  joinBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  joinBtnText: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.md, letterSpacing: 0.3,
  },

  // Invite footer
  inviteFooter: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
  },
  inviteCard: {
    backgroundColor: C.surface,
    borderRadius: R.card, borderWidth: 2, borderColor: C.ink,
    padding: SP.md, gap: 10,
  },
  inviteCardHeader: {
    borderBottomWidth: 2,
    borderBottomColor: C.ochre,
    paddingBottom: 8,
  },
  inviteLabel: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.lg, letterSpacing: 0.3,
  },
  inviteSub: {
    fontFamily: Fonts.label,
    color: C.textSub, fontSize: FS.sm, marginTop: -4,
  },
  inviteRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inviteInput: {
    flex: 1, backgroundColor: C.bg,
    borderRadius: R.md, borderWidth: 2, borderColor: C.ink,
    color: C.textPrimary, fontSize: FS.xl,
    paddingHorizontal: SP.md, paddingVertical: 10,
    letterSpacing: 6,
    fontFamily: Fonts.display,
    textAlign: 'center',
  },
  inviteJoinBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  inviteJoinBtnDisabled: { opacity: 0.35 },
  inviteJoinBtnText: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.md, letterSpacing: 0.3,
  },
});
