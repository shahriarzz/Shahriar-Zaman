import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Safe wrapper for mobile haptics using Capacitor
const runHaptic = async (action: () => Promise<void>) => {
  try {
    await action();
  } catch (e) {
    // Silently catch errors when running on web browser/non-native environments
  }
};

export const haptics = {
  light: () => runHaptic(() => Haptics.impact({ style: ImpactStyle.Light })),
  medium: () => runHaptic(() => Haptics.impact({ style: ImpactStyle.Medium })),
  selection: () => runHaptic(() => Haptics.selectionStart()),
  selectionChanged: () => runHaptic(() => Haptics.selectionChanged()),
  success: () => runHaptic(() => Haptics.notification({ type: NotificationType.Success })),
  warning: () => runHaptic(() => Haptics.notification({ type: NotificationType.Warning })),
  vibrate: (duration = 200) => runHaptic(() => Haptics.vibrate({ duration }))
};
