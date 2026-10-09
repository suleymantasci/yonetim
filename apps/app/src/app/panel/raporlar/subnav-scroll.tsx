"use client";

import { useEffect } from "react";

/** Rapor sekmeleri yatay kayıyor; etkin sekme ilk açılışta görünür olsun. */
export function SubnavScroll({ id }: { id: string }) {
  useEffect(() => {
    const nav = document.getElementById(id);
    const active = nav?.querySelector<HTMLElement>("[aria-current=page]");
    if (nav && active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [id]);
  return null;
}
