import { describe, expect, it } from "vitest";

import { LOCALES } from "@yonetim/i18n";

import { enContent } from "../apps/web/src/content/en";
import { trContent } from "../apps/web/src/content/tr";

/**
 * Uzun biçimli içerik dil paritesi — SPEC Bölüm 10.1.
 *
 * Blog/rehber slug'ları diller arasında **aynıdır**: dil değiştiren ziyaretçi
 * aynı sayfada kalır ve hreflang çiftleri tutarlı olur.
 */
const BUNDLES = { tr: trContent, en: enContent } as const;

describe("pazarlama içeriği", () => {
  it("her desteklenen dil için içerik paketi var", () => {
    expect(Object.keys(BUNDLES).sort()).toEqual([...LOCALES].sort());
  });

  it("blog ve rehber slug'ları diller arasında aynı", () => {
    expect(enContent.posts.map((p) => p.slug)).toEqual(trContent.posts.map((p) => p.slug));
    expect(enContent.guides.map((g) => g.slug)).toEqual(trContent.guides.map((g) => g.slug));
    expect(enContent.killerFeatures.map((f) => f.slug)).toEqual(
      trContent.killerFeatures.map((f) => f.slug),
    );
  });

  for (const [locale, content] of Object.entries(BUNDLES)) {
    describe(locale, () => {
      it("boş metin içermiyor", () => {
        const empty: string[] = [];
        for (const post of content.posts) {
          if (!post.title.trim() || !post.body.trim()) empty.push(`post:${post.slug}`);
        }
        for (const guide of content.guides) {
          if (!guide.title.trim() || guide.sections.length === 0) empty.push(`guide:${guide.slug}`);
          for (const s of guide.sections) {
            if (!s.heading.trim() || !s.body.trim()) empty.push(`guide:${guide.slug}:section`);
          }
        }
        for (const faq of content.faqs) {
          if (!faq.question.trim() || !faq.answer.trim()) empty.push("faq");
        }
        expect(empty).toEqual([]);
      });

      it("beklenen içerik hacmine sahip", () => {
        expect(content.posts.length).toBeGreaterThanOrEqual(5);
        expect(content.guides.length).toBeGreaterThanOrEqual(5);
        expect(content.killerFeatures.length).toBeGreaterThanOrEqual(10);
        expect(content.faqs.length).toBeGreaterThanOrEqual(8);
      });

      it("her yazının SEO alanları dolu", () => {
        for (const post of content.posts) {
          expect(post.description.length, post.slug).toBeGreaterThan(40);
          expect(post.keywords.length, post.slug).toBeGreaterThan(0);
        }
      });
    });
  }
});
