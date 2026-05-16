import React from 'react';
import { Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FocusSurface } from '@/tv/FocusSurface';
import {
  aspectHudLabel,
  cycleAspectMode,
  cycleResizeMode,
  resizeHudLabel,
  type PlayerAspectMode,
  type PlayerResizeMode,
} from '@/player/playerDisplay';

type Props = {
  resizeMode: PlayerResizeMode;
  aspectMode: PlayerAspectMode;
  detectedAspectLabel: string;
  onResizeModeChange: (mode: PlayerResizeMode) => void;
  onAspectModeChange: (mode: PlayerAspectMode) => void;
  buttonSize: number;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
};

/** Left-aligned HUD buttons — tap to cycle resize / aspect (no dropdown). */
export function PlayerDisplayHudControls({
  resizeMode,
  aspectMode,
  detectedAspectLabel,
  onResizeModeChange,
  onAspectModeChange,
  buttonSize,
  hitSlop,
}: Props) {
  const resizeLabel = resizeHudLabel(resizeMode);
  const aspectLabel = aspectHudLabel(aspectMode);

  const btnClass = 'rounded-full items-center justify-center bg-accent active:opacity-90 shadow-lg shadow-black/30';

  return (
    <>
      <FocusSurface
        className={`${btnClass} px-3`}
        style={{ height: buttonSize, minWidth: buttonSize }}
        hitSlop={hitSlop}
        onPress={() => onResizeModeChange(cycleResizeMode(resizeMode))}
        accessibilityLabel={`Resize ${resizeLabel}, tap to change`}
        accessibilityHint="Cycles through fit, fill, stretch, and original"
      >
        <Text className="text-white font-bold text-[12px]">{resizeLabel}</Text>
      </FocusSurface>

      <FocusSurface
        className={`${btnClass} px-3`}
        style={{ height: buttonSize, minWidth: buttonSize }}
        hitSlop={hitSlop}
        onPress={() => onAspectModeChange(cycleAspectMode(aspectMode))}
        accessibilityLabel={`Aspect ratio ${aspectLabel}, source ${detectedAspectLabel}, tap to change`}
        accessibilityHint="Cycles through auto, 16:9, 4:3, and 21:9"
      >
        <Text className="text-white font-bold text-[12px]">{aspectLabel}</Text>
      </FocusSurface>
    </>
  );
}
