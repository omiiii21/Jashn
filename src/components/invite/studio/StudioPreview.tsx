"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { InvitationCard } from "../InvitationCard";
import { CARD_HEIGHT_PX, CARD_WIDTH_PX, type CardModel } from "../card-model";

export type StudioPreviewProps = {
  model: CardModel;
  /** The accessible name of the picture, such as "Invitation preview, Maroon & Gold". */
  label: string;
};

/**
 * The card at its print size, scaled to the column's width (design-direction 10.7).
 * The outer box keeps the card's 4:5 shape and clips, so the 1080 px card never widens
 * the page (acceptance 6.4). The card is exposed as one picture: its own heading is part
 * of the stationery, not the page's outline.
 */
export function StudioPreview({ model, label }: StudioPreviewProps) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = outer.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // A ResizeObserver reports the first size as soon as it starts observing.
    const observer = new ResizeObserver(() => setScale(element.clientWidth / CARD_WIDTH_PX));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      role="img"
      aria-label={label}
      className="relative w-full overflow-hidden rounded-paper"
      style={{ aspectRatio: `${CARD_WIDTH_PX} / ${CARD_HEIGHT_PX}` }}
    >
      <div
        className={`absolute top-0 left-0 origin-top-left${scale === null ? " invisible" : ""}`}
        // Inline origin: the scale must pin the card's corner whatever the stylesheet holds.
        style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX, transform: `scale(${scale ?? 1})`, transformOrigin: "0 0" }}
      >
        <InvitationCard model={model} />
      </div>
    </div>
  );
}
