import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, FS, R, Fonts } from '@/constants/theme';
import { ArrowLeftIcon } from '@/components/CinemaIcons';

type Props = {
  onPress: () => void;
  label?: string;
  style?: object;
  dark?: boolean; // use on dark (trailer/scanner) screens
};

export function BackButton({ onPress, label = 'Back', style, dark = false }: Props) {
  const textColor = dark ? C.textPrimaryDark : C.textSub;
  const borderColor = dark ? 'rgba(250,250,247,0.3)' : C.ink;

  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor }, style]}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.65}
    >
      <ArrowLeftIcon size={18} color={textColor} />
      {label ? <Text style={[styles.label, { color: textColor }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.full,
    borderWidth: 2,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 6,
  },
  label: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    letterSpacing: 0.3,
  },
});
