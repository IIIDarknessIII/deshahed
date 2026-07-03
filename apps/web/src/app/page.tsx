import { AppShell } from "@/components/AppShell";
import { SeoFooter } from "@/components/SeoFooter";

// The footer's "hotspots" pull live aggregates; ISR keeps the home shell cached
// while letting that block refresh (and self-heal after a build with no API).
export const revalidate = 120;

export default function Page() {
  return (
    <>
      <AppShell />
      <SeoFooter />
    </>
  );
}
