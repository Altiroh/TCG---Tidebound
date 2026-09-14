"use client";

import { ToggleSwitch } from "@/features/settings/ToggleSwitch";
import { VolumeSlider } from "@/features/settings/VolumeSlider";
import { setAudioSetting, useAudioSettings } from "@/lib/settings";

/**
 * Réglages audio — interrupteur + volume pour la musique et pour les
 * effets. Partagés tels quels par les Options du menu principal
 * (`SettingsDialog`) et le menu de pause en partie (`MatchPauseMenu`) :
 * c'est le même réglage, il doit se présenter et se comporter pareil des
 * deux côtés.
 */
export function AudioSettingsSection() {
  const audio = useAudioSettings();

  return (
    <div className="flex flex-col">
      <ToggleSwitch
        label="Musique"
        description="Ambiance sonore du jeu."
        checked={audio.music}
        onChange={(value) => setAudioSetting("music", value)}
      />
      <VolumeSlider
        label="Volume de la musique"
        value={audio.musicVolume}
        muted={!audio.music}
        onChange={(value) => setAudioSetting("musicVolume", value)}
      />

      <ToggleSwitch
        label="Effets sonores"
        description="Clics, pioche, combats, ouverture de boosters."
        checked={audio.effects}
        onChange={(value) => setAudioSetting("effects", value)}
      />
      <VolumeSlider
        label="Volume des effets"
        value={audio.effectsVolume}
        muted={!audio.effects}
        onChange={(value) => setAudioSetting("effectsVolume", value)}
      />
    </div>
  );
}
