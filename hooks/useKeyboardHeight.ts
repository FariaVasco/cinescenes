import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// Height of the software keyboard while visible, 0 otherwise.
// Needed because Android edge-to-edge ignores softwareKeyboardLayoutMode
// 'resize' (app.json), so screens must lift covered inputs manually.
// Uses keyboardDidShow (not willShow) on BOTH platforms: shifting the focused
// field's ancestors while iOS is still presenting the keyboard makes iOS
// cancel the presentation — the keyboard glitches and retracts (seen on iPad).
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
