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
  ActivityIndicator,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Game, Movie, Player } from '@/lib/database.types';
import { fetchRandomInsaneMovie } from '@/lib/tmdb-insane';

const db = supabase as unknown as { from: (t: string) => any };
const POLL_MS = 1000;

export default function LocalLobbyScreen() {
  const router = useRouter();
  const { joinCode: joinCodeParam, startView, displayName: displayNameParam } = useLocalSearchParams<{ joinCode?: string; startView?: string; displayName?: string }>();
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
    selectedVisibility,
    authUser,
  } = useAppStore();

  function getDefaultName(): string {
    if (displayNameParam) return displayNameParam;
    const meta = authUser?.user_metadata ?? {};
    return (meta.given_name || meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '').trim();
  }

  const [displayName, setDisplayName] = useState(getDefaultName);
  const [loading, setLoading] = useState(false);
  const [localGame, setLocalGame] = useState<Game | null>(null);
  const [localPlayers, setLocalPlayers] = useState<Player[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [localIsHost, setLocalIsHost] = useState(false);
  const [nameEntered, setNameEntered] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [codeCopied, setCodeCopied] = useState(false);

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

  // Load cached name (only if no auth name and no param)
  useEffect(() => {
    if (displayNameParam || getDefaultName()) return;
    AsyncStorage.getItem('player_display_name').then((saved) => {
      if (saved) setDisplayName(saved);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save name to cache whenever it changes
  useEffect(() => {
    if (displayName.trim()) AsyncStorage.setItem('player_display_name', displayName.trim());
  }, [displayName]);

  // Auto-create when arriving from mode-select
  useEffect(() => {
    if (startView === 'create') {
      handleCreateGame();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-join if arriving with a joinCode (e.g. from lobby browser)
  useEffect(() => {
    if (joinCodeParam) {
      const name = displayNameParam || getDefaultName();
      handleJoinGame(name, joinCodeParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!displayName.trim()) { router.back(); return; }
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
          visibility: selectedVisibility,
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
      Alert.alert('Error', e?.message ?? 'Could not create game', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinGame(nameOverride?: string, codeOverride?: string) {
    const name = (nameOverride ?? displayName).trim();
    const code = (codeOverride ?? '').trim().toUpperCase();
    if (!code || !name) return;
    setLoading(true);
    try {
      const { data: foundGame, error: findErr } = await db
        .from('games')
        .select('*')
        .eq('game_code', code)
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
        .insert({ game_id: foundGame.id, display_name: name })
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
      Alert.alert('Error', e?.message ?? 'Could not join game', [
        { text: 'OK', onPress: () => { if (codeOverride) router.back(); } },
      ]);
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

  // Cancel game when host navigates away without tapping Cancel (e.g. iOS swipe-back)
  useEffect(() => {
    if (!nameEntered || !localIsHost) return;
    return () => {
      if (!navigatedRef.current && gameIdRef.current) {
        db.from('games').update({ status: 'cancelled' }).eq('id', gameIdRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameEntered, localIsHost]);

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

      navigatedRef.current = true;
      stopPolling();
      setPlayers(localPlayers);
      router.replace('/game');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start game');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyCode() {
    if (!localGame) return;
    Clipboard.setString(localGame.game_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
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
            onPress={handleCopyCode}
            style={styles.codeCard}
            activeOpacity={0.8}
          >
            <Text style={styles.gameCode}>{localGame.game_code}</Text>
            <Text style={styles.copyHint}>{codeCopied ? 'Copied!' : 'tap to copy'}</Text>
          </TouchableOpacity>
          <View style={styles.visibilityHintRow}>
            <Image
              source={localGame.visibility === 'invite_only' ? lcLock : lcGlobePin}
              style={styles.visibilityHintIcon}
            />
            <Text style={styles.codeHint}>
              {localGame.visibility === 'invite_only'
                ? 'Private · join by code only'
                : 'Public · visible in lobby browser'}
            </Text>
          </View>
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

  // ── Spinner for auto-create / auto-join ───────────────────────────────────────

  if ((startView === 'create' || !!joinCodeParam) && !nameEntered) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.ochre} />
      </SafeAreaView>
    );
  }

  // ── Choice view ───────────────────────────────────────────────────────────────

  const nameReady = displayName.trim().length > 0;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.accentTopRight} pointerEvents="none" />
      <BackButton onPress={() => router.back()} />

      {/* Header + cards — unaffected by keyboard */}
      <View style={styles.choiceCenter}>
        <View style={styles.choiceHeader}>
          <Text style={styles.sectionLabel}>Multiplayer</Text>
          <Text style={styles.title}>Go Digital</Text>
          <View style={styles.titleUnderline} />
          <Text style={styles.subtitle}>Up to 10 players — each on their own phone</Text>
        </View>

        <View style={styles.choiceCards}>
          <TouchableOpacity
            style={[styles.choiceCard, styles.choiceCardPrimary, !nameReady && styles.choiceCardDisabled]}
            onPress={() => {
              if (!nameReady) return;
              router.push({ pathname: '/mode-select', params: { displayName: displayName.trim() } });
            }}
            activeOpacity={0.85}
          >
            <Image source={lcClapperboard} style={{ width: 56, height: 56, resizeMode: 'contain' }} />
            <Text style={[styles.choiceCardTitle, { color: C.ink }]}>Create Game</Text>
            <Text style={[styles.choiceCardSub, { color: 'rgba(26,26,26,0.6)' }]}>Share the code with friends</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.choiceCard, !nameReady && styles.choiceCardDisabled]}
            onPress={() => {
              if (!nameReady) return;
              router.push({ pathname: '/lobby-browser', params: { displayName: displayName.trim() } });
            }}
            activeOpacity={0.85}
          >
            <Image source={lcMovieTicket} style={{ width: 56, height: 56, resizeMode: 'contain' }} />
            <Text style={styles.choiceCardTitle}>Join Game</Text>
            <Text style={styles.choiceCardSub}>Browse open games or enter an invite code</Text>
          </TouchableOpacity>
        </View>

        {!nameReady && (
          <Text style={styles.namePrompt}>Enter your name above to continue</Text>
        )}
      </View>

      {/* Name input pinned to bottom — lifts with keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.nameBar}>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor={C.textMuted}
            maxLength={20}
            returnKeyType="done"
          />
        </View>
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
    backgroundColor: C.surfaceWarm, borderRadius: R.card,
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
  choiceCardDisabled: { opacity: 0.35 },

  namePrompt: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textMuted,
    textAlign: 'center',
  },

  nameBar: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
    gap: 6,
    borderTopWidth: 2,
    borderTopColor: C.inkFaint,
    backgroundColor: C.bg,
  },

  inputLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, letterSpacing: 1.5,
    textTransform: 'uppercase', color: C.textSub,
  },
  input: {
    fontFamily: Fonts.body,
    backgroundColor: C.surfaceWarm, borderRadius: R.md,
    borderWidth: 2, borderColor: C.ink,
    color: C.textPrimary, fontSize: FS.md,
    paddingHorizontal: SP.md, paddingVertical: 14,
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
    borderRadius: R.card, backgroundColor: C.surfaceWarm,
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
  visibilityHintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  visibilityHintIcon: { width: 18, height: 18 },
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
    backgroundColor: C.surfaceWarm,
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
    lineHeight: FS.sm, includeFontPadding: false,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    color: C.textPrimary, fontSize: FS.base, flex: 1,
  },
  hostCrownIcon: { width: 32, height: 32 },
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
