"use client";

import { Home } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { ToggleRow } from "@/components/ui/ToggleRow";

export function ShelterToggle() {
  const on = useUiStore((s) => s.sheltersOn);
  const set = useUiStore((s) => s.setSheltersOn);
  return (
    <ToggleRow
      icon={<Home size={15} />}
      label="Найближчі укриття"
      active={on}
      accent="safe"
      onClick={() => set(!on)}
      title="Показати найближчі укриття (OSM)"
    />
  );
}
