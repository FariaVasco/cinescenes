import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

type ErrorInfo = { title: string; body: string };

export default function ScannerScreen() {
  const router = useRouter();
  const { setCurrentMovie, setFromScanner } = useAppStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionEmoji}>📷</Text>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            Point your camera at the QR code on the back of a Cinescenes card.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    const movieId = extractMovieId(data);
    if (!movieId) {
      setError({
        title: 'Invalid card',
        body: "This QR code isn't a valid Cinescenes card. Try holding the camera closer and making sure the code is fully in frame.",
      });
      return;
    }

    const { data: movie, error: dbError } = await supabase
      .from('movies')
      .select('*')
      .eq('id', movieId)
      .single();

    if (dbError || !movie) {
      setError({
        title: 'Movie not found',
        body: "We couldn't find this movie in the database. It may have been removed or the card might be from an older version.",
      });
      return;
    }

    if (!movie.active || !movie.youtube_id) {
      setError({
        title: 'Trailer unavailable',
        body: "This movie's trailer isn't ready yet. Try a different card for now — we'll have it ready soon!",
      });
      return;
    }

    setCurrentMovie(movie);
    setFromScanner(true);
    router.replace('/trailer');
  }

  function dismissError(andGoBack = false) {
    setError(null);
    if (andGoBack) {
      router.back();
    } else {
      setScanned(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Dimmed overlay with cutout hint */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddleRow}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame} />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom} />
      </View>

      <SafeAreaView style={styles.ui}>
        <TouchableOpacity style={styles.closeButton} onPress={() => setShowExitDialog(true)}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.hint}>
          <Text style={styles.hintText}>Align QR code with the frame</Text>
        </View>
      </SafeAreaView>

      {/* Exit confirmation modal */}
      <Modal
        visible={showExitDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitDialog(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowExitDialog(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.exitSheet}>
            <View style={styles.exitSheetLeft}>
              <Text style={styles.exitTitle}>Stop scanning?</Text>
              <Text style={styles.exitBody}>Your current card session will end.</Text>
            </View>
            <View style={styles.exitSheetRight}>
              <TouchableOpacity style={styles.stayBtn} onPress={() => setShowExitDialog(false)}>
                <Text style={styles.stayBtnText}>Keep scanning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => { setShowExitDialog(false); router.back(); }}
              >
                <Text style={styles.leaveBtnText}>Stop →</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Error modal */}
      <Modal
        visible={!!error}
        transparent
        animationType="fade"
        onRequestClose={() => dismissError(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => dismissError(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.errorSheet}>
            <Text style={styles.errorTitle}>{error?.title}</Text>
            <Text style={styles.errorBody}>{error?.body}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.stayBtn} onPress={() => dismissError(true)}>
                <Text style={styles.stayBtnText}>Go back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.leaveBtn} onPress={() => dismissError(false)}>
                <Text style={styles.leaveBtnText}>Try again →</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function extractMovieId(data: string): string | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(data)) return data;
  const urlMatch = data.match(/\/movie\/([0-9a-f-]{36})/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 2,
    borderColor: '#f5c518',
    borderRadius: 12,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ui: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  closeButton: {
    margin: 16,
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  hintText: {
    color: '#fff',
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  permissionEmoji: {
    fontSize: 48,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: '#f5c518',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 15,
    color: '#666',
  },
  // ── Modals (landscape-optimised) ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  // Exit — horizontal card
  exitSheet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 560,
  },
  exitSheetLeft: {
    flex: 1,
    gap: 5,
  },
  exitTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  exitBody: {
    color: '#888',
    fontSize: 13,
  },
  exitSheetRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stayBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  stayBtnText: {
    color: '#777',
    fontSize: 15,
    fontWeight: '600',
  },
  leaveBtn: {
    backgroundColor: '#f5c518',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  leaveBtnText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '700',
  },
  // Error — compact centred card
  errorSheet: {
    backgroundColor: '#1a1a2e',
    borderRadius: 18,
    padding: 24,
    gap: 10,
    width: '100%',
    maxWidth: 420,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  errorBody: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
});
