import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R, FS, Fonts, SP } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { ModePickerModal, ModeChoice } from '@/components/ModePickerModal';
import { useAppStore } from '@/store/useAppStore';
import { GAME_CODE_LENGTH, GAME_CODE_PLACEHOLDER, sanitizeGameCodeInput } from '@/lib/game-code';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const lcClapperboard = require('@/assets/lc-clapperboard.png');
const lcMovieTicket  = require('@/assets/lc-movie-ticket.png');

export default function LocalScreen() {
  const router = useRouter();
  const { pendingMode } = useLocalSearchParams<{ pendingMode?: string }>();
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
  const [modePickerVisible, setModePickerVisible] = useState(false);
  const [autoOpenMode, setAutoOpenMode] = useState<'insane' | 'collection' | null>(null);
  // Keyboard mode (iOS only, and only while the CODE field is focused). The name
  // field needs no special handling — it sits at the top of the screen, naturally
  // above the keyboard; hiding things on mere keyboard-visibility would unmount
  // the focused name input and kill its own keyboard.
  // While typing the code, both panels stay side by side and complete: the layout
  // compacts first (slack space collapses, panels hug their content at full size),
  // and only if the compact layout still doesn't fit does everything shrink
  // uniformly. No transforms/remounts — those make iPadOS dismiss the keyboard.
  const keyboardHeight = useKeyboardHeight();
  const [scrollAreaH, setScrollAreaH] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);
  // Compact-layout height at full size, measured once per keyboard session.
  const [compactH, setCompactH] = useState(0);
  const keyboardMode = Platform.OS === 'ios' && keyboardHeight > 0 && codeFocused;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!keyboardMode) setCompactH(0);
    // Pin the strip to the top of the scroll area whenever the mode flips.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [keyboardMode]);
  // 8pt safety margin: measured heights land a hair optimistic (rounding, borders),
  // which showed as a sliver of panel under the keyboard's top edge.
  const fitHeight = keyboardMode && scrollAreaH > 0
    ? Math.max(90, scrollAreaH - keyboardHeight - 8)
    : undefined;
  const compact = keyboardMode ? {
    panels: { flex: 0 as const, paddingTop: 2, paddingBottom: 4 },
    panel: { justifyContent: 'flex-start' as const, gap: 6, paddingVertical: 6 },
  } : null;
  // Shrink only as a last resort — k stays 1 while the compact layout fits.
  const k = fitHeight !== undefined && compactH > 0
    ? Math.max(0.5, Math.min(1, fitHeight / compactH))
    : 1;
  const kz = (v: number) => Math.round(v * k);
  const shrink = k < 1 ? {
    icon: { width: kz(36), height: kz(36) },
    title: { fontSize: kz(FS.lg), lineHeight: kz(FS.lg) + 2 },
    hint: { fontSize: Math.max(8, kz(FS.xs)) },
    input: { fontSize: kz(FS.md), paddingVertical: kz(9) },
    code: { fontSize: kz(FS.lg), letterSpacing: kz(6) },
    blurb: { fontSize: Math.max(9, kz(FS.sm)), lineHeight: kz(18) },
    btn: { paddingVertical: kz(10) },
    btnText: { fontSize: kz(FS.md) },
  } : null;
  // If we returned from sign-in with a pending mode intent, auto-open the picker
  useEffect(() => {
    if (!pendingMode || !authUser) return;
    if (pendingMode === 'insane' || pendingMode === 'collection') {
      setAutoOpenMode(pendingMode);
      setModePickerVisible(true);
      // Clear the URL param so this doesn't re-fire on re-mount
      router.setParams({ pendingMode: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMode, authUser]);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
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

  const nameReady = displayName.trim().length > 0;
  const canJoin = nameReady && inviteCode.trim().length > 0;

  function handleJoin() {
    if (!canJoin) return;
    router.push({
      pathname: '/local-lobby',
      params: { joinCode: inviteCode.trim().toUpperCase(), displayName: displayName.trim() },
    });
  }

  function handleCreatePress() {
    if (!nameReady) return;
    setModePickerVisible(true);
  }

  function handleModeSelected(choice: ModeChoice) {
    setSelectedVisibility('invite_only');
    setSelectedGameMode(choice.mode);
    setSelectedCollectionId(choice.mode === 'collection' ? choice.collectionId : null);
    router.push({
      pathname: '/local-lobby',
      params: { startView: 'create', displayName: displayName.trim() },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Compact header — Back left, title stack centered */}
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} style={styles.backBtn} />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
            LOCAL GAME {}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* No automaticallyAdjustKeyboardInsets: UIKit's scroll-into-view runs against
          the full-size layout during keyboard presentation and leaves a stale offset
          once we compact — the compact layout already fits everything above the
          keyboard, so no native adjustment is wanted. Scroll stays pinned to top. */}
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, fitHeight !== undefined && { flexGrow: 0, height: fitHeight }]}
        onLayout={(e) => setScrollAreaH(e.nativeEvent.layout.height)}
        scrollEnabled={!keyboardMode}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Tapping anywhere that isn't a control closes the keyboard */}
        <Pressable style={styles.dismissArea} onPress={Keyboard.dismiss}>
        {/* Single shared name field — hidden while typing the code */}
        <View style={[styles.nameRow, keyboardMode && styles.hidden]}>
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

        {/* Two panels — side by side; keyboard mode compacts them (shrinks only if needed) */}
        <View
          style={[styles.panels, compact && compact.panels]}
          onLayout={(e) => {
            if (keyboardMode && compactH === 0) setCompactH(e.nativeEvent.layout.height);
          }}
        >
          {/* JOIN panel */}
          <View style={[styles.panel, compact && compact.panel]}>
            <View style={styles.panelHeader}>
              <Image source={lcMovieTicket} style={[styles.panelIcon, shrink && shrink.icon]} />
              <View style={styles.panelHeaderText}>
                <Text style={[styles.panelTitle, shrink && shrink.title]}>JOIN</Text>
                <Text style={[styles.panelHint, shrink && shrink.hint]}>Enter the invite code</Text>
              </View>
            </View>

            <TextInput
              style={[styles.input, styles.codeInput, shrink && shrink.input, shrink && shrink.code]}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(sanitizeGameCodeInput(t))}
              placeholder={GAME_CODE_PLACEHOLDER}
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              maxLength={GAME_CODE_LENGTH}
              returnKeyType="go"
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              onSubmitEditing={handleJoin}
            />

            <TouchableOpacity
              style={[styles.actionBtn, styles.joinBtn, shrink && shrink.btn, !canJoin && styles.actionBtnDisabled]}
              onPress={handleJoin}
              disabled={!canJoin}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnText, shrink && shrink.btnText]}>JOIN GAME </Text>
            </TouchableOpacity>
          </View>

          {/* CREATE panel */}
          <View style={[styles.panel, compact && compact.panel]}>
            <View style={styles.panelHeader}>
              <Image source={lcClapperboard} style={[styles.panelIcon, shrink && shrink.icon]} />
              <View style={styles.panelHeaderText}>
                <Text style={[styles.panelTitle, shrink && shrink.title]}>PRIVATE GAME</Text>
              </View>
            </View>

            <Text style={[styles.createBlurb, shrink && shrink.blurb]}>
              Start a new game and share the code with your friends.
            </Text>

            <TouchableOpacity
              style={[styles.actionBtn, styles.createBtn, shrink && shrink.btn, !nameReady && styles.actionBtnDisabled]}
              onPress={handleCreatePress}
              disabled={!nameReady}
              activeOpacity={0.85}
            >
              <Text style={[styles.actionBtnText, shrink && shrink.btnText]}>CREATE GAME </Text>
            </TouchableOpacity>
          </View>
        </View>
        </Pressable>
      </ScrollView>

      <ModePickerModal
        visible={modePickerVisible}
        onClose={() => { setModePickerVisible(false); setAutoOpenMode(null); }}
        onSelected={handleModeSelected}
        autoOpenMode={autoOpenMode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  dismissArea: { flex: 1 },
  hidden: { display: 'none' },

  // Header — Back + stacked title/subtitle centered
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

  // Panels
  panels: {
    flex: 1,
    flexDirection: 'row',
    gap: SP.sm,
    paddingHorizontal: SP.md,
    paddingTop: 4,
    paddingBottom: SP.md,
  },
  panel: {
    flex: 1,
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    justifyContent: 'space-between',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelIcon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  panelHeaderText: { flex: 1 },
  panelTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    color: C.ochre,
    letterSpacing: 1,
    lineHeight: FS.lg + 2,
  },
  panelHint: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  input: {
    fontFamily: Fonts.body,
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.ink,
    color: C.textPrimary,
    fontSize: FS.md,
    paddingHorizontal: SP.md,
    paddingVertical: 9,
  },
  codeInput: {
    fontFamily: Fonts.display,
    letterSpacing: 6,
    textAlign: 'center',
    fontSize: FS.lg,
  },

  createBlurb: {
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    color: C.textSub,
    lineHeight: 18,
  },

  actionBtn: {
    width: '100%',
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 10,
    alignItems: 'center',
  },
  joinBtn: { backgroundColor: C.ochre },
  createBtn: { backgroundColor: C.vermillion },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.ink,
    letterSpacing: 1,
  },
});
