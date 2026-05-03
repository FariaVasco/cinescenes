import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R, Fonts, FS, SP } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { presentCustomerCenter } from '@/lib/revenuecat';
import { RulesCarousel } from '@/components/RulesCarousel';

const lcLogo            = require('@/assets/lc-logo-without-background.png');
const lcClapperboard    = require('@/assets/lc-clapperboard.png');
const lcIconHow         = require('@/assets/lc-icon-how.png');
const lcIconSettings    = require('@/assets/lc-icon-settings.png');
const lcFriendsCinema   = require('@/assets/lc-friends-cinema.png');
const lcPeopleHomeTV    = require('@/assets/lc-people-home-tv.png');
const lcFriendsCardsW   = require('@/assets/lc-friends-cards-wide.png');

type MenuView = 'play' | 'rules' | 'settings';

export default function LandingScreen() {
  const [view, setView] = useState<MenuView>('play');
  const { setActiveMovies } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  useEffect(() => {
    fetchActiveMovies();
  }, []);

  async function fetchActiveMovies() {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .eq('scan_status', 'validated');
    if (data && !error) setActiveMovies(data);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.row}>
        <SideMenu view={view} setView={setView} />
        <View style={styles.right}>
          {view === 'play' && <PlayView />}
          {view === 'rules' && <RulesView />}
          {view === 'settings' && <SettingsView />}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Side menu ───────────────────────────────────────────────────────────────

function SideMenu({ view, setView }: { view: MenuView; setView: (v: MenuView) => void }) {
  return (
    <View style={styles.menu}>
      <View style={styles.brandRow}>
        <Image source={lcLogo} style={styles.brandIcon} />
        <Text style={styles.brandTitle} numberOfLines={1} adjustsFontSizeToFit>CINESCENES </Text>
      </View>

      <View style={styles.menuItems}>
        <MenuItem image={lcClapperboard} label="PLAY "        active={view === 'play'}     onPress={() => setView('play')} />
        <MenuItem image={lcIconHow}      label="HOW TO PLAY " active={view === 'rules'}    onPress={() => setView('rules')} />
        <MenuItem image={lcIconSettings} label="SETTINGS "    active={view === 'settings'} onPress={() => setView('settings')} />
      </View>
    </View>
  );
}

function MenuItem({ icon, image, label, active, onPress }: { icon?: string; image?: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.menuItem, active && styles.menuItemActive]}
    >
      <View style={[styles.menuItemIconWrap, active && styles.menuItemIconWrapActive]}>
        {image
          ? <Image source={image} style={styles.menuItemIconImg} />
          : <Text style={[styles.menuItemIcon, active && styles.menuItemIconActive]}>{icon}</Text>
        }
      </View>
      <Text style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Right panel: Play ───────────────────────────────────────────────────────

function PlayView() {
  const router = useRouter();
  const [gridH, setGridH] = useState(0);
  const gap = SP.sm;
  const square = gridH ? (gridH - gap) / 2 : 0;
  const wideW = square * 2 + gap;

  return (
    <View style={styles.viewWrap}>
      <View
        style={styles.playGrid}
        onLayout={(e) => setGridH(e.nativeEvent.layout.height)}
      >
        <View style={styles.playRow}>
          <ModeCard
            label="LOCAL"
            image={lcFriendsCinema}
            onPress={() => router.push('/local')}
            style={{ width: square, height: square }}
          />
          <ModeCard
            label="ONLINE"
            image={lcPeopleHomeTV}
            onPress={() => router.push('/online')}
            style={{ width: square, height: square }}
          />
        </View>
        <View style={styles.playRowCenter}>
          <ModeCard
            label="USE DECK"
            image={lcFriendsCardsW}
            onPress={() => router.push('/scanner')}
            style={{ width: wideW, height: square }}
          />
        </View>
      </View>
    </View>
  );
}

function ModeCard({ label, image, onPress, style }: { label: string; image: any; onPress: () => void; style?: any }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.modeCard, style]}>
      <Image source={image} style={styles.modeImage} />
      <View style={styles.modeLabelBand}>
        <Text style={styles.modeLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Right panel: Rules (How to Play) ────────────────────────────────────────

function RulesView() {
  return (
    <View style={styles.viewWrap}>
      <RulesCarousel />
    </View>
  );
}

// ── Right panel: Settings (Account + Preferences) ───────────────────────────

const SETTINGS_STORAGE_KEY = 'app_settings_v1';
type SettingsState = { soundEffects: boolean; music: boolean; vibration: boolean };
const SETTINGS_DEFAULTS: SettingsState = { soundEffects: true, music: true, vibration: true };

function SettingsView() {
  const { authUser, isPremium } = useAppStore();
  const { signInWithApple, signInWithGoogle, signOut } = useAuth();
  const [settings, setSettings] = useState<SettingsState>(SETTINGS_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setSettings({ ...SETTINGS_DEFAULTS, ...JSON.parse(raw) }); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, loaded]);

  function toggle<K extends keyof SettingsState>(key: K) {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleSignIn() {
    setAuthBusy(true);
    try {
      if (Platform.OS === 'ios') await signInWithApple();
      else await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', e?.message ?? 'Could not sign in');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const meta = authUser?.user_metadata ?? {};
  const displayName = (meta.full_name || meta.name || meta.given_name || authUser?.email || 'Guest').toString();
  const email = authUser?.email ?? '';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.viewWrap}>
      <ScrollView contentContainerStyle={styles.settingsContent}>
        {/* Account section */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.sectionCard}>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{authUser ? initials : '·'}</Text>
            </View>
            <View style={styles.accountText}>
              <Text style={styles.accountName} numberOfLines={1}>{displayName}</Text>
              {!!email && <Text style={styles.accountEmail} numberOfLines={1}>{email}</Text>}
            </View>
            <View style={[styles.premiumBadge, isPremium ? styles.premiumBadgeActive : styles.premiumBadgeInactive]}>
              <Text style={[styles.premiumBadgeText, isPremium ? styles.premiumBadgeTextActive : styles.premiumBadgeTextInactive]}>
                {isPremium ? 'PRO ' : 'FREE '}
              </Text>
            </View>
          </View>

          {authUser ? (
            <View style={styles.accountActions}>
              <TouchableOpacity
                style={[styles.accountBtn, styles.accountBtnPrimary]}
                onPress={() => presentCustomerCenter()}
                activeOpacity={0.85}
              >
                <Text style={styles.accountBtnPrimaryText}>Manage Subscription </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accountBtn, styles.accountBtnSecondary]}
                onPress={handleSignOut}
                activeOpacity={0.85}
              >
                <Text style={styles.accountBtnSecondaryText}>Sign Out </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.accountBtn, styles.accountBtnPrimary, styles.accountBtnFull, authBusy && styles.accountBtnDisabled]}
              onPress={handleSignIn}
              disabled={authBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.accountBtnPrimaryText}>
                {authBusy ? '…' : Platform.OS === 'ios' ? 'Sign in with Apple' : 'Sign in with Google'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Preferences section */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.sectionCard}>
          <PrefRow label="Sound Effects" value={settings.soundEffects} onChange={() => toggle('soundEffects')} />
          <PrefRow label="Music"         value={settings.music}        onChange={() => toggle('music')} />
          <PrefRow label="Vibration"     value={settings.vibration}    onChange={() => toggle('vibration')} />
        </View>
      </ScrollView>
    </View>
  );
}

function PrefRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.inkFaint, true: C.ochre }}
        thumbColor={C.surface}
        ios_backgroundColor={C.inkFaint}
      />
    </View>
  );
}

// ── Shared panel header ─────────────────────────────────────────────────────

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.panelHeader}>
      <Text style={styles.panelTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.panelSub}>{subtitle}</Text>}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flex: 1, flexDirection: 'row' },

  // ── Side menu ────────────────────────────────────────────────────
  menu: {
    flex: 1,
    paddingLeft: SP.xl,
    paddingRight: SP.md,
    paddingVertical: SP.sm,
    gap: SP.lg,
    borderRightWidth: 2,
    borderRightColor: C.inkFaint,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
  },
  brandIcon: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
    marginTop: 4,
  },
  brandTitle: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: FS.hero,
    color: C.ochre,
    letterSpacing: 2,
  },

  menuItems: { gap: 6, paddingLeft: SP.md },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    paddingVertical: 8,
    paddingHorizontal: SP.sm,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  menuItemActive: {
    backgroundColor: C.ochre,
    borderColor: C.ink,
  },
  menuItemIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemIconWrapActive: {},
  menuItemIcon: {
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    color: C.textSub,
  },
  menuItemIconActive: {
    color: C.ink,
  },
  menuItemIconImg: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  menuItemLabel: {
    fontFamily: Fonts.display,
    fontSize: FS.lg,
    color: C.textSub,
    letterSpacing: 1,
  },
  menuItemLabelActive: {
    color: C.ink,
  },

  // ── Right panel ────────────────────────────────────────────────
  right: {
    flex: 2.4,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  viewWrap: { flex: 1 },

  panelHeader: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SP.sm,
  },
  panelTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ochre,
    letterSpacing: 1,
  },
  panelSub: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Play view ──────────────────────────────────────────────────
  playGrid: {
    flex: 1,
    gap: SP.sm,
    paddingTop: 4,
    paddingBottom: 4,
  },
  playRow: {
    flexDirection: 'row',
    gap: SP.sm,
    justifyContent: 'center',
  },
  playRowCenter: {
    alignItems: 'center',
  },
  modeCard: {
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    overflow: 'hidden',
  },
  modeImage: {
    flex: 1,
    width: '100%',
    resizeMode: 'cover',
  },
  modeLabelBand: {
    paddingVertical: 4,
    paddingHorizontal: SP.sm,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderTopColor: C.ink,
  },
  modeLabel: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ochre,
    letterSpacing: 2,
  },

  // ── Settings view ──────────────────────────────────────────────
  settingsContent: { gap: 6, paddingBottom: SP.sm },
  sectionLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 6,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: C.surfaceWarm,
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.sm,
    gap: 8,
  },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: R.full,
    backgroundColor: C.ochre,
    borderWidth: 2,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ink,
    letterSpacing: 0.5,
  },
  accountText: { flex: 1, gap: 1 },
  accountName: {
    fontFamily: Fonts.bodyBold,
    fontSize: FS.base,
    color: C.textPrimary,
  },
  accountEmail: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMuted,
  },
  premiumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: R.full,
    borderWidth: 2,
  },
  premiumBadgeActive: {
    backgroundColor: C.ochre,
    borderColor: C.ink,
  },
  premiumBadgeInactive: {
    backgroundColor: 'transparent',
    borderColor: C.inkSoft,
  },
  premiumBadgeText: {
    fontFamily: Fonts.display,
    fontSize: FS.xs,
    letterSpacing: 1,
  },
  premiumBadgeTextActive:   { color: C.ink },
  premiumBadgeTextInactive: { color: C.textMuted },

  accountActions: {
    flexDirection: 'row',
    gap: SP.sm,
  },
  accountBtn: {
    flex: 1,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 8,
    alignItems: 'center',
  },
  accountBtnFull: { flex: undefined as any, alignSelf: 'stretch' },
  accountBtnPrimary: { backgroundColor: C.ochre },
  accountBtnSecondary: { backgroundColor: 'transparent' },
  accountBtnDisabled: { opacity: 0.4 },
  accountBtnPrimaryText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.ink,
    letterSpacing: 0.5,
  },
  accountBtnSecondaryText: {
    fontFamily: Fonts.display,
    fontSize: FS.sm,
    color: C.textSub,
    letterSpacing: 0.5,
  },

  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  prefLabel: {
    fontFamily: Fonts.body,
    fontSize: FS.base,
    color: C.textPrimary,
  },
});
