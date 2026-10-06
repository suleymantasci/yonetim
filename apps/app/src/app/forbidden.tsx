import { ForbiddenView } from "@/components/forbidden-view";

/** Kök düzey (panel kabuğu dışı: /yonetim, /sakin). Panel içi: `panel/forbidden.tsx`. */
export default function Forbidden() {
  return (
    <main className="mx-auto max-w-xl px-4">
      <ForbiddenView />
    </main>
  );
}
