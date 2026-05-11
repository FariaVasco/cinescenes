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

const db = supabase as unknown as { from: (t: string) => any };

type Category = 'works_well' | 'improvement' | 'bug' | 'idea';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'works_well',  label: 'Works well',  icon: '✓' },
  { key: 'improvement', label: 'Improvement', icon: '↑' },
  { key: 'bug',         label: 'Bug',         icon: '!' },
  { key: 'idea',        label: 'Idea',        icon: '✦' },
];

const MAX_NOTE = 1000;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackSheet({ visible, onClose }: Props) {
  const { authUser } = useAppStore();
  const [category, setCategory] = useState<Category>('improvement');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory('improvement');
      setNote('');
      setEmail('');
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [visible]);

  if (!visible) return null;

  const noteTrim = note.trim();
  const canSend = noteTrim.length > 0 && !submitting;

  async function handleSend() {
    if (!canSend) return;
    setSubmitting(true);
    haptics.select();
    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const appVersion =
      (Constants.expoConfig as any)?.version ?? (Constants as any).manifest?.version ?? null;
    const { error } = await db.from('feedback').insert({
      category,
      note: noteTrim,
      email: email.trim() || null,
      user_id: authUser?.id ?? null,
      app_version: appVersion,
      platform,
    });
    setSubmitting(false);
    if (error) {
      haptics.error();
      if (__DEV__) console.warn('[feedback] insert failed', error);
      return;
    }
    haptics.success();
    setSubmitted(true);
    setTimeout(onClose, 1100);
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
              <Text style={styles.headerTitle}>DIRECTOR'S NOTES</Text>
              <Text style={styles.headerSub}>TELL US WHAT PLAYS — AND WHAT CUTS</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {submitted ? (
            <View style={styles.thanksWrap}>
              <Text style={styles.thanksTitle}>THANKS!</Text>
              <Text style={styles.thanksSub}>Your note is in the can.</Text>
            </View>
          ) : (
            /* Two-column body — no ScrollView needed in landscape */
            <View style={styles.body}>

              {/* Left column: category */}
              <View style={styles.leftCol}>
                <Text style={styles.fieldLabel}>CATEGORY</Text>
                <View style={styles.chipList}>
                  {CATEGORIES.map((c) => {
                    const active = c.key === category;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { setCategory(c.key); haptics.select(); }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipIcon, active && styles.chipIconActive]}>{c.icon}</Text>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Right column: note + email + send */}
              <View style={styles.rightCol}>
                <View style={styles.noteHeaderRow}>
                  <Text style={styles.fieldLabel}>YOUR NOTE</Text>
                  <Text style={styles.charCount}>{note.length}/{MAX_NOTE}</Text>
                </View>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, MAX_NOTE))}
                  placeholder="What worked, what didn't, what you'd love to see..."
                  placeholderTextColor={C.textMutedDark}
                  multiline
                  textAlignVertical="top"
                />

                <View style={styles.bottomRow}>
                  <TextInput
                    style={styles.emailInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email (optional)"
                    placeholderTextColor={C.textMutedDark}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                    onPress={handleSend}
                    activeOpacity={0.85}
                    disabled={!canSend}
                  >
                    {submitting ? (
                      <ActivityIndicator color={C.ink} />
                    ) : (
                      <Text style={styles.sendText}>SEND</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

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
    width: '86%',
    maxWidth: 680,
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

  // Two-column body
  body: {
    flexDirection: 'row',
    padding: SP.sm,
    gap: SP.sm,
  },

  // Left: categories
  leftCol: {
    width: 136,
    gap: 6,
  },
  chipList: {
    gap: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SP.sm,
    paddingVertical: 6,
    borderRadius: R.sm,
    borderWidth: 2,
    borderColor: STROKE,
    backgroundColor: SURFACE,
  },
  chipActive: {
    backgroundColor: C.goldFaint,
    borderColor: C.ochre,
  },
  chipIcon: {
    fontFamily: Fonts.display,
    fontSize: FS.base,
    color: C.textMutedDark,
    width: 16,
    textAlign: 'center',
  },
  chipIconActive: { color: C.ochre },
  chipText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.textPrimaryDark,
    letterSpacing: 0.5,
  },
  chipTextActive: { color: C.ochre },

  // Divider
  divider: {
    width: 1,
    backgroundColor: STROKE,
    alignSelf: 'stretch',
  },

  // Right: note + email + send
  rightCol: {
    flex: 1,
    gap: 6,
  },
  noteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  fieldLabel: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMutedDark,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  charCount: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    color: C.textMutedDark,
    letterSpacing: 1,
  },
  noteInput: {
    flex: 1,
    minHeight: 60,
    backgroundColor: SURFACE,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: STROKE,
    paddingHorizontal: SP.sm,
    paddingVertical: 6,
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontSize: FS.md,
  },
  bottomRow: {
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
    paddingVertical: 6,
    color: C.textPrimaryDark,
    fontFamily: Fonts.body,
    fontSize: FS.md,
  },
  sendBtn: {
    minWidth: 80,
    paddingHorizontal: SP.md,
    paddingVertical: 8,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    backgroundColor: C.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.ink,
    letterSpacing: 1,
  },

  // Thanks state
  thanksWrap: {
    paddingVertical: SP.xl + SP.lg,
    alignItems: 'center',
    gap: SP.sm,
  },
  thanksTitle: {
    fontFamily: Fonts.display,
    fontSize: FS['2xl'],
    color: C.ochre,
    letterSpacing: 2,
  },
  thanksSub: {
    fontFamily: Fonts.body,
    fontSize: FS.md,
    color: C.textPrimaryDark,
  },
});
