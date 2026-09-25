"use client";

import { useState } from "react";
import type { LoginRewardView } from "@/features/progression/loginService";
import { DailyStreakPopup } from "@/features/progression/DailyStreakPopup";

/** Laboratoire du popup de série (`/game/profil-preview?serie=1`) : ouvert d'office, refermable. */
export function StreakPopupPreview({ login }: { login: LoginRewardView }) {
  const [open, setOpen] = useState(true);
  return open ? <DailyStreakPopup initialLogin={login} onClose={() => setOpen(false)} /> : null;
}
