"use client";

import { ToggleSwitch } from "@/features/settings/ToggleSwitch";
import { setInterfaceSetting, useInterfaceSettings } from "@/lib/settings";

/** Réglages d'affichage — pour l'instant, les raccourcis de récompenses du bandeau. */
export function InterfaceSettingsSection() {
  const settings = useInterfaceSettings();
  return (
    <div className="flex flex-col">
      <ToggleSwitch
        label="Afficher les informations de récompenses rapides"
        description="Les losanges sous ton profil, en haut à droite, qui mènent droit à ce qui attend d'être réclamé."
        checked={settings.rewardShortcuts}
        onChange={(value) => setInterfaceSetting("rewardShortcuts", value)}
      />
    </div>
  );
}
