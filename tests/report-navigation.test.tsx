// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../apps/app/src/components/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} />,
}));

import { ReportNavigator } from "../apps/app/src/app/panel/raporlar/report-navigator";
import { Select } from "@yonetim/ui";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const labels = {
  nav: "Raporlar",
  choose: "Rapor seç",
  close: "Listeyi kapat",
  search: "Rapor ara",
  empty: "Rapor bulunamadı",
  clear: "Aramayı temizle",
};
const groups = [
  {
    key: "financial",
    label: "Mali tablolar",
    items: [
      { key: "balance", href: "/panel/raporlar/bilanco", label: "Bilanço" },
      {
        key: "book",
        href: "/panel/raporlar/isletme-defteri",
        label: "İşletme defteri",
      },
    ],
  },
  {
    key: "cash",
    label: "Kasa ve hareketler",
    items: [
      {
        key: "cashDays",
        href: "/panel/raporlar/kasa-gunluk",
        label: "Günlük bilanço",
      },
    ],
  },
];
const summary = { key: "summary", href: "/panel/raporlar", label: "Özet" };

async function render(active = "cashDays") {
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () =>
    root.render(
      <ReportNavigator
        active={active}
        groups={groups}
        summary={summary}
        labels={labels}
      />,
    ),
  );
}
async function click(button: Element) {
  await act(async () => (button as HTMLElement).click());
}
async function search(value: string) {
  const input = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});

describe("report directory", () => {
  it("starts compact on a report; opens with grouped links and the active report", async () => {
    await render();
    const toggle = document.querySelector("button")!;
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    expect(panel.hidden).toBe(true);
    expect(
      document.querySelector('[aria-current="page"]')?.getAttribute("href"),
    ).toBe("/panel/raporlar/kasa-gunluk");
    await click(toggle);
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelectorAll("section")).toHaveLength(2);
  });

  it("searches Turkish report names without requiring accents", async () => {
    await render("summary");
    await search("isletme");
    expect(document.querySelectorAll("section a")).toHaveLength(1);
    expect(document.querySelector("section a")?.textContent).toBe(
      "İşletme defteri",
    );
    await search("bilanco");
    expect(document.querySelectorAll("section a")).toHaveLength(2);
  });

  it("shows an empty state; clearing restores the directory", async () => {
    await render("summary");
    await search("zzzz");
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      labels.empty,
    );
    await click(document.querySelector(`[aria-label="${labels.clear}"]`)!);
    expect(document.querySelectorAll("section a")).toHaveLength(3);
    expect(document.activeElement).toBe(document.querySelector("input"));
  });

  it("Escape closes the directory, resets search and returns focus", async () => {
    await render("summary");
    await search("bilanco");
    const input = document.querySelector("input")!;
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    const toggle = document.querySelector("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    await click(toggle);
    expect(document.querySelectorAll("section a")).toHaveLength(3);
  });
});

describe("shared select", () => {
  it("preserves form values, required/disabled behavior and caller sizing", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById("root")!);
    await act(async () =>
      root.render(
        <form>
          <Select
            name="account"
            defaultValue="cash"
            required
            className="h-9 w-auto px-2"
          >
            <option value="cash">Kasa</option>
            <option value="bank">Banka</option>
          </Select>
          <Select name="disabled" disabled defaultValue="x">
            <option value="x">X</option>
          </Select>
        </form>,
      ),
    );
    const select = document.querySelector("select")!;
    expect(select.value).toBe("cash");
    expect(select.required).toBe(true);
    expect(select.className).toContain("pr-9");
    expect(select.className).toContain("h-9");
    const data = new FormData(document.querySelector("form")!);
    expect(data.get("account")).toBe("cash");
    expect(data.has("disabled")).toBe(false);
  });
});
