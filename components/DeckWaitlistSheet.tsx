import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { C, R, SP, Fonts, FS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import * as haptics from '@/lib/haptics';
import { getDeviceId } from '@/lib/device-id';

const db = supabase as unknown as { from: (t: string) => any };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientMeta() {
  const platform: 'ios' | 'android' | 'web' =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const appVersion =
    (Constants.expoConfig as any)?.version ?? (Constants as any).manifest?.version ?? null;
  let locale: string | null = null;
  try { locale = Intl.DateTimeFormat().resolvedOptions().locale ?? null; } catch {}
  return { platform, app_version: appVersion, locale, device_id: await getDeviceId() };
}

// Fire-and-forget interest signal for every press of the USE DECK tile.
// Count people with count(distinct device_id), not raw rows.
export async function logDeckTap(userId: string | null) {
  const { error } = await db.from('deck_waitlist')
    .insert({ event: 'tap', user_id: userId, ...(await clientMeta()) });
  if (error && __DEV__) console.warn('[deck-waitlist] tap log failed', error);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onHaveDeck: () => void;
}

export function DeckWaitlistSheet({ visible, onClose, onHaveDeck }: Props) {
  const { authUser } = useAppStore();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'joined' | 'already' | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(authUser?.email ?? '');
      setSubmitting(false);
      setResult(null);
      setFailed(false);
    }
  }, [visible]);

  if (!visible) return null;

  const emailTrim = email.trim();
  const canJoin = EMAIL_RE.test(emailTrim) && !submitting;

  async function handleJoin() {
    if (!canJoin) return;
    setSubmitting(true);
    setFailed(false);
    haptics.select();
    const { error } = await db.from('deck_waitlist').insert({
      event: 'signup',
      email: emailTrim.toLowerCase(),
      user_id: authUser?.id ?? null,
      ...(await clientMeta()),
    });
    setSubmitting(false);
    if (error && error.code !== '23505') {
      haptics.error();
      setFailed(true);
      if (__DEV__) console.warn('[deck-waitlist] signup failed', error);
      return;
    }
    haptics.success();
    setResult(error ? 'already' : 'joined');
    setTimeout(onClose, 1600);
  }

  return (
    <View style={styles.fill}>
      <View style={styles.scrim} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.card} onStartShouldSetResponder={() => true}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>THE CINESCENES DECK</Text>
              <Text style={styles.headerSub}>PHYSICAL CARDS — COMING SOON</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {result ? (
            <View style={styles.thanksWrap}>
              <Text style={styles.thanksTitle}>{result === 'joined' ? "YOU'RE ON THE LIST!" : 'ALREADY ON THE LIST'}</Text>
              <Text style={styles.thanksSub}>We'll email you when the deck hits the shelves.</Text>
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={styles.pitch}>
                A printed deck of movie cards to play around the table. Scan a card, watch the
                scene, place it on your timeline. Want to know when it's out?
              </Text>

              <View style={styles.joinRow}>
                <TextInput
                  style={styles.emailInput}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setFailed(false); }}
                  placeholder="Your email"
                  placeholderTextColor={C.textMutedDark}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="done"
                  onSubmitEditing={handleJoin}
                />
                <TouchableOpacity
                  style={[styles.joinBtn, !canJoin && styles.joinBtnDisabled]}
                  onPress={handleJoin}
                  activeOpacity={0.85}
                  disabled={!canJoin}
                >
                  {submitting ? (
                    <ActivityIndicator color={C.ink} />
                  ) : (
                    <Text style={styles.joinText}>JOIN WAITLIST</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.finePrint, failed && styles.errorText]}>
                {failed
                  ? "Couldn't join right now. Check your connection and try again."
                  : "We'll only email you about the deck launch."}
              </Text>

              <TouchableOpacity onPress={onHaveDeck} hitSlop={8} style={styles.haveDeckBtn}>
                <Text style={styles.haveDeckText}>I already have a deck →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const HEADER_BG = C.ochre;
const SHEET_BG  = '#3A3128';
const SURFACE   = 'rgba(255,255,255,0.05)';
const STROKE    = 'rgba(255,255,255,0.18)';

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1500,
    elevation: 1500,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
  },
  card: {
    width: '80%',
    maxWidth: 560,
    backgroundColor: SHEET_BG,
    borderRadius: R.sheet,
    borderWidth: 2,
    borderColor: C.ink,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HEADER_BG,
    paddingHorizontal: SP.md,
    paddingVertical: 6,
    gap: SP.sm,
    borderBottomWidth: 2,
    borderBottomColor: C.ink,
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ink,
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.ink,
    letterSpacing: 1.5,
    marginTop: 1,
  },
  closeBtn: { padding: 6 },
  closeBtnText: {
    fontSize: 20,
    color: C.ink,
    fontFamily: Fonts.body,
  },

  // Body
  body: {
    padding: SP.md,
    gap: SP.sm,
  },
  pitch: {
    fontFamily: Fonts.body,
    fontSize: FS.md,
    color: C.textPrimaryDark,
    lineHeight: FS.md * 1.4,
  },
  joinRow: {
    flexDirection: 'row',
    gap: SP.sm,
    alignItems: 'center',
  },
  emailInput: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: STROKE,
    paddingHorizontal: SP.sm,
    paddingVertical: 8,
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontSize: FS.md,
  },
  joinBtn: {
    minWidth: 130,
    paddingHorizontal: SP.md,
    paddingVertical: 10,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    backgroundColor: C.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnDisabled: { opacity: 0.5 },
  joinText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.ink,
    letterSpacing: 1,
  },
  finePrint: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMutedDark,
    letterSpacing: 0.5,
  },
  errorText: { color: C.vermillion },
  haveDeckBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  haveDeckText: {
    fontFamily: Fonts.body,
    fontSize: FS.sm,
    color: C.textMutedDark,
    textDecorationLine: 'underline',
  },

  // Thanks state
  thanksWrap: {
    paddingVertical: SP.xl + SP.lg,
    paddingHorizontal: SP.md,
    alignItems: 'center',
    gap: SP.sm,
  },
  thanksTitle: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    color: C.ochre,
    letterSpacing: 2,
    textAlign: 'center',
  },
  thanksSub: {
    fontFamily: Fonts.body,
    fontSize: FS.md,
    color: C.textPrimaryDark,
    textAlign: 'center',
  },
});
