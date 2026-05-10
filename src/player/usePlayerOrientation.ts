import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { playbackLogger } from '@/player/playbackLogger';

/**
 * Mobile / tablet: lock landscape while the player is mounted for an immersive OTT layout.
 * TV & web: no-op. Restores unlock on unmount so the rest of the app returns to normal orientation.
 */
export function usePlayerOrientation(active: boolean) {
  const previousRef = useRef<ScreenOrientation.OrientationLock | null>(null);

  useEffect(() => {
    if (!active || Platform.isTV || Platform.OS === 'web') return;

    void (async () => {
      try {
        previousRef.current = await ScreenOrientation.getOrientationLockAsync();
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        playbackLogger.debug('Locked orientation to landscape for playback');
      } catch (e) {
        playbackLogger.warn('Could not lock landscape', e);
      }
    })();

    return () => {
      void (async () => {
        try {
          if (previousRef.current != null) {
            await ScreenOrientation.lockAsync(previousRef.current);
          } else {
            await ScreenOrientation.unlockAsync();
          }
          playbackLogger.debug('Restored orientation lock after player');
        } catch (e) {
          try {
            await ScreenOrientation.unlockAsync();
          } catch {
            playbackLogger.warn('Could not restore orientation', e);
          }
        }
      })();
    };
  }, [active]);
}
