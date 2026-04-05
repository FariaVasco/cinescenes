import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ScreenOrientation from 'expo-screen-orientation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { C, R, FS, Fonts } from '@/constants/theme';
import { CloseIcon } from '@/components/CinemaIcons';

type ErrorInfo = { title: string; body: string };

export default function ScannerScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );
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
          <CloseIcon size={18} color='#fff' />
        </TouchableOpacity>
        <View style={styles.hint}>
          <Text style={styles.hintText}>Align QR code with the frame</Text>
        </View>
      </SafeAreaView>

      {/* Exit confirmation overlay */}
      {showExitDialog && (
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
      )}

      {/* Error overlay */}
      {!!error && (
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
      )}
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
    borderColor: C.ochre,
    borderRadius: R.card,
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
    fontFamily: Fonts.label,
    fontSize: FS.md,
  },
  hint: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  hintText: {
    color: '#fff',
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  // Permission screen (dark context — camera is landscape)
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
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.textPrimaryDark,
    textAlign: 'center',
  },
  permissionBody: {
    fontFamily: Fonts.body,
    fontSize: FS.base,
    color: C.textSubDark,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  permissionButtonText: {
    fontFamily: Fonts.display,
    fontSize: FS.md,
    color: C.textOnOchre,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textMutedDark,
  },
  // ── Modals (landscape-optimised) ──
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: C.inkSurface,
    borderRadius: R.sheet,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS.lg,
  },
  exitBody: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.sm,
  },
  exitSheetRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stayBtn: {
    backgroundColor: C.ochre,
    borderRadius: R.btn,
    borderWidth: 2,
    borderColor: C.ink,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  stayBtnText: {
    color: C.textOnOchre,
    fontFamily: Fonts.display,
    fontSize: FS.base,
  },
  leaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  leaveBtnText: {
    color: C.textSubDark,
    fontFamily: Fonts.label,
    fontSize: FS.base,
  },
  // Error — compact centred card
  errorSheet: {
    backgroundColor: C.inkSurface,
    borderRadius: R.sheet,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    gap: 10,
    width: '100%',
    maxWidth: 420,
  },
  errorTitle: {
    color: C.textPrimaryDark,
    fontFamily: Fonts.display,
    fontSize: FS.lg,
  },
  errorBody: {
    color: C.textSubDark,
    fontFamily: Fonts.body,
    fontSize: FS.base,
    lineHeight: 22,
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
});
