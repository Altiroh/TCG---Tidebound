"use client";

import { ToggleSwitch } from "@/features/settings/ToggleSwitch";
import { setInterfaceSetting, useInterfaceSettings } from "@/lib/settings";

/** Réglages d'affichage : raccourcis de récompenses du bandeau. */
export function InterfaceSettingsSection() {
  const settings = useInterfaceSettings();
  return (
    <div className="flex flex-col">
      <ToggleSwitch
        label="Récompenses rapides"
        description="Les losanges sous ton profil."
        checked={settings.rewardShortcuts}
        onChange={(value) => setInterfaceSetting("rewardShortcuts", value)}
      />
    </div>
  );
}
