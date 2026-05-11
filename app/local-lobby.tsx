import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Clipboard,
  BackHandler,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Switch,
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
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';
import { Game, Movie, Player } from '@/lib/database.types';
import { fetchRandomInsaneMovie } from '@/lib/tmdb-insane';
import { CloseIcon } from '@/components/CinemaIcons';
import { useAirPlayAvailable, AirPlayButton } from 'airplay-picker';

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
    setGameJustStarted,
    selectedGameMode,
    selectedCollectionId,
    selectedVisibility,
    authUser,
    tvMode,
    setTvMode,
  } = useAppStore();

  function getDefaultName(): string {
    if (displayNameParam) return displayNameParam;
    const meta = authUser?.user_metadata ?? {};
    return (meta.given_name || meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '').trim();
  }

  const [displayName] = useState(getDefaultName);
  const [loading, setLoading] = useState(false);
  const [localGame, setLocalGame] = useState<Game | null>(null);
  const [localPlayers, setLocalPlayers] = useState<Player[]>([]);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [localIsHost, setLocalIsHost] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [trailerAllDevices, setTrailerAllDevices] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [castVisible, setCastVisible] = useState(false);
  const [tvBannerDismissed, setTvBannerDismissed] = useState(false);
  const airPlayAvailable = useAirPlayAvailable();

  // Lobby is "ready" once we've created or joined a game.
  const lobbyReady = !!localGame;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  const navigatedRef = useRef(false);
  const playerIdRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Auto-create or auto-join based on params. If neither is provided we bounce back —
  // this screen no longer renders a Create/Join chooser (see app/local.tsx, app/online.tsx).
  useEffect(() => {
    if (startView === 'create') {
      handleCreateGame();
    } else if (joinCodeParam) {
      const name = displayNameParam || getDefaultName();
      handleJoinGame(name, joinCodeParam);
    } else {
      router.back();
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
        setGameJustStarted(true);
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
          trailer_platform: Platform.OS as 'ios' | 'android',
        })
        .select()
        .single() as { data: Game | null; error: any };
      if (gameErr || !newGame) throw gameErr ?? new Error('No game');

      const { data: newPlayer, error: playerErr } = await db
        .from('players')
        .insert({ game_id: newGame.id, display_name: displayName.trim(), last_seen: null })
        .select()
        .single() as { data: Player | null; error: any };
      if (playerErr || !newPlayer) throw playerErr ?? new Error('No player');

      setLocalGame(newGame);
      setLocalPlayerId(newPlayer.id);
      playerIdRef.current = newPlayer.id;
      setLocalIsHost(true);
      setLocalPlayers([newPlayer]);

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
        .insert({ game_id: foundGame.id, display_name: name, last_seen: null })
        .select()
        .single() as { data: Player | null; error: any };
      if (playerErr || !newPlayer) throw playerErr ?? new Error('Could not join game');

      // If this player is on Android, escalate the game's trailer_platform so
      // Android-incompatible trailers (ads) are filtered out for everyone.
      // Applies to online games and local games in "All devices" mode (visibility: public).
      const allDevicesLocal = foundGame.multiplayer_type === 'local' && foundGame.visibility === 'public';
      if ((foundGame.multiplayer_type === 'online' || allDevicesLocal) && Platform.OS === 'android') {
        await db.from('games').update({ trailer_platform: 'android' }).eq('id', foundGame.id);
      }

      setLocalGame(foundGame);
      setLocalPlayerId(newPlayer.id);
      playerIdRef.current = newPlayer.id;
      setLocalIsHost(false);
      setMaxPlayers(foundGame.max_players ?? 8);

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

  async function handleTrailerModeChange(allDevices: boolean) {
    setTrailerAllDevices(allDevices);
    if (localGame) {
      await db.from('games').update({ visibility: allDevices ? 'public' : 'invite_only' }).eq('id', localGame.id);
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
    if (!lobbyReady) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleLeaveWaitingRoom();
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyReady, localGame, localIsHost]);

  // Cancel game when host navigates away without tapping Cancel (e.g. iOS swipe-back)
  useEffect(() => {
    if (!lobbyReady || !localIsHost) return;
    return () => {
      if (!navigatedRef.current && gameIdRef.current) {
        db.from('games').update({ status: 'cancelled' }).eq('id', gameIdRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyReady, localIsHost]);

  async function handleStartGame() {
    if (!localGame || localPlayers.length < 1) return;
    try {
      let firstTurnMovie!: Movie;
      const startingMovieIdsList: string[] = [];
      // One starting movie per player, by index
      const startingMovies: Movie[] = [];

      if (localGame.game_mode === 'insane') {
        const usedYears = new Set<number>();
        for (const _ of localPlayers) {
          let m: Movie;
          let attempts = 0;
          do { m = await fetchRandomInsaneMovie(db, Platform.OS as 'ios' | 'android'); attempts++; }
          while (usedYears.has(m.year) && attempts < 30);
          usedYears.add(m.year);
          startingMovieIdsList.push(m.id);
          startingMovies.push(m);
        }
        firstTurnMovie = await fetchRandomInsaneMovie(db, Platform.OS as 'ios' | 'android');
        setActiveMovies([...activeMovies, ...startingMovies, firstTurnMovie]);
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
          startingMovieIdsList.push(pool[i].id);
          startingMovies.push(pool[i]);
        }

        const usedSet = new Set(startingMovieIdsList);
        const remaining = pool.filter((m) => !usedSet.has(m.id));
        firstTurnMovie = remaining[Math.floor(Math.random() * remaining.length)];
      }

      const firstPlayer = localPlayers[0];

      // Batch all starting-state writes + game activation in parallel. Previously
      // these ran sequentially (N player updates → N phantom inserts → 1 turn insert),
      // which meant 2N+2 round-trips. Now it's one round-trip per group.
      setStartingMovieIds(startingMovieIdsList);
      const phantomRows = startingMovieIdsList.map((movieId, i) => ({
        game_id: localGame.id,
        active_player_id: localPlayers[i].id,
        movie_id: movieId,
        status: 'complete',
        winner_id: localPlayers[i].id,
      }));
      const [, , phantomResult] = await Promise.all([
        db.from('games').update({ status: 'active' }).eq('id', localGame.id),
        Promise.all(localPlayers.map((p, i) =>
          db.from('players').update({ timeline: [startingMovies[i].year], coins: 5 }).eq('id', p.id)
        )),
        db.from('turns').insert(phantomRows),
      ]);
      if (phantomResult.error && __DEV__) console.warn('[LOBBY] phantom turn insert failed:', phantomResult.error.message);

      // Insert the first real turn AFTER phantom rows exist so the poll() query
      // (newest non-complete turn) can't ever return before the phantom backfill.
      await db.from('turns').insert({
        game_id: localGame.id,
        active_player_id: firstPlayer.id,
        movie_id: firstTurnMovie.id,
        status: 'placing',
      });

      navigatedRef.current = true;
      stopPolling();
      setPlayers(localPlayers);
      setGameJustStarted(true);
      router.replace('/game');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start game');
    }
  }

  function handleCopyCode() {
    if (!localGame) return;
    Clipboard.setString(localGame.game_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  // ── Waiting room ─────────────────────────────────────────────────────────────

  if (!lobbyReady || !localGame) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.ochre} />
      </SafeAreaView>
    );
  }

  const isPrivate = localGame.visibility === 'invite_only';

  return (
    <SafeAreaView style={styles.container}>
      {/* Compact header — Back left, title + visibility centered */}
      <View style={styles.header}>
        <BackButton
          onPress={handleLeaveWaitingRoom}
          label={localIsHost ? 'Cancel' : 'Leave'}
          style={styles.backBtn}
        />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
            LOBBY {}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Body — two columns */}
      <View style={styles.body}>
        {/* LEFT — Game code + max players stepper */}
        <View style={styles.leftCol}>
          <TouchableOpacity
            onPress={handleCopyCode}
            style={styles.codeCard}
            activeOpacity={0.8}
          >
            <Text style={styles.gameCode}>{localGame.game_code}</Text>
            <Text style={styles.copyHint}>{codeCopied ? 'Copied!' : 'tap to copy'}</Text>
          </TouchableOpacity>

          {localIsHost && (
            <View style={styles.maxStepperWrap}>
              <Text style={styles.colLabel}>MAX PLAYERS</Text>
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
            </View>
          )}

          {localIsHost && (
            <View style={styles.trailerModeWrap}>
              <Text style={styles.colLabel}>TRAILERS</Text>
              <View style={styles.trailerModeRow}>
                <Text style={[styles.trailerModeLabel, !trailerAllDevices && styles.trailerModeLabelActive]}>
                  Host only
                </Text>
                <Switch
                  value={trailerAllDevices}
                  onValueChange={handleTrailerModeChange}
                  trackColor={{ false: C.inkFaint, true: C.ochre }}
                  thumbColor={C.surface}
                  ios_backgroundColor={C.inkFaint}
                />
                <Text style={[styles.trailerModeLabel, trailerAllDevices && styles.trailerModeLabelActive]}>
                  All devices
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* RIGHT — Player list + Start */}
        <View style={styles.rightCol}>
          <View style={styles.colHeader}>
            <Text style={styles.colLabel}>PLAYERS</Text>
            <Text style={styles.colCount}>{localPlayers.length} / {maxPlayers}</Text>
          </View>

          <ScrollView style={styles.playerList} contentContainerStyle={styles.playerListContent}>
            {localPlayers.map((p, i) => {
              const isHost = i === 0;
              return (
                <View key={p.id} style={styles.playerChip}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{initials(p.display_name)}</Text>
                  </View>
                  <Text style={styles.playerName} numberOfLines={1}>{p.display_name}</Text>
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
              <Text style={styles.waitingForHostText}>Waiting for host…</Text>
            </View>
          )}
        </View>
      </View>

      {loading && <HandoffSplash />}

      {airPlayAvailable && localIsHost && !tvMode && !tvBannerDismissed && !castVisible && (
        <TouchableOpacity
          style={styles.tvDetectedBanner}
          onPress={() => setCastVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.tvDetectedBannerText}>📺 TV detected nearby — tap to connect</Text>
          <TouchableOpacity onPress={() => setTvBannerDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.tvDetectedBannerClose}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {castVisible && (
        <TouchableOpacity style={[StyleSheet.absoluteFill, styles.castBackdrop]} activeOpacity={1} onPress={() => setCastVisible(false)}>
          <View style={styles.castSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.castSheetHeader}>
              <Text style={styles.castSheetTitle}>📺  Cast to TV</Text>
              <TouchableOpacity onPress={() => setCastVisible(false)} style={styles.castCloseBtn}>
                <CloseIcon size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>
            {Platform.OS === 'ios' ? (
              <View style={styles.castAirPlayRow}>
                <Text style={styles.castAirPlayLabel}>Mirror to TV via AirPlay</Text>
                <AirPlayButton style={styles.castAirPlayBtn} />
              </View>
            ) : (
              <Text style={styles.castSheetBody}>
                Swipe down twice → Quick Settings → Tap Cast
              </Text>
            )}
            <TouchableOpacity style={styles.castDoneBtn} onPress={() => { setTvMode(true); setCastVisible(false); }}>
              <Text style={styles.castDoneBtnText}>Done →</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ── Handoff splash: themed overlay shown while the host starts the game ──

function HandoffSplash() {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pulse  = useRef(new Animated.Value(1)).current;
  const [dots, setDots] = useState('');
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, handoffStyles.wrap, { opacity: fadeIn }]}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Image source={lcClapperboard} style={handoffStyles.icon} />
      </Animated.View>
      <Text style={handoffStyles.title}>Shuffling the deck{dots}</Text>
      <Text style={handoffStyles.subtitle}>Dealing starting cards</Text>
    </Animated.View>
  );
}

const handoffStyles = StyleSheet.create({
  wrap: {
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    zIndex: 100,
  },
  icon: { width: 96, height: 96, resizeMode: 'contain' },
  title: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.textPrimary,
    letterSpacing: 0.4,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FS.base,
    color: C.textSub,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header — Back + title centered
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.sm,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: { marginHorizontal: 0, marginTop: 0 },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    color: C.ochre,
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textMuted,
    letterSpacing: 0.5,
  },
  headerSpacer: { width: 84 },

  // Body
  body: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: SP.md,
    paddingTop: 4,
    paddingBottom: SP.md,
    gap: SP.sm,
  },

  // Column header (label + optional count)
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
    gap: 6,
  },
  colHeaderIcon: { width: 14, height: 14, resizeMode: 'contain' },
  colLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.textMuted,
    flex: 1,
  },
  colCount: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ochre,
    letterSpacing: 0.5,
  },

  // Left column — code + max players
  leftCol: {
    flex: 1,
    gap: SP.sm,
  },
  codeCard: {
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    alignItems: 'center',
    gap: 2,
  },
  gameCode: {
    fontFamily: Fonts.display,
    color: C.ochre,
    fontSize: 36,
    letterSpacing: 8,
  },
  copyHint: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMuted,
    letterSpacing: 1,
  },
  maxStepperWrap: {
    alignItems: 'center',
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: 4,
    gap: 2,
  },
  trailerModeWrap: {
    alignItems: 'center',
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: 6,
    gap: 4,
  },
  trailerModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trailerModeLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trailerModeLabelActive: {
    color: C.ink,
  },
  maxPlayersStepper: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: {
    fontFamily: Fonts.display,
    color: C.ochre,
    fontSize: 24,
  },
  stepperBtnDisabled: { color: C.inkFaint },
  stepperCount: {
    fontFamily: Fonts.display,
    color: C.ink,
    fontSize: FS.xl,
    minWidth: 36,
    textAlign: 'center',
  },

  // Right column — player list + start
  rightCol: {
    flex: 1.3,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.sm,
  },
  playerList: { flex: 1 },
  playerListContent: { gap: 6, paddingBottom: 4 },
  playerChip: {
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerAvatar: {
    width: 28,
    height: 28,
    borderRadius: R.full,
    backgroundColor: C.ochre,
    borderWidth: 2,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: {
    fontFamily: Fonts.display,
    color: C.ink,
    fontSize: FS.xs,
    lineHeight: FS.xs,
    includeFontPadding: false,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    color: C.textPrimary,
    fontSize: FS.sm,
    flex: 1,
  },
  hostCrownIcon: { width: 22, height: 22 },
  youBadge: {
    backgroundColor: C.ochre,
    borderRadius: R.xs,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontFamily: Fonts.label,
    color: C.ink,
    fontSize: FS.xs,
    letterSpacing: 0.5,
  },
  startBtn: { marginTop: 6 },
  waitingForHost: { marginTop: 6, paddingVertical: 10, alignItems: 'center' },
  waitingForHostText: {
    fontFamily: Fonts.body,
    color: C.textSub,
    fontSize: FS.sm,
  },

  tvDetectedBanner: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 20,
  },
  tvDetectedBannerText: {
    color: '#fff', fontFamily: Fonts.label, fontSize: 13, flex: 1,
  },
  tvDetectedBannerClose: {
    color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.label, fontSize: 14, marginLeft: 12,
  },
  castBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 20, paddingHorizontal: 52,
  },
  castSheet: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 16,
  },
  castSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  castSheetTitle: {
    color: C.textPrimary, fontFamily: Fonts.display, fontSize: FS.lg,
  },
  castCloseBtn: { padding: 4 },
  castSheetBody: {
    color: C.textSub, fontFamily: Fonts.body, fontSize: FS.sm, lineHeight: 22,
  },
  castAirPlayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surfaceHigh,
    borderRadius: R.md, borderWidth: 2, borderColor: C.inkFaint,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  castAirPlayLabel: {
    color: C.textSub, fontFamily: Fonts.label, fontSize: FS.sm,
  },
  castAirPlayBtn: { width: 44, height: 44 },
  castDoneBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn, borderWidth: 2, borderColor: C.ink,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  castDoneBtnText: {
    color: C.textOnOchre, fontFamily: Fonts.display, fontSize: FS.base,
  },
});
