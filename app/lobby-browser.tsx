import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
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
import { C, R, FS } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { supabase } from '@/lib/supabase';
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

      if (!games || games.length === 0) {
        setEntries([]);
        return;
      }

      const gameIds = games.map((g) => g.id);

      // Fetch player counts for all games in one query
      const { data: players } = await db
        .from('players')
        .select('game_id')
        .in('game_id', gameIds) as { data: { game_id: string }[] | null };

      const countByGame: Record<string, number> = {};
      for (const p of players ?? []) {
        countByGame[p.game_id] = (countByGame[p.game_id] ?? 0) + 1;
      }

      // Fetch collection names for collection games
      const collectionIds = [...new Set(games.filter((g) => g.collection_id).map((g) => g.collection_id!))];
      const collectionNames: Record<string, string> = {};
      if (collectionIds.length > 0) {
        const { data: cols } = await db
          .from('collections')
          .select('id, name')
          .in('id', collectionIds) as { data: { id: string; name: string }[] | null };
        for (const c of cols ?? []) {
          collectionNames[c.id] = c.name;
        }
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

  function handleRefresh() {
    setRefreshing(true);
    fetchGames();
  }

  function joinGame(code: string) {
    router.push({ pathname: '/local-lobby', params: { joinCode: code } });
  }

  const canJoinByCode = inviteCode.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.title}>Join Game</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={C.gold} />
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
                tintColor={C.gold}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎬</Text>
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

        <View style={styles.inviteFooter}>
          <Text style={styles.inviteLabel}>Got an invite code?</Text>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    flex: 1,
    color: C.textPrimary,
    fontSize: FS.xl,
    fontWeight: '900',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, gap: 12, paddingBottom: 24 },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 80,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: C.textSub, fontSize: FS.lg, fontWeight: '600' },
  emptyHint: { color: C.textMuted, fontSize: FS.sm },
  gameCard: {
    backgroundColor: C.surface, borderRadius: R.card, padding: 18,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  gameCardLeft: { flex: 1, gap: 4 },
  collectionName: { color: C.textPrimary, fontSize: FS.base, fontWeight: '700' },
  playerCount: { color: C.textSub, fontSize: FS.sm },
  joinBtn: {
    backgroundColor: C.gold, borderRadius: R.btn,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  joinBtnText: { color: C.textOnGold, fontSize: FS.base, fontWeight: '800' },

  inviteFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  inviteLabel: {
    color: C.textMuted, fontSize: FS.sm, fontWeight: '600',
    letterSpacing: 0.5,
  },
  inviteRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inviteInput: {
    flex: 1, backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 1, borderColor: C.border, color: C.textPrimary,
    fontSize: FS.md, paddingHorizontal: 14, paddingVertical: 12,
    letterSpacing: 3, fontWeight: '700',
  },
  inviteJoinBtn: {
    backgroundColor: C.gold, borderRadius: R.btn,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  inviteJoinBtnDisabled: { opacity: 0.35 },
  inviteJoinBtnText: { color: C.textOnGold, fontSize: FS.base, fontWeight: '800' },
});
