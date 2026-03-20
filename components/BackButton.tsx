import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, FS, R } from '@/constants/theme';

type Props = {
  onPress: () => void;
  label?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  style?: object;
};

export function BackButton({ onPress, label = 'Back', icon = 'chevron-left', style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.65}
    >
      <MaterialCommunityIcons name={icon} size={16} color={C.textSub} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 6,
  },
  label: {
    color: C.textSub,
    fontSize: FS.sm,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
