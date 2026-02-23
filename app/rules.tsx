import { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';

const STEPS = [
  {
    number: '1',
    title: 'Draw a card',
    body: 'Scan the QR code on a physical Cinescenes card, or tap "Pick Movie" to draw one randomly from the curated deck.',
    detail: null,
  },
  {
    number: '2',
    title: 'Watch the clip',
    body: "A short trailer plays — no title, no year on screen. Study every frame for clues: costumes, film grain, effects, hair, cars. Everything tells a story.",
    detail: 'Tip: the cinematography style and technology visible on screen are your biggest hints.',
  },
  {
    number: '3',
    title: 'Make your move',
    body: 'Confident you know the movie? Tap "I know it!" to skip straight to placing. Not sure? Let the clip finish — every second counts.',
    detail: null,
  },
  {
    number: '4',
    title: 'Place it on your timeline',
    body: 'Decide where this movie sits in history among your other cards. Your timeline runs from oldest (left) to newest (right). Place the card in the correct slot.',
    detail: 'The more cards on your timeline, the more precise your placement must be.',
  },
  {
    number: '5',
    title: 'Keep it or lose it',
    body: 'Correct placement? The card stays on your timeline. Wrong year? It goes back to the deck — another player can claim it on their turn.',
    detail: null,
  },
  {
    number: '6',
    title: 'First to finish wins',
    body: 'Agree on a target number of cards before the game starts. The first player to correctly place that many movies on their timeline wins the round!',
    detail: 'Recommended: 10 cards for a standard game, 6 for a quick round.',
  },
];

const TIPS = [
  { icon: '🎞️', text: "Decade aesthetics are unmistakable — 70s grain, 80s neon, 90s desaturated tones." },
  { icon: '🌐', text: "Special effects quality is a dead giveaway. Practical vs. CGI sets hard limits on the era." },
  { icon: '👗', text: "Fashion and hairstyles are often more accurate than you think — trust your instincts." },
  { icon: '🎵', text: "The musical score can instantly reveal a decade. Listen carefully even when paused." },
];

export default function RulesScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CINESCENES</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text style={styles.pageTitle}>How to Play</Text>
        <Text style={styles.pageSubtitle}>
          Watch the trailer. Guess the year. Build the perfect timeline.
        </Text>

        {/* Steps */}
        <View style={styles.steps}>
          {STEPS.map((step) => (
            <View key={step.number} style={styles.stepCard}>
              <View style={styles.stepLeft}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNumber}>{step.number}</Text>
                </View>
                {/* Connector line between steps */}
                <View style={styles.stepConnector} />
              </View>
              <View style={styles.stepRight}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
                {step.detail && (
                  <View style={styles.stepDetailRow}>
                    <Text style={styles.stepDetailText}>{step.detail}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Pro tips */}
        <Text style={styles.tipsTitle}>Pro Tips</Text>
        <View style={styles.tipsGrid}>
          {TIPS.map((tip, i) => (
            <View key={i} style={styles.tipCard}>
              <Text style={styles.tipIcon}>{tip.icon}</Text>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/play')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Let's Play  →</Text>
        </TouchableOpacity>

        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100a20',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    color: '#f5c518',
    fontSize: 22,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#f5c518',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 4,
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },

  // ── Page title ──
  pageTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pageSubtitle: {
    color: '#9a9aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 32,
  },

  // ── Steps ──
  steps: {
    gap: 0,
  },
  stepCard: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 0,
  },
  stepLeft: {
    alignItems: 'center',
    width: 36,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5c518',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  stepNumber: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '900',
  },
  stepConnector: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(245,197,24,0.2)',
    marginVertical: 4,
    minHeight: 20,
  },
  stepRight: {
    flex: 1,
    paddingBottom: 28,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 6,
  },
  stepBody: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 21,
  },
  stepDetailRow: {
    marginTop: 8,
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: '#f5c518',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepDetailText: {
    color: '#c8a800',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // ── Divider ──
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 28,
  },

  // ── Pro tips ──
  tipsTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  tipsGrid: {
    gap: 10,
    marginBottom: 32,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tipIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    color: '#bbb',
    fontSize: 13,
    lineHeight: 19,
  },

  // ── CTA ──
  ctaButton: {
    backgroundColor: '#f5c518',
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 8,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0a0a0a',
    letterSpacing: 0.5,
  },
});
