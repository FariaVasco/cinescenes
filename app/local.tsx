import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
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

        {/* Two panels */}
        <View style={styles.panels}>
          {/* JOIN panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Image source={lcMovieTicket} style={styles.panelIcon} />
              <View style={styles.panelHeaderText}>
                <Text style={styles.panelTitle}>JOIN</Text>
                <Text style={styles.panelHint}>Enter the invite code</Text>
              </View>
            </View>

            <TextInput
              style={[styles.input, styles.codeInput]}
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={handleJoin}
            />

            <TouchableOpacity
              style={[styles.actionBtn, styles.joinBtn, !canJoin && styles.actionBtnDisabled]}
              onPress={handleJoin}
              disabled={!canJoin}
              activeOpacity={0.85}
            >
              <Text style={styles.actionBtnText}>JOIN GAME </Text>
            </TouchableOpacity>
          </View>

          {/* CREATE panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Image source={lcClapperboard} style={styles.panelIcon} />
              <View style={styles.panelHeaderText}>
                <Text style={styles.panelTitle}>PRIVATE GAME</Text>
              </View>
            </View>

            <Text style={styles.createBlurb}>
              Start a new game and share the code with your friends.
            </Text>

            <TouchableOpacity
              style={[styles.actionBtn, styles.createBtn, !nameReady && styles.actionBtnDisabled]}
              onPress={handleCreatePress}
              disabled={!nameReady}
              activeOpacity={0.85}
            >
              <Text style={styles.actionBtnText}>CREATE GAME </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
