"use client";

import { Globe } from "lucide-react";
import { useUiStore } from "@/stores/uiStore";
import { ToggleRow } from "@/components/ui/ToggleRow";

export function BaseMapToggle() {
  const on = useUiStore((s) => s.baseMap === "political");
  const toggle = useUiStore((s) => s.toggleBaseMap);
  return (
    <ToggleRow
      icon={<Globe size={15} />}
      label="Політична карта"
      active={on}
      accent="accent"
      onClick={toggle}
      title="Політична карта (кордони, міста, дороги) під шаром тривог"
    />
  );
}
