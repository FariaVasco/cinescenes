import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface CastModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function CastModal({ visible, onDismiss, onConfirm }: CastModalProps) {
  const [fireStickExpanded, setFireStickExpanded] = useState(false);
  const isIOS = Platform.OS === 'ios';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="cast" size={20} color="#f5c518" />
              <Text style={styles.headerTitle}>Cast to TV</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Two-column landscape layout */}
          <View style={styles.columns}>
            {/* Left: steps */}
            <ScrollView
              style={styles.leftCol}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.leftColContent}
            >
              <Text style={styles.stepsLabel}>
                {isIOS ? 'On iPhone / iPad:' : 'On Android:'}
              </Text>

              <View style={styles.steps}>
                {isIOS ? (
                  <>
                    <Step n={1} text="Swipe down from top-right to open Control Centre" />
                    <Step n={2} text='"Screen Mirroring"' />
                    <Step n={3} text="Select your Apple TV or AirPlay 2 TV" />
                  </>
                ) : (
                  <>
                    <Step n={1} text="Swipe down twice to open Quick Settings" />
                    <Step n={2} text='"Cast"' />
                    <Step n={3} text="Select your TV or Chromecast" />
                  </>
                )}
              </View>

              <TouchableOpacity
                style={styles.fireStickToggle}
                onPress={() => setFireStickExpanded((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.fireStickToggleText}>
                  {fireStickExpanded ? '▾' : '▸'}{'  '}Using a Fire Stick?
                </Text>
              </TouchableOpacity>

              {fireStickExpanded && (
                <View style={styles.fireStickBody}>
                  <Text style={styles.fireStickStep}>
                    1. Fire Stick:{' '}
                    <Text style={styles.bold}>Settings → Display &amp; Sounds → Enable Display Mirroring</Text>
                  </Text>
                  <Text style={styles.fireStickStep}>
                    2.{' '}
                    <Text style={styles.bold}>
                      {isIOS
                        ? 'Control Centre → Screen Mirroring → select Fire Stick'
                        : 'Quick Settings → Cast → select Fire Stick'}
                    </Text>
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Right: footnote + CTA */}
            <View style={styles.rightCol}>
              <Text style={styles.footnote}>
                Once mirrored, everything on your phone appears on the TV.
              </Text>
              <TouchableOpacity style={styles.startBtn} onPress={onConfirm}>
                <MaterialCommunityIcons name="cast" size={16} color="#0a0a0a" />
                <Text style={styles.startBtnText}>Start Playing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 680,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: { padding: 4 },
  closeText: { color: '#666', fontSize: 16 },

  columns: {
    flexDirection: 'row',
    padding: 16,
  },
  leftCol: {
    flex: 1,
    maxHeight: 200,
  },
  leftColContent: {
    paddingRight: 16,
    gap: 0,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
  },
  rightCol: {
    width: 180,
    paddingLeft: 16,
    justifyContent: 'space-between',
    gap: 14,
  },

  stepsLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  steps: {
    gap: 9,
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f5c518',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNum: {
    color: '#0a0a0a',
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: '#ddd',
    fontSize: 13,
    lineHeight: 18,
  },

  fireStickToggle: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  fireStickToggleText: {
    color: '#777',
    fontSize: 12,
    fontWeight: '500',
  },
  fireStickBody: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginTop: 6,
  },
  fireStickStep: {
    color: '#888',
    fontSize: 11,
    lineHeight: 16,
  },
  bold: {
    color: '#bbb',
    fontWeight: '600',
  },

  footnote: {
    flex: 1,
    color: '#555',
    fontSize: 11,
    lineHeight: 16,
  },
  startBtn: {
    backgroundColor: '#f5c518',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  startBtnText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '800',
  },
});
