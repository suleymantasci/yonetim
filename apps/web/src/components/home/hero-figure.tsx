import Image from "next/image";

export interface HeroFigureLabels {
  /** Görselin alternatif metni. */
  alt: string;
  overlay?: string;
  collectionRate: string;
  trend: string;
  chatPrompt: string;
  chatReply: string;
}

export function HeroFigure({ labels }: { labels: HeroFigureLabels }) {
  return (
    <div className="hero-figure"><Image src="/images/courtyard.webp" alt={labels.alt} width={1536} height={1024} priority sizes="(min-width: 1024px) 50vw, 100vw" className="hero-photo w-full object-cover" /><p className="hero-photo-message">{labels.overlay}</p></div>
  );
}
