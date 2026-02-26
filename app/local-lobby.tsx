import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Clipboard,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Game, Player } from '@/lib/database.types';

type LobbyView = 'choice' | 'create' | 'join';

const db = supabase as unknown as { from: (t: string) => any };
const POLL_MS = 1000;

export default function LocalLobbyScreen() {
  const router = useRouter();
  const {
    activeMovies,
    setGame,
    setPlayerId,
    setPlayers,
    setIsHost,
    setCurrentTurn,
    setChallenges,
    setGameId,
  } = useAppStore();

  const [view, setView] = useState<LobbyView>('choice');
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [localGame, setLocalGame] = useState<Game | null>(null);
  const [localPlayers, setLocalPlayers] = useState<Player[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [localIsHost, setLocalIsHost] = useState(false);
  const [nameEntered, setNameEntered] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep latest values accessible inside the interval without stale closure
  const gameIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  const navigatedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  useEffect(() => {
    return () => stopPolling();
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(gameId: string, asHost: boolean) {
    gameIdRef.current = gameId;
    isHostRef.current = asHost;
    navigatedRef.current = false;
    stopPolling();

    pollRef.current = setInterval(async () => {
      const gId = gameIdRef.current;
      if (!gId) return;

      // Always refresh player list
      const { data: players } = await db
        .from('players')
        .select('*')
        .eq('game_id', gId)
        .order('created_at') as { data: Player[] | null };
      if (players) setLocalPlayers(players);

      // Non-hosts watch for game becoming active
      if (!isHostRef.current && !navigatedRef.current) {
        const { data: g } = await db
          .from('games')
          .select('*')
          .eq('id', gId)
          .single() as { data: Game | null };
        if (g?.status === 'active') {
          navigatedRef.current = true;
          stopPolling();
          setGame(g);
          setGameId(gId);
          setIsHost(false);
          router.replace('/game');
        }
      }
    }, POLL_MS);
  }

  function generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function initials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // ── Create game ──

  async function handleCreateGame() {
    if (!displayName.trim()) return;
    setLoading(true);
    try {
      const code = generateCode();
      const { data: newGame, error: gameErr } = await db
        .from('games')
        .insert({ game_code: code, status: 'lobby', mode: 'digital', multiplayer_type: 'local' })
        .select()
        .single() as { data: Game | null; error: any };
      if (gameErr || !newGame) throw gameErr ?? new Error('No game');

      const { data: newPlayer, error: playerErr } = await db
        .from('players')
        .insert({ game_id: newGame.id, display_name: displayName.trim() })
        .select()
        .single() as { data: Player | null; error: any };
      if (playerErr || !newPlayer) throw playerErr ?? new Error('No player');

      setLocalGame(newGame);
      setLocalPlayerId(newPlayer.id);
      setLocalIsHost(true);
      setNameEntered(true);

      setGame(newGame);
      setGameId(newGame.id);
      setPlayerId(newPlayer.id);
      setPlayers([newPlayer]);
      setIsHost(true);
      setCurrentTurn(null);
      setChallenges([]);

      startPolling(newGame.id, true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create game');
    } finally {
      setLoading(false);
    }
  }

  // ── Join game ──

  async function handleJoinGame() {
    if (!joinCode.trim() || !displayName.trim()) return;
    setLoading(true);
    try {
      const { data: foundGame, error: findErr } = await db
        .from('games')
        .select('*')
        .eq('game_code', joinCode.trim().toUpperCase())
        .eq('status', 'lobby')
        .single() as { data: Game | null; error: any };
      if (findErr || !foundGame) throw new Error('Game not found or already started');

      const { count } = await db
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', foundGame.id) as { count: number | null };
      if ((count ?? 0) >= 8) throw new Error('Game is full (8 players max)');

      const { data: newPlayer, error: playerErr } = await db
        .from('players')
        .insert({ game_id: foundGame.id, display_name: displayName.trim() })
        .select()
        .single() as { data: Player | null; error: any };
      if (playerErr || !newPlayer) throw playerErr ?? new Error('Could not join game');

      setLocalGame(foundGame);
      setLocalPlayerId(newPlayer.id);
      setLocalIsHost(false);
      setNameEntered(true);

      setGame(foundGame);
      setGameId(foundGame.id);
      setPlayerId(newPlayer.id);
      setIsHost(false);
      setCurrentTurn(null);
      setChallenges([]);

      startPolling(foundGame.id, false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not join game');
    } finally {
      setLoading(false);
    }
  }

  // ── Start game (host only) ──

  async function handleStartGame() {
    if (!localGame || localPlayers.length < 1) return;
    setLoading(true);
    try {
      const pool = [...activeMovies];
      if (pool.length < localPlayers.length + 1) throw new Error('Not enough movies available');

      // Shuffle pool
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      // Assign one starting card to each player
      const usedIds = new Set<string>();
      for (let i = 0; i < localPlayers.length; i++) {
        const startMovie = pool[i];
        usedIds.add(startMovie.id);
        await db
          .from('players')
          .update({ timeline: [startMovie.year] })
          .eq('id', localPlayers[i].id);
      }

      // Pick first turn movie (different from all starting cards)
      const remaining = pool.filter((m) => !usedIds.has(m.id));
      const firstTurnMovie = remaining[Math.floor(Math.random() * remaining.length)];
      const firstPlayer = localPlayers[0];

      await db
        .from('games')
        .update({ status: 'active' })
        .eq('id', localGame.id);

      await db.from('turns').insert({
        game_id: localGame.id,
        active_player_id: firstPlayer.id,
        movie_id: firstTurnMovie.id,
        status: 'drawing',
      });

      stopPolling();
      setPlayers(localPlayers);
      router.replace('/game');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start game');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──

  if (view === 'choice') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>←  Back</Text>
        </TouchableOpacity>
        <View style={styles.choiceCenter}>
          <Text style={styles.title}>Go Digital</Text>
          <Text style={styles.subtitle}>Up to 8 players — each on their own phone</Text>
          <View style={styles.choiceCards}>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => setView('create')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={40} color="#f5c518" />
              <Text style={styles.choiceCardTitle}>Create Game</Text>
              <Text style={styles.choiceCardSub}>Share the code with friends</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceCard, styles.choiceCardSecondary]}
              onPress={() => setView('join')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="login" size={40} color="#f5c518" />
              <Text style={styles.choiceCardTitle}>Join Game</Text>
              <Text style={styles.choiceCardSub}>Enter the host's code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Waiting room ──
  if (nameEntered && localGame) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.waitingHeader}>
          <Text style={styles.waitingLabel}>Game Code</Text>
          <TouchableOpacity
            onPress={() => Clipboard.setString(localGame.game_code)}
            style={styles.codeRow}
          >
            <Text style={styles.gameCode}>{localGame.game_code}</Text>
            <MaterialCommunityIcons name="content-copy" size={18} color="#f5c518" />
          </TouchableOpacity>
          <Text style={styles.codeHint}>Tap to copy · share with friends</Text>
        </View>

        <View style={styles.playerCountRow}>
          <Text style={styles.playerCountText}>{localPlayers.length} / 8 players</Text>
        </View>

        <ScrollView style={styles.playerList} contentContainerStyle={styles.playerListContent}>
          {localPlayers.map((p) => (
            <View key={p.id} style={styles.playerChip}>
              <View style={styles.playerAvatar}>
                <Text style={styles.playerAvatarText}>{initials(p.display_name)}</Text>
              </View>
              <Text style={styles.playerName}>{p.display_name}</Text>
              {p.id === localPlayerId && <Text style={styles.youBadge}>you</Text>}
            </View>
          ))}
        </ScrollView>

        {localIsHost ? (
          <TouchableOpacity
            style={[styles.startBtn, localPlayers.length < 1 && styles.startBtnDisabled]}
            onPress={handleStartGame}
            disabled={localPlayers.length < 1 || loading}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnText}>
              {loading ? 'Starting…' : 'Start Game →'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingForHost}>
            <Text style={styles.waitingForHostText}>Waiting for host to start…</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Create / Join form ──
  const isCreate = view === 'create';

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setView('choice')}>
        <Text style={styles.backBtnText}>←  Back</Text>
      </TouchableOpacity>

      <View style={styles.formCenter}>
        <Text style={styles.title}>{isCreate ? 'Create Game' : 'Join Game'}</Text>

        {!isCreate && (
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Game Code</Text>
            <TextInput
              style={styles.input}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              maxLength={6}
            />
          </View>
        )}

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Your Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor="#555"
            maxLength={20}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[
            styles.actionBtn,
            (!displayName.trim() || (!isCreate && !joinCode.trim())) && styles.actionBtnDisabled,
          ]}
          onPress={isCreate ? handleCreateGame : handleJoinGame}
          disabled={!displayName.trim() || (!isCreate && !joinCode.trim()) || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>
            {loading ? 'Loading…' : isCreate ? 'Create Game' : 'Join Game'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: FS.base },

  choiceCenter: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, gap: 24,
  },
  title: { color: C.textPrimary, fontSize: FS['2xl'], fontWeight: '900', textAlign: 'center' },
  subtitle: { color: C.textSub, fontSize: FS.base, textAlign: 'center' },
  choiceCards: { width: '100%', gap: 14 },
  choiceCard: {
    backgroundColor: C.surface, borderRadius: R.card, padding: 28,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.border,
  },
  choiceCardSecondary: { borderColor: C.goldFaint },
  choiceCardTitle: { color: C.textPrimary, fontSize: FS.lg, fontWeight: '800' },
  choiceCardSub: { color: C.textMuted, fontSize: FS.sm },

  formCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 20 },
  inputWrapper: { gap: 6 },
  inputLabel: {
    color: C.textSub, fontSize: FS.sm, fontWeight: '600',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1,
    borderColor: C.border, color: C.textPrimary, fontSize: FS.md + 1,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  actionBtn: {
    backgroundColor: C.gold, borderRadius: R.btn,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '800' },

  waitingHeader: { alignItems: 'center', paddingTop: 24, paddingBottom: 16, gap: 6 },
  waitingLabel: {
    color: C.textSub, fontSize: FS.sm, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameCode: {
    color: C.gold, fontSize: 42, fontWeight: '900',
    letterSpacing: 8, fontVariant: ['tabular-nums'],
  },
  codeHint: { color: C.textMuted, fontSize: FS.sm },
  playerCountRow: { alignItems: 'center', paddingVertical: 8 },
  playerCountText: { color: C.textSub, fontSize: FS.sm },
  playerList: { flex: 1, paddingHorizontal: 24 },
  playerListContent: { gap: 10, paddingBottom: 16 },
  playerChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: R.md, padding: 12, gap: 12, borderWidth: 1, borderColor: C.border,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: R.full,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
  },
  playerAvatarText: { color: C.textOnGold, fontSize: FS.sm, fontWeight: '800' },
  playerName: { color: C.textPrimary, fontSize: FS.base, fontWeight: '600', flex: 1 },
  youBadge: {
    color: C.gold, fontSize: FS.xs, fontWeight: '700',
    backgroundColor: C.goldFaint,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.xs,
  },
  startBtn: {
    backgroundColor: C.gold, margin: 24,
    borderRadius: R.btn, paddingVertical: 18, alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: C.textOnGold, fontSize: FS.md, fontWeight: '900' },
  waitingForHost: { margin: 24, paddingVertical: 18, alignItems: 'center' },
  waitingForHostText: { color: C.textSub, fontSize: FS.base },
});
