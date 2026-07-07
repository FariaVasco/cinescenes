import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { ModePickerModal, ModeChoice } from '@/components/ModePickerModal';
import { useAppStore } from '@/store/useAppStore';
import { GAME_CODE_LENGTH, GAME_CODE_PLACEHOLDER, sanitizeGameCodeInput } from '@/lib/game-code';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { supabase } from '@/lib/supabase';
import { Game } from '@/lib/database.types';

const lcClapperboard = require('@/assets/lc-clapperboard.png');
const lcMovieTicket  = require('@/assets/lc-movie-ticket.png');

const db = supabase as unknown as { from: (t: string) => any };

type LobbyEntry = {
  game: Game;
  playerCount: number;
  collectionName: string;
  hostName: string;
};

export default function OnlineScreen() {
  const router = useRouter();
  const {
    authUser,
    setSelectedGameMode,
    setSelectedCollectionId,
    setSelectedVisibility,
  } = useAppStore();

  function getDefaultName(): string {
    const meta = authUser?.user_metadata ?? {};
    return (meta.given_name || meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '').trim();
  }

  const [displayName, setDisplayName] = useState(getDefaultName);
  const [inviteCode, setInviteCode] = useState('');
  const [entries, setEntries] = useState<LobbyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modePickerVisible, setModePickerVisible] = useState(false);
  // Keyboard mode (iOS only, and only while the CODE field is focused — typing the
  // name needs no handling: the name row sits at the top, above the keyboard).
  // While typing the code, both right-column cards stay complete: the column
  // compacts first (the create card stops stretching, cards hug their content at
  // full size), and only if that still doesn't fit does everything shrink
  // uniformly. No transforms/remounts — those make iPadOS dismiss the keyboard.
  const keyboardHeight = useKeyboardHeight();
  const [rightColH, setRightColH] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);
  // Compact-layout height at full size, measured once per keyboard session.
  const [compactH, setCompactH] = useState(0);
  const keyboardMode = Platform.OS === 'ios' && keyboardHeight > 0 && codeFocused;
  const rightColScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!keyboardMode) setCompactH(0);
    // Pin the column to the top of its scroll area whenever the mode flips.
    rightColScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [keyboardMode]);
  // 8pt safety margin: measured heights land a hair optimistic (rounding, borders),
  // which showed as a sliver of card under the keyboard's top edge.
  const fitHeight = keyboardMode && rightColH > 0
    ? Math.max(80, rightColH - keyboardHeight - 8)
    : undefined;
  // Tall columns get the spacious invite-card layout (header top, full-width
  // input, JOIN below); short ones keep the compact side-by-side row.
  const roomy = rightColH >= 260;
  // Shrink only as a last resort — k stays 1 while the compact layout fits.
  const k = fitHeight !== undefined && compactH > 0
    ? Math.max(0.5, Math.min(1, fitHeight / compactH))
    : 1;
  const kz = (v: number) => Math.round(v * k);
  const shrink = k < 1 ? {
    createIcon: { width: kz(36), height: kz(36) },
    createTitle: { fontSize: kz(FS.md) },
    inviteIcon: { width: kz(22), height: kz(22) },
    inviteHeading: { fontSize: Math.max(8, kz(FS.xs)) },
    input: { fontSize: kz(FS.md), paddingVertical: kz(8) },
    code: { fontSize: kz(FS.md), letterSpacing: kz(4) },
    joinBtn: { paddingHorizontal: kz(12), paddingVertical: kz(8) },
    joinBtnText: { fontSize: kz(FS.sm) },
  } : null;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      fetchGames();
      pollRef.current = setInterval(fetchGames, 5000);
      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (getDefaultName()) return;
    AsyncStorage.getItem('player_display_name').then((saved) => {
      if (saved) setDisplayName(saved);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (displayName.trim()) AsyncStorage.setItem('player_display_name', displayName.trim());
  }, [displayName]);

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
        .from('players').select('game_id, display_name, created_at').in('game_id', gameIds).order('created_at') as { data: { game_id: string; display_name: string; created_at: string }[] | null };

      const countByGame: Record<string, number> = {};
      const hostByGame: Record<string, string> = {};
      for (const p of players ?? []) {
        countByGame[p.game_id] = (countByGame[p.game_id] ?? 0) + 1;
        if (!hostByGame[p.game_id]) hostByGame[p.game_id] = p.display_name;
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
          collectionName: g.game_mode === 'insane'
            ? 'Insane'
            : g.game_mode === 'collection' && g.collection_id
              ? (collectionNames[g.collection_id] ?? 'Collection')
              : 'Classic',
          hostName: hostByGame[g.id] ?? 'Host',
        }))
        .filter((e) => e.playerCount > 0);

      setEntries(result);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() { setRefreshing(true); fetchGames(); }

  const nameReady = displayName.trim().length > 0;
  const canJoinByCode = nameReady && inviteCode.trim().length > 0;

  function joinGame(code: string) {
    if (!nameReady) return;
    router.push({
      pathname: '/local-lobby',
      params: { joinCode: code, displayName: displayName.trim() },
    });
  }

  function handleCreatePress() {
    if (!nameReady) return;
    setModePickerVisible(true);
  }

  function handleModeSelected(choice: ModeChoice) {
    setSelectedVisibility('public');
    setSelectedGameMode(choice.mode);
    setSelectedCollectionId(choice.mode === 'collection' ? choice.collectionId : null);
    router.push({
      pathname: '/local-lobby',
      params: { startView: 'create', displayName: displayName.trim() },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Compact header — Back left, stacked title centered */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} style={styles.backBtn} />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
            ONLINE GAMES {}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.flex}>
        {/* Single shared name field */}
        <View style={styles.nameRow}>
          <Text style={styles.nameLabel}>Your name</Text>
          <TextInput
            style={styles.nameInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor={C.textMuted}
            maxLength={20}
            returnKeyType="done"
          />
        </View>

        <View style={styles.split}>
          {/* LEFT — Public games list */}
          <View style={styles.leftPanel}>
            <View style={styles.leftHeader}>
              <Text style={styles.leftTitle}>PUBLIC GAMES</Text>
            </View>

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
                    <Text style={styles.emptyHint}>Pull to refresh, or create one →</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.gameCard}>
                    <View style={styles.gameCardLeft}>
                      <Text style={styles.gameCardTitle}>{item.hostName}'s Game</Text>
                      <Text style={styles.gameCardMeta}>
                        {item.collectionName} · {item.playerCount}/{item.game.max_players} players
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.gameJoinBtn, !nameReady && styles.gameJoinBtnDisabled]}
                      onPress={() => joinGame(item.game.game_code)}
                      disabled={!nameReady}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.gameJoinBtnText}>JOIN </Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}

          </View>

          {/* RIGHT — Create card (top) + Invite-code card (bottom).
              No automaticallyAdjustKeyboardInsets: UIKit's scroll-into-view runs
              against the full-size layout during keyboard presentation and leaves a
              stale offset once we compact — the compact layout already fits above
              the keyboard. Scroll stays pinned to top. */}
          <ScrollView
            ref={rightColScrollRef}
            style={styles.rightColScroll}
            contentContainerStyle={[styles.rightCol, fitHeight !== undefined && { flexGrow: 0, height: fitHeight }]}
            onLayout={(e) => setRightColH(e.nativeEvent.layout.height)}
            scrollEnabled={!keyboardMode}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Tapping anywhere that isn't a control closes the keyboard */}
            <Pressable
              style={[styles.rightColInner, keyboardMode && styles.rightColInnerCompact]}
              onPress={Keyboard.dismiss}
              onLayout={(e) => {
                if (keyboardMode && compactH === 0) setCompactH(e.nativeEvent.layout.height);
              }}
            >
            <TouchableOpacity
              style={[styles.createCard, keyboardMode && styles.createCardCompact, !nameReady && styles.btnDisabled]}
              onPress={handleCreatePress}
              disabled={!nameReady}
              activeOpacity={0.85}
            >
              <Image source={lcClapperboard} style={[styles.createIcon, shrink && shrink.createIcon]} />
              <Text style={[styles.createTitle, shrink && shrink.createTitle]}>CREATE NEW GAME</Text>
            </TouchableOpacity>

            <View style={[styles.inviteCard, roomy && styles.inviteCardRoomy]}>
              <View style={styles.inviteHeader}>
                <Image source={lcMovieTicket} style={[styles.inviteIcon, shrink && shrink.inviteIcon]} />
                <Text style={[styles.inviteHeading, shrink && shrink.inviteHeading]}>HAVE A CODE?</Text>
              </View>
              <View style={[styles.inviteRow, roomy && styles.inviteRowRoomy]}>
                <TextInput
                  style={[styles.input, styles.codeInput, roomy && styles.codeInputRoomy, shrink && shrink.input, shrink && shrink.code]}
                  value={inviteCode}
                  onChangeText={(t) => setInviteCode(sanitizeGameCodeInput(t))}
                  placeholder={GAME_CODE_PLACEHOLDER}
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="characters"
                  maxLength={GAME_CODE_LENGTH}
                  returnKeyType="go"
                  editable={nameReady}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  onSubmitEditing={() => { if (canJoinByCode) joinGame(inviteCode.trim()); }}
                />
                <TouchableOpacity
                  style={[styles.codeJoinBtn, roomy && styles.codeJoinBtnRoomy, shrink && shrink.joinBtn, !canJoinByCode && styles.btnDisabled]}
                  onPress={() => joinGame(inviteCode.trim())}
                  disabled={!canJoinByCode}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.codeJoinBtnText, shrink && shrink.joinBtnText]}>JOIN </Text>
                </TouchableOpacity>
              </View>
            </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      <ModePickerModal
        visible={modePickerVisible}
        onClose={() => setModePickerVisible(false)}
        onSelected={handleModeSelected}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Header — Back + stacked title centered
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

  // Shared name field
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    gap: SP.sm,
  },
  nameLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.textSub,
    width: 80,
  },
  nameInput: {
    flex: 1,
    fontFamily: Fonts.body,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    color: C.textPrimary,
    fontSize: FS.md,
    paddingHorizontal: SP.md,
    paddingVertical: 8,
  },

  // Split layout
  split: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: SP.md,
    paddingTop: 4,
    paddingBottom: SP.md,
    gap: SP.sm,
  },

  // Left — public games list
  leftPanel: {
    flex: 2.2,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.sm,
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  leftTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.ochre,
    letterSpacing: 1,
  },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { gap: 6, paddingBottom: 4 },
  emptyContainer: { flex: 1 },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 4, paddingTop: 16,
  },
  emptyIcon: { width: 40, height: 40, opacity: 0.6 },
  emptyText: {
    fontFamily: Fonts.bodyBold,
    color: C.textSub, fontSize: FS.sm,
  },
  emptyHint: {
    fontFamily: Fonts.label,
    color: C.textMuted, fontSize: FS.xs,
  },

  gameCard: {
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gameCardLeft: { flex: 1, gap: 1 },
  gameCardTitle: {
    fontFamily: Fonts.display,
    color: C.textPrimary, fontSize: FS.sm, letterSpacing: 0.5,
  },
  gameCardMeta: {
    fontFamily: Fonts.label,
    color: C.textSub, fontSize: FS.xs,
    letterSpacing: 0.3,
  },
  gameJoinBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  gameJoinBtnDisabled: { opacity: 0.35 },
  gameJoinBtnText: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.xs, letterSpacing: 0.5,
  },

  // Right column
  rightColScroll: {
    flex: 1,
  },
  rightCol: {
    flexGrow: 1,
  },
  rightColInner: {
    flex: 1,
    gap: SP.sm,
  },
  rightColInnerCompact: {
    flex: 0,
    gap: 8,
  },

  // Create card
  createCard: {
    flex: 1,
    backgroundColor: C.vermillion,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  createCardCompact: {
    flex: 0,
    paddingVertical: 8,
  },
  createIcon: { width: 36, height: 36, resizeMode: 'contain' },
  createTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.md, color: C.ink, letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: -4,
  },

  // Invite-code card — same flex as the create card so the column splits evenly
  // on tall screens; on tight screens both compress toward their content.
  inviteCard: {
    flex: 1,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.sm,
    gap: 8,
    justifyContent: 'center',
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteIcon: { width: 22, height: 22, resizeMode: 'contain' },
  inviteHeading: {
    fontFamily: Fonts.label,
    fontSize: FS.xs, letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.textMuted,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  // Roomy variants — header stays at the top, input + JOIN stack full-width
  // and center in the leftover space.
  inviteCardRoomy: {
    justifyContent: 'flex-start',
  },
  inviteRowRoomy: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 8,
  },
  codeInputRoomy: {
    flex: 0,
  },
  codeJoinBtnRoomy: {
    alignItems: 'center',
    paddingVertical: 10,
  },

  input: {
    fontFamily: Fonts.body,
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 2, borderColor: C.ink,
    color: C.textPrimary, fontSize: FS.md,
    paddingHorizontal: SP.sm, paddingVertical: 8,
  },
  codeInput: {
    flex: 1,
    fontFamily: Fonts.display,
    letterSpacing: 4,
    textAlign: 'center',
    fontSize: FS.md,
  },
  codeJoinBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2, borderColor: C.ink,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  codeJoinBtnText: {
    fontFamily: Fonts.display,
    color: C.ink, fontSize: FS.sm, letterSpacing: 0.5,
  },

  btnDisabled: { opacity: 0.4 },
});
