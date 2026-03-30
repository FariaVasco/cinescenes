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
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { C, R, FS } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Game, Movie, Player } from '@/lib/database.types';
import { fetchRandomInsaneMovie } from '@/lib/tmdb-insane';

type LobbyView = 'choice' | 'create' | 'join';
type Visibility = 'public' | 'invite_only';

const db = supabase as unknown as { from: (t: string) => any };
const POLL_MS = 1000;

export default function LocalLobbyScreen() {
  const router = useRouter();
  const { joinCode: joinCodeParam, startView } = useLocalSearchParams<{ joinCode?: string; startView?: string }>();
  const {
    activeMovies,
    setActiveMovies,
    setGame,
    setPlayerId,
    setPlayers,
    setIsHost,
    setCurrentTurn,
    setChallenges,
    setGameId,
    setStartingMovieIds,
    selectedGameMode,
    selectedCollectionId,
  } = useAppStore();

  const [view, setView] = useState<LobbyView>(
    startView === 'create' ? 'create' : joinCodeParam ? 'join' : 'choice'
  );
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState(joinCodeParam ?? '');
  const [visibility, setVisibility] = useState<Visibility>('invite_only');
  const [loading, setLoading] = useState(false);
  const [localGame, setLocalGame] = useState<Game | null>(null);
  const [localPlayers, setLocalPlayers] = useState<Player[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [localIsHost, setLocalIsHost] = useState(false);
  const [nameEntered, setNameEntered] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(8);

  const nameInputRef = useRef<TextInput>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep latest values accessible inside the interval without stale closure
  const gameIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  const navigatedRef = useRef(false);
  const playerIdRef = useRef<string | null>(null);

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
      if (!gId || navigatedRef.current) return;

      const [{ data: players }, { data: g }] = await Promise.all([
        db.from('players').select('*').eq('game_id', gId).order('created_at') as Promise<{ data: Player[] | null }>,
        db.from('games').select('*').eq('id', gId).single() as Promise<{ data: Game | null }>,
      ]);

      if (players) setLocalPlayers(players);
      if (!g) return;

      // Game was cancelled (by host action or pg_cron stale cleanup)
      if (g.status === 'cancelled') {
        navigatedRef.current = true;
        stopPolling();
        Alert.alert(
          'Game closed',
          isHostRef.current ? 'The lobby has been closed.' : 'The host closed the game.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      // Client-side stale detection (fallback if pg_cron is not available)
      const stale = new Date(g.created_at).getTime() < Date.now() - 10 * 60 * 1000;
      if (g.status === 'lobby' && stale) {
        navigatedRef.current = true;
        stopPolling();
        if (isHostRef.current) {
          await db.from('games').update({ status: 'cancelled' }).eq('id', gId);
        }
        Alert.alert(
          'Lobby expired',
          'This lobby was open for more than 10 minutes and has been closed.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      // Non-host: watch for game becoming active
      if (!isHostRef.current && g.status === 'active') {
        navigatedRef.current = true;
        stopPolling();
        setGame(g);
        setGameId(gId);
        setIsHost(false);
        router.replace('/game');
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
        .insert({
          game_code: code,
          status: 'lobby',
          mode: 'digital',
          multiplayer_type: 'local',
          game_mode: selectedGameMode,
          collection_id: selectedCollectionId,
          max_players: maxPlayers,
          visibility,
        })
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
      playerIdRef.current = newPlayer.id;
      setLocalIsHost(true);
      setLocalPlayers([newPlayer]);
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
      if ((count ?? 0) >= (foundGame.max_players ?? 8)) throw new Error(`Game is full (${foundGame.max_players ?? 8} players max)`);

      const { data: newPlayer, error: playerErr } = await db
        .from('players')
        .insert({ game_id: foundGame.id, display_name: displayName.trim() })
        .select()
        .single() as { data: Player | null; error: any };
      if (playerErr || !newPlayer) throw playerErr ?? new Error('Could not join game');

      setLocalGame(foundGame);
      setLocalPlayerId(newPlayer.id);
      playerIdRef.current = newPlayer.id;
      setLocalIsHost(false);
      setMaxPlayers(foundGame.max_players ?? 8);
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

  async function handleMaxPlayersChange(delta: number) {
    const next = Math.min(10, Math.max(2, maxPlayers + delta));
    setMaxPlayers(next);
    if (localGame) {
      await db.from('games').update({ max_players: next }).eq('id', localGame.id);
    }
  }

  // ── Cancel / Leave lobby ──

  async function handleLeaveWaitingRoom() {
    if (localIsHost && localGame) {
      const { error } = await db.from('games').update({ status: 'cancelled' }).eq('id', localGame.id);
      if (error) Alert.alert('Cancel failed', `${error.message} (${error.code})`);
    } else {
      const pid = playerIdRef.current ?? localPlayerId;
      if (pid) {
        const { data: deleted, error } = await db.from('players').delete().eq('id', pid).select();
        if (error) {
          Alert.alert('Leave failed', `${error.message} (${error.code})`);
        } else if (!deleted || deleted.length === 0) {
          Alert.alert('Leave debug', `Delete ran but matched 0 rows.\npid: ${pid}`);
        }
      } else {
        Alert.alert('Leave debug', 'No player ID in state or ref.');
      }
    }
    navigatedRef.current = true;
    stopPolling();
    router.back();
  }

  useEffect(() => {
    if (!nameEntered) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleLeaveWaitingRoom();
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameEntered, localGame, localIsHost]);

  // ── Start game (host only) ──

  async function handleStartGame() {
    if (!localGame || localPlayers.length < 1) return;
    setLoading(true);
    try {
      let firstTurnMovie!: Movie;

      const startingMovieIdsList: string[] = [];

      if (localGame.game_mode === 'insane') {
        // Insane Mode: one starting card per player (from TMDb, like standard mode).
        // Collected into a buffer so we call setActiveMovies once (avoids stale closure).
        const insaneMoviesBuffer: Movie[] = [];
        const usedYears = new Set<number>();
        for (const player of localPlayers) {
          let m: Movie;
          let attempts = 0;
          do {
            m = await fetchRandomInsaneMovie(db);
            attempts++;
          } while (usedYears.has(m.year) && attempts < 30);
          usedYears.add(m.year);
          startingMovieIdsList.push(m.id);
          insaneMoviesBuffer.push(m);
          await db.from('players').update({ timeline: [m.year], coins: 5 }).eq('id', player.id);
        }

        // First turn movie (the trailer players will watch on turn 1)
        firstTurnMovie = await fetchRandomInsaneMovie(db);
        insaneMoviesBuffer.push(firstTurnMovie);
        // Add all at once so game.tsx can resolve them without a DB re-fetch
        setActiveMovies([...activeMovies, ...insaneMoviesBuffer]);
      } else {
        // Standard / Collection: use pre-loaded pool
        let pool: typeof activeMovies;
        if (localGame.game_mode === 'collection' && localGame.collection_id) {
          const { data: col } = await db
            .from('collections')
            .select('tag')
            .eq('id', localGame.collection_id)
            .single() as { data: { tag: string } | null };
          pool = col
            ? activeMovies.filter((m) => (m.tags ?? []).includes(col.tag))
            : activeMovies.filter((m) => m.standard_pool === true);
        } else {
          pool = activeMovies.filter((m) => m.standard_pool === true);
        }
        if (pool.length < localPlayers.length + 1) throw new Error('Not enough movies available');

        // Shuffle pool
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        // Assign one starting card to each player
        for (let i = 0; i < localPlayers.length; i++) {
          const startMovie = pool[i];
          startingMovieIdsList.push(startMovie.id);
          await db
            .from('players')
            .update({ timeline: [startMovie.year], coins: 5 })
            .eq('id', localPlayers[i].id);
        }

        const usedSet = new Set(startingMovieIdsList);
        const remaining = pool.filter((m) => !usedSet.has(m.id));
        firstTurnMovie = remaining[Math.floor(Math.random() * remaining.length)];
      }

      const firstPlayer = localPlayers[0];

      // Mark game active BEFORE inserting phantom turns so RLS policies (if any) allow the inserts
      await db
        .from('games')
        .update({ status: 'active' })
        .eq('id', localGame.id);

      // Record each starting card as a completed turn so all devices exclude it from future draws.
      // Also store in Zustand so the host device has a local backup.
      setStartingMovieIds(startingMovieIdsList);
      for (const [i, movieId] of startingMovieIdsList.entries()) {
        const { error: phantomErr } = await db.from('turns').insert({
          game_id: localGame.id,
          active_player_id: localPlayers[i].id,
          movie_id: movieId,
          status: 'complete',
          winner_id: localPlayers[i].id,
        });
        if (phantomErr) {
          console.warn('[LOBBY] phantom turn insert failed:', phantomErr.message, phantomErr.code);
        }
      }

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
        <BackButton onPress={() => router.back()} />
        <View style={styles.choiceCenter}>
          <Text style={styles.title}>Go Digital</Text>
          <Text style={styles.subtitle}>Up to 10 players — each on their own phone</Text>
          <View style={styles.choiceCards}>
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => router.push('/mode-select')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={40} color="#f5c518" />
              <Text style={styles.choiceCardTitle}>Create Game</Text>
              <Text style={styles.choiceCardSub}>Share the code with friends</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceCard, styles.choiceBrowseCard]}
              onPress={() => router.push('/lobby-browser')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="earth" size={40} color="#f5c518" />
              <Text style={styles.choiceCardTitle}>Browse Open Games</Text>
              <Text style={styles.choiceCardSub}>Jump into a public game</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceCard, styles.choiceCardSecondary]}
              onPress={() => setView('join')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="login" size={40} color="#f5c518" />
              <Text style={styles.choiceCardTitle}>Join with Code</Text>
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
        <BackButton
          onPress={handleLeaveWaitingRoom}
          label={localIsHost ? 'Cancel Game' : 'Leave'}
          icon={localIsHost ? 'close' : 'chevron-left'}
        />
        <View style={styles.waitingHeader}>
          <Text style={styles.waitingLabel}>Game Code</Text>
          <TouchableOpacity
            onPress={() => Clipboard.setString(localGame.game_code)}
            style={styles.codeRow}
          >
            <Text style={styles.gameCode}>{localGame.game_code}</Text>
            <MaterialCommunityIcons name="content-copy" size={18} color="#f5c518" />
          </TouchableOpacity>
          <Text style={styles.codeHint}>
            {localGame.visibility === 'invite_only'
              ? "Invite-only · won't appear in public games · share this code to invite"
              : 'Open to everyone · anyone can join from the list · or share this code'}
          </Text>
        </View>

        <View style={styles.playerCountRow}>
          {localIsHost ? (
            <View style={styles.maxStepperWrap}>
              <Text style={styles.maxStepperLabel}>Max players</Text>
              <View style={styles.maxPlayersStepper}>
                <TouchableOpacity
                  onPress={() => handleMaxPlayersChange(-1)}
                  style={styles.stepperBtn}
                  disabled={maxPlayers <= 2}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.stepperBtnText, maxPlayers <= 2 && styles.stepperBtnDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperCount}>{maxPlayers}</Text>
                <TouchableOpacity
                  onPress={() => handleMaxPlayersChange(1)}
                  style={styles.stepperBtn}
                  disabled={maxPlayers >= 10}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.stepperBtnText, maxPlayers >= 10 && styles.stepperBtnDisabled]}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.playerCountText}>{localPlayers.length} joined</Text>
            </View>
          ) : (
            <Text style={styles.playerCountText}>{localPlayers.length} / {maxPlayers} players</Text>
          )}
        </View>

        <ScrollView style={styles.playerList} contentContainerStyle={styles.playerListContent}>
          {localPlayers.map((p, i) => {
            const isHost = i === 0;
            return (
              <View key={p.id} style={styles.playerChip}>
                <View style={styles.playerChipTop}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{initials(p.display_name)}</Text>
                  </View>
                  <Text style={styles.playerName}>{p.display_name}</Text>
                  {isHost && <Text style={styles.hostBadge}>host</Text>}
                  {p.id === localPlayerId && <Text style={styles.youBadge}>you</Text>}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {localIsHost ? (
          <CinemaButton
            size="lg"
            onPress={handleStartGame}
            disabled={localPlayers.length < 1 || loading}
            style={styles.startBtn}
          >
            {loading ? 'Starting…' : 'START GAME →'}
          </CinemaButton>
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
  const canSubmit = displayName.trim().length > 0 && (isCreate || joinCode.trim().length > 0);
  const handleSubmit = isCreate ? handleCreateGame : handleJoinGame;

  return (
    <SafeAreaView style={styles.container}>
      <BackButton onPress={() => setView('choice')} />

      <KeyboardAvoidingView
        style={styles.formCenter}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Text style={styles.title}>{isCreate ? 'Create Game' : 'Join Game'}</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Your Name</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor="#555"
            maxLength={20}
            returnKeyType={isCreate ? 'go' : 'next'}
            onSubmitEditing={() => {
              if (isCreate) { if (canSubmit && !loading) handleSubmit(); }
              else { /* focus code input below */ }
            }}
            autoFocus
          />
        </View>

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
              returnKeyType="go"
              onSubmitEditing={() => { if (canSubmit && !loading) handleSubmit(); }}
            />
          </View>
        )}

        {isCreate && (
          <View style={styles.visibilityToggleWrap}>
            <Text style={styles.inputLabel}>Visibility</Text>
            <View style={styles.visibilityToggle}>
              <TouchableOpacity
                style={[styles.visibilityOption, visibility === 'invite_only' && styles.visibilityOptionActive]}
                onPress={() => setVisibility('invite_only')}
              >
                <Text style={[styles.visibilityOptionText, visibility === 'invite_only' && styles.visibilityOptionTextActive]}>
                  Local Lobby
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityOption, visibility === 'public' && styles.visibilityOptionActive]}
                onPress={() => setVisibility('public')}
              >
                <Text style={[styles.visibilityOptionText, visibility === 'public' && styles.visibilityOptionTextActive]}>
                  Online Lobby
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.visibilityHint}>
              {visibility === 'invite_only'
                ? "Invite-only · won't appear in public games · join by code only"
                : 'Open to everyone · anyone can find it · joinable by code too'}
            </Text>
          </View>
        )}

        <CinemaButton
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          size="lg"
          style={styles.actionBtn}
        >
          {loading ? 'Loading…' : isCreate ? 'CREATE GAME' : 'JOIN GAME'}
        </CinemaButton>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

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
  choiceBrowseCard: { borderColor: C.gold, backgroundColor: C.goldFaint },
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
  actionBtn: { marginTop: 8 },
  visibilityToggleWrap: { gap: 6 },
  visibilityToggle: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: R.md, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  visibilityOption: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  visibilityOptionActive: { backgroundColor: C.gold },
  visibilityOptionText: { color: C.textSub, fontSize: FS.sm, fontWeight: '700' },
  visibilityOptionTextActive: { color: C.textOnGold },
  visibilityHint: { color: C.textMuted, fontSize: FS.xs, textAlign: 'center' },

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
  maxStepperWrap: { alignItems: 'center', gap: 4 },
  maxStepperLabel: {
    color: C.textMuted, fontSize: FS.xs, fontWeight: '600',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  maxPlayersStepper: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { color: C.gold, fontSize: 26, fontWeight: '300', lineHeight: 30 },
  stepperBtnDisabled: { color: 'rgba(245,197,24,0.2)' },
  stepperCount: {
    color: C.textPrimary, fontSize: FS['2xl'], fontWeight: '800',
    minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  playerList: { flex: 1, paddingHorizontal: 24 },
  playerListContent: { gap: 10, paddingBottom: 16 },
  playerChip: {
    backgroundColor: C.surface,
    borderRadius: R.md, padding: 12, gap: 8, borderWidth: 1, borderColor: C.border,
  },
  playerChipTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: R.full,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
  },
  playerAvatarText: { color: C.textOnGold, fontSize: FS.sm, fontWeight: '800' },
  playerName: { color: C.textPrimary, fontSize: FS.base, fontWeight: '600', flex: 1 },
  hostBadge: {
    color: '#a78bfa', fontSize: FS.xs, fontWeight: '700',
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.xs,
  },
  youBadge: {
    color: C.gold, fontSize: FS.xs, fontWeight: '700',
    backgroundColor: C.goldFaint,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.xs,
  },
  startBtn: { margin: 24 },
  waitingForHost: { margin: 24, paddingVertical: 18, alignItems: 'center' },
  waitingForHostText: { color: C.textSub, fontSize: FS.base },
});
