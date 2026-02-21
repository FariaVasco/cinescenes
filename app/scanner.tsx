import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

export default function ScannerScreen() {
  const router = useRouter();
  const { setCurrentMovie } = useAppStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

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
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    // QR codes on cards encode a movie id, either bare UUID or as a URL:
    // cinescenes://movie/<id>  or  https://cinescenes.app/movie/<id>  or just <id>
    const movieId = extractMovieId(data);
    if (!movieId) {
      Alert.alert('Invalid card', 'This QR code is not a valid Cinescenes card.', [
        { text: 'Try again', onPress: () => setScanned(false) },
        { text: 'Go back', onPress: () => router.back() },
      ]);
      return;
    }

    const { data: movie, error } = await supabase
      .from('movies')
      .select('*')
      .eq('id', movieId)
      .single();

    if (error || !movie) {
      Alert.alert('Movie not found', 'Could not find this movie in the database.', [
        { text: 'Try again', onPress: () => setScanned(false) },
        { text: 'Go back', onPress: () => router.back() },
      ]);
      return;
    }

    if (!movie.active || !movie.youtube_id) {
      Alert.alert(
        'Trailer unavailable',
        'This movie trailer is not ready yet. Please use a different card.',
        [
          { text: 'Try again', onPress: () => setScanned(false) },
          { text: 'Go back', onPress: () => router.back() },
        ]
      );
      return;
    }

    setCurrentMovie(movie);
    router.replace('/trailer');
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
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.hint}>
          <Text style={styles.hintText}>Align QR code with the frame</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function extractMovieId(data: string): string | null {
  // Bare UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(data)) return data;

  // URL formats: cinescenes://movie/<id> or https://.../movie/<id>
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
});
