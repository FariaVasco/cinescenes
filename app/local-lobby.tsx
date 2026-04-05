import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
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

const lcCrown    = require('../assets/lc-crown.png');
const lcLock     = require('../assets/lc-lock.png');
const lcGlobePin = require('../assets/lc-globe.png');
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';
const lcClapperboard = require('../assets/lc-clapperboard.png');
const lcMovieTicket  = require('../assets/lc-movie-ticket.png');
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
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
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

      const stale = new Date(g.created_at).getTime() < Date.now() - 30 * 60 * 1000;
      if (g.status === 'lobby' && stale) {
        navigatedRef.current = true;
        stopPolling();
        if (isHostRef.current) {
          db.from('games').update({ status: 'cancelled' }).eq('id', gId);
        }
        Alert.alert(
          'Lobby expired',
          'This lobby was open for more than 30 minutes and has been closed.',
          [{ text: 'OK', onPress: () => router.back() }],
          { cancelable: false },
        );
        return;
      }

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

  async function handleStartGame() {
    if (!localGame || localPlayers.length < 1) return;
    setLoading(true);
    try {
      let firstTurnMovie!: Movie;
      const startingMovieIdsList: string[] = [];

      if (localGame.game_mode === 'insane') {
        const insaneMoviesBuffer: Movie[] = [];
        const usedYears = new Set<number>();
        for (const player of localPlayers) {
          let m: Movie;
          let attempts = 0;
          do { m = await fetchRandomInsaneMovie(db); attempts++; }
          while (usedYears.has(m.year) && attempts < 30);
          usedYears.add(m.year);
          startingMovieIdsList.push(m.id);
          insaneMoviesBuffer.push(m);
          await db.from('players').update({ timeline: [m.year], coins: 5 }).eq('id', player.id);
        }
        firstTurnMovie = await fetchRandomInsaneMovie(db);
        insaneMoviesBuffer.push(firstTurnMovie);
        setActiveMovies([...activeMovies, ...insaneMoviesBuffer]);
      } else {
        let pool: typeof activeMovies;
        if (localGame.game_mode === 'collection' && localGame.collection_id) {
          const { data: col } = await db
            .from('collections').select('tag').eq('id', localGame.collection_id).single() as { data: { tag: string } | null };
          pool = col
            ? activeMovies.filter((m) => (m.tags ?? []).includes(col.tag))
            : activeMovies.filter((m) => m.classic_pool === true);
        } else {
          pool = activeMovies.filter((m) => m.classic_pool === true);
        }
        if (pool.length < localPlayers.length + 1) throw new Error('Not enough movies available');

        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        for (let i = 0; i < localPlayers.length; i++) {
          const startMovie = pool[i];
          startingMovieIdsList.push(startMovie.id);
          await db.from('players').update({ timeline: [startMovie.year], coins: 5 }).eq('id', localPlayers[i].id);
        }

        const usedSet = new Set(startingMovieIdsList);
        const remaining = pool.filter((m) => !usedSet.has(m.id));
        firstTurnMovie = remaining[Math.floor(Math.random() * remaining.length)];
      }

      const firstPlayer = localPlayers[0];
      await db.from('games').update({ status: 'active' }).eq('id', localGame.id);

      setStartingMovieIds(startingMovieIdsList);
      for (const [i, movieId] of startingMovieIdsList.entries()) {
        const { error: phantomErr } = await db.from('turns').insert({
          game_id: localGame.id,
          active_player_id: localPlayers[i].id,
          movie_id: movieId,
          status: 'complete',
          winner_id: localPlayers[i].id,
        });
        if (phantomErr) console.warn('[LOBBY] phantom turn insert failed:', phantomErr.message, phantomErr.code);
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

  // ── Choice view ──────────────────────────────────────────────────────────────

  if (view === 'choice') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.accentTopRight} pointerEvents="none" />
        <BackButton onPress={() => router.back()} />

        <View style={styles.choiceCenter}>
          <View style={styles.choiceHeader}>
            <Text style={styles.sectionLabel}>Multiplayer</Text>
            <Text style={styles.title}>Go Digital</Text>
            <View style={styles.titleUnderline} />
            <Text style={styles.subtitle}>Up to 10 players — each on their own phone</Text>
          </View>

          <View style={styles.choiceCards}>
            <TouchableOpacity
              style={[styles.choiceCard, styles.choiceCardPrimary]}
              onPress={() => router.push('/mode-select')}
              activeOpacity={0.85}
            >
              <Image source={lcClapperboard} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
              <Text style={[styles.choiceCardTitle, { color: C.ink }]}>Create Game</Text>
              <Text style={[styles.choiceCardSub, { color: 'rgba(26,26,26,0.6)' }]}>Share the code with friends</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.choiceCard}
              onPress={() => router.push('/lobby-browser')}
              activeOpacity={0.85}
            >
              <Image source={lcMovieTicket} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
              <Text style={styles.choiceCardTitle}>Join Game</Text>
              <Text style={styles.choiceCardSub}>Browse open games or enter an invite code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Waiting room ─────────────────────────────────────────────────────────────

  if (nameEntered && localGame) {
    return (
      <SafeAreaView style={styles.container}>
        <BackButton
          onPress={handleLeaveWaitingRoom}
          label={localIsHost ? 'Cancel' : 'Leave'}
        />

        {/* Game code block */}
        <View style={styles.waitingHeader}>
          <Text style={styles.waitingLabel}>Game Code</Text>
          <TouchableOpacity
            onPress={() => Clipboard.setString(localGame.game_code)}
            style={styles.codeCard}
            activeOpacity={0.8}
          >
            <Text style={styles.gameCode}>{localGame.game_code}</Text>
            <Text style={styles.copyHint}>tap to copy</Text>
          </TouchableOpacity>
          <Text style={styles.codeHint}>
            {localGame.visibility === 'invite_only'
              ? '🔒  Invite-only · share the code above'
              : '🌐  Public · visible in lobby browser'}
          </Text>
        </View>

        {/* Player count / max stepper */}
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

        {/* Player list */}
        <ScrollView style={styles.playerList} contentContainerStyle={styles.playerListContent}>
          {localPlayers.map((p, i) => {
            const isHost = i === 0;
            return (
              <View key={p.id} style={styles.playerChip}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{initials(p.display_name)}</Text>
                </View>
                <Text style={styles.playerName}>{p.display_name}</Text>
                {isHost && <Image source={lcCrown} style={styles.hostCrownIcon} />}
                {p.id === localPlayerId && <View style={styles.youBadge}><Text style={styles.youBadgeText}>you</Text></View>}
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
            {loading ? 'Starting…' : 'Start Game →'}
          </CinemaButton>
        ) : (
          <View style={styles.waitingForHost}>
            <Text style={styles.waitingForHostText}>Waiting for host to start…</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Create / Join form ───────────────────────────────────────────────────────

  const isCreate = view === 'create';
  const canSubmit = displayName.trim().length > 0 && (isCreate || joinCode.trim().length > 0);
  const handleSubmit = isCreate ? handleCreateGame : handleJoinGame;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.accentBottomRight} pointerEvents="none" />
      <BackButton onPress={() => setView('choice')} />

      <KeyboardAvoidingView
        style={styles.formCenter}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.formHeader}>
          <Text style={styles.sectionLabel}>{isCreate ? 'New game' : 'Enter game'}</Text>
          <Text style={styles.title}>{isCreate ? 'Create Game' : 'Join Game'}</Text>
          <View style={[styles.titleUnderline, { backgroundColor: isCreate ? C.ochre : C.cerulean }]} />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Your Name</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor={C.textMuted}
            maxLength={20}
            returnKeyType={isCreate ? 'go' : 'next'}
            onSubmitEditing={() => { if (isCreate && canSubmit && !loading) handleSubmit(); }}
            autoFocus
          />
        </View>

        {!isCreate && (
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Game Code</Text>
            <TextInput
              style={[styles.input, styles.inputCode]}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={C.textMuted}
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
            <View style={styles.visibilityHintRow}>
              <Image
                source={visibility === 'invite_only' ? lcLock : lcGlobePin}
                style={styles.visibilityHintIcon}
              />
              <Text style={styles.visibilityHint}>
                {visibility === 'invite_only' ? 'Private · join by code only' : 'Public · open to everyone'}
              </Text>
            </View>
          </View>
        )}

        <CinemaButton
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          size="lg"
          style={styles.actionBtn}
        >
          {loading ? 'Loading…' : isCreate ? 'Create Game' : 'Join Game'}
        </CinemaButton>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Geometric accents
  accentTopRight: {
    position: 'absolute', top: -70, right: -70,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(232,55,42,0.06)',
  },
  accentBottomRight: {
    position: 'absolute', bottom: -60, right: -60,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(74,158,196,0.07)',
  },

  // Choice view
  choiceCenter: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: SP.lg, gap: SP.lg,
  },
  choiceHeader: { gap: 4 },
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
    width: 40, height: 2, backgroundColor: C.ochre, marginTop: 6,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FS.base, color: C.textSub, marginTop: 4,
  },
  choiceCards: { gap: SP.md },
  choiceCard: {
    backgroundColor: C.surface, borderRadius: R.card,
    borderWidth: 2, borderColor: C.ink,
    padding: 28, alignItems: 'center', gap: 8,
  },
  choiceCardPrimary: { backgroundColor: C.ochre },
  choiceCardTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl, color: C.ink, letterSpacing: 0.5,
  },
  choiceCardSub: {
    fontFamily: Fonts.label,
    fontSize: FS.sm, color: C.textSub, textAlign: 'center',
  },

  // Form view
  formCenter: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: SP.lg, gap: SP.md,
  },
  formHeader: { gap: 4, marginBottom: SP.xs },
  inputWrapper: { gap: 6 },
  inputLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, letterSpacing: 1.5,
    textTransform: 'uppercase', color: C.textSub,
  },
  input: {
    fontFamily: Fonts.body,
    backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 2, borderColor: C.ink,
    color: C.textPrimary, fontSize: FS.md,
    paddingHorizontal: SP.md, paddingVertical: 14,
  },
  inputCode: {
    letterSpacing: 6, fontFamily: Fonts.display,
    fontSize: FS.xl, textAlign: 'center',
  },
  actionBtn: { marginTop: SP.xs },
  visibilityToggleWrap: { gap: 6 },
  visibilityToggle: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: R.md, borderWidth: 2, borderColor: C.ink, overflow: 'hidden',
  },
  visibilityOption: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  visibilityOptionActive: { backgroundColor: C.ochre },
  visibilityOptionText: {
    fontFamily: Fonts.label,
    color: C.textSub, fontSize: FS.sm,
  },
  visibilityOptionTextActive: { color: C.textOnOchre },
  visibilityHintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6,
  },
  visibilityHintIcon: { width: 18, height: 18 },
  visibilityHint: {
    fontFamily: Fonts.label,
    color: C.textMuted, fontSize: FS.sm,
  },

  // Waiting room
  waitingHeader: {
    alignItems: 'center', paddingTop: SP.lg,
    paddingBottom: SP.md, paddingHorizontal: SP.lg, gap: 8,
  },
  waitingLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, letterSpacing: 2,
    textTransform: 'uppercase', color: C.textMuted,
  },
  codeCard: {
    borderWidth: 2, borderColor: C.ink,
    borderRadius: R.card, backgroundColor: C.surface,
    paddingHorizontal: SP.xl, paddingVertical: SP.md,
    alignItems: 'center', gap: 4,
  },
  gameCode: {
    fontFamily: Fonts.display,
    color: C.ochre, fontSize: 48,
    letterSpacing: 10,
  },
  copyHint: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, color: C.textMuted, letterSpacing: 1,
  },
  codeHint: {
    fontFamily: Fonts.label,
    color: C.textMuted, fontSize: FS.sm,
  },
  playerCountRow: { alignItems: 'center', paddingVertical: SP.sm },
  playerCountText: {
    fontFamily: Fonts.label,
    color: C.textSub, fontSize: FS.sm,
  },
  maxStepperWrap: { alignItems: 'center', gap: 4 },
  maxStepperLabel: {
    fontFamily: Fonts.label,
    color: C.textMuted, fontSize: FS.xs,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  maxPlayersStepper: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: {
    fontFamily: Fonts.display,
    color: C.ochre, fontSize: 28,
  },
  stepperBtnDisabled: { color: C.inkFaint },
  stepperCount: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS['2xl'],
    minWidth: 44, textAlign: 'center',
  },
  playerList: { flex: 1, paddingHorizontal: SP.lg },
  playerListContent: { gap: 10, paddingBottom: SP.md },
  playerChip: {
    backgroundColor: C.surface,
    borderRadius: R.md, borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: SP.md, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  playerAvatar: {
    width: 36, height: 36, borderRadius: R.full,
    backgroundColor: C.ochre, borderWidth: 2, borderColor: C.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  playerAvatarText: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.sm,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    color: C.textPrimary, fontSize: FS.base, flex: 1,
  },
  hostCrownIcon: { width: 20, height: 20 },
  youBadge: {
    backgroundColor: C.ochre, borderRadius: R.xs,
    borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  youBadgeText: {
    fontFamily: Fonts.label,
    color: C.ink, fontSize: FS.xs, letterSpacing: 0.5,
  },
  startBtn: { marginHorizontal: SP.lg, marginBottom: SP.lg },
  waitingForHost: { marginHorizontal: SP.lg, marginBottom: SP.lg, paddingVertical: 18, alignItems: 'center' },
  waitingForHostText: {
    fontFamily: Fonts.body,
    color: C.textSub, fontSize: FS.base,
  },
});
