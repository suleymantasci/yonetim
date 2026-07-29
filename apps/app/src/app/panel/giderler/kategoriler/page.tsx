import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import {
  categoryTree as categoryTreeSchema,
  type CategoryTreeNode,
} from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { CategoryManager, type CategoryNode } from "./category-manager";

export const dynamic = "force-dynamic";

const DISTRIBUTIONS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
  "custom",
] as const;

export default async function ExpenseCategoriesPage() {
  // Yetki kapısı: dönen bağlam bu sayfada kullanılmıyor, çağrının kendisi kapı.
  await requirePermission("expense:write");
  const t = await getTranslations("app.expenses");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const { roots: tree } = await apiGet(
    "/v1/panel/expenses/categories",
    categoryTreeSchema,
  );

  const toView = (node: CategoryTreeNode): CategoryNode => ({
    ...node,
    total: fmt.money(node.totalMinor),
    children: node.children.map(toView),
  });

  const distributionOptions = Object.fromEntries(
    DISTRIBUTIONS.map((value) => [value, tEnum(`duesFormula.${value}`)]),
  );

  return (
    <>
      <PageHeader
        title={t("categoriesTitle")}
        description={t("categoriesDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/giderler" },
          { label: t("categoriesTitle") },
        ]}
      />
      <CategoryManager
        tree={tree.map(toView)}
        defaultColor={siteConfig.design.colors.primary}
        labels={{
          newRoot: t("newCategory"),
          newChild: t("newSubcategory"),
          editTitle: t("editCategory"),
          formHint: t("categoryFormHint"),
          name: t("categoryName"),
          parent: t("parentCategory"),
          parentNone: t("parentNone"),
          distribution: t("distribution"),
          distributionHint: t("distributionHint"),
          distributionOptions,
          isShared: t("isShared"),
          isSharedHint: t("isSharedHint"),
          icon: t("icon"),
          iconHint: t("iconHint"),
          color: t("color"),
          vatRate: t("defaultVatRate"),
          vatRateHint: t("defaultVatRateHint"),
          isActive: t("categoryActive"),
          isActiveHint: t("categoryActiveHint"),
          sortOrder: t("sortOrder"),
          empty: t("categoriesEmpty"),
          expenseCount: t("expenseCount"),
          archiveTitle: t("archiveCategoryTitle"),
          archiveDescription: t("archiveCategoryDescription"),
          archiveInUse: t("archiveCategoryInUse"),
          inactive: t("inactive"),
        }}
      />
    </>
  );
}
