"use client";

import { ToggleSwitch } from "@/features/settings/ToggleSwitch";
import { setInterfaceSetting, useInterfaceSettings } from "@/lib/settings";

/** Réglages d'affichage : raccourcis de récompenses du bandeau, cadre des cartes. */
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
      <ToggleSwitch
        label="Nouveau cadre de carte (test)"
        description="Illustration plein cadre, légendaires qui scintillent, reflet irisé des Abyssales. Le plateau ne change pas."
        checked={settings.nouveauCadre}
        onChange={(value) => setInterfaceSetting("nouveauCadre", value)}
      />
    </div>
  );
}
