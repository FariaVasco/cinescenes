import * as Haptics from 'expo-haptics';

export const impact  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
export const tap     = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
export const select  = () => Haptics.selectionAsync();
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const warning = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
export const error   = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
