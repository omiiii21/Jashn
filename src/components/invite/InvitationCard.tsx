import type { CSSProperties } from "react";
import { CARD_HEIGHT_PX, CARD_WIDTH_PX, type CardModel } from "./card-model";

/**
 * The exported invitation card at its print size, 1080 × 1350 CSS px (export-and-recovery
 * 1.2 to 1.5). A plain component with no hooks, so the render page (server) and the
 * studio preview (scaled) share it.
 *
 * Hooks for the worker's readiness guard and fit rule (1.3, 1.5):
 * - `data-card-root` carries `data-fit` ("full" or "compact") and the CSS variables
 *   `--card-photo-max-h` and `--card-gap`, which the fit rule lowers in order;
 * - `data-card-body` is the box the content must fit in, `data-card-content` the content;
 * - every element marked `data-font-check` must load its own web face for its own text;
 * - `data-card-photo` is the mounted photo, which must decode with a non-zero size.
 */

/** Space between blocks, scaled by `--card-gap` (1 at full size, down to 0.5). */
function gap(px: number): CSSProperties {
  return { marginTop: `calc(var(--card-gap) * ${px}px)` };
}

export type InvitationCardProps = {
  model: CardModel;
  /** Positioning from the caller: the render page pins it to the viewport. */
  className?: string;
  /** The probe's shaping-check line (3.6), printed last. */
  check_line?: { label: string; text_hi: string } | null;
};

export function InvitationCard({ model, className, check_line = null }: InvitationCardProps) {
  const hindiFace = model.typeface === "tiro_devanagari" ? "font-classic" : "font-serif";
  const rootStyle = {
    "--card-photo-max-h": "380px",
    "--card-gap": "1",
    width: CARD_WIDTH_PX,
    height: CARD_HEIGHT_PX,
  } as CSSProperties;

  return (
    <div
      data-card-root=""
      data-fit="full"
      data-invite-theme={model.theme === "peacock_gold" ? "peacock" : undefined}
      className={`group overflow-hidden bg-invite-ground ${className ?? "relative"}`}
      style={rootStyle}
    >
      <div className="absolute inset-[40px] rounded-[2px] bg-invite-stock">
        <div aria-hidden="true" className="pointer-events-none absolute inset-[12px] border border-invite-foil" />
        <div
          data-card-body=""
          className="absolute inset-x-[64px] inset-y-[52px] flex flex-col items-center justify-center overflow-hidden"
        >
          <div data-card-content="" className="flex w-full flex-col items-center text-center">
            {model.blessing_line ? (
              <p className="font-serif text-[22px] leading-[1.4] text-invite-blessing" style={{ marginBottom: "calc(var(--card-gap) * 16px)" }}>
                {model.blessing_line}
              </p>
            ) : null}

            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-invite-foil">
              <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full border border-invite-foil">
                <span data-font-check="" className="font-serif text-[30px] font-semibold leading-none text-invite-name">
                  {model.initials}
                </span>
              </div>
            </div>

            <h1
              lang="hi"
              data-font-check=""
              className={`${hindiFace} text-[54px] font-medium leading-[1.3] text-invite-name`}
              style={gap(22)}
            >
              {model.heading_hi}
            </h1>

            {model.lead_in ? (
              <p className="font-serif text-[28px] leading-[1.4] text-invite-blessing" style={gap(18)}>
                {model.lead_in}
              </p>
            ) : null}

            <p
              data-font-check=""
              className="font-serif text-[84px] font-semibold leading-[1.1] tracking-[-0.01em] text-invite-name"
              style={gap(model.lead_in ? 6 : 18)}
            >
              {model.names}
            </p>

            {model.follow_line ? (
              <p className="font-serif text-[28px] leading-[1.4] text-invite-blessing" style={gap(6)}>
                {model.follow_line}
              </p>
            ) : null}

            {model.photo ? (
              <figure className="border border-invite-blessing bg-invite-stock p-[10px]" style={gap(30)}>
                {/* The photo is used as uploaded: never cropped or resized by an image service (1.3). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-card-photo=""
                  src={model.photo.url}
                  alt={model.photo.alt}
                  className="block h-auto max-h-[var(--card-photo-max-h)] w-auto max-w-[560px]"
                />
              </figure>
            ) : null}

            {model.functions.length > 0 ? (
              <div className="flex w-full flex-col items-center" style={gap(30)}>
                {model.functions.map((fn, index) => (
                  <div key={fn.event_id} className="flex flex-col items-center" style={index === 0 ? undefined : gap(20)}>
                    <p className="font-serif text-[40px] font-medium leading-[1.2] text-invite-name group-data-[fit=compact]:hidden">
                      {fn.title}
                      {fn.title_hi ? (
                        <span
                          lang="hi"
                          data-font-check=""
                          className={`${hindiFace} ml-[14px] text-[26px] font-normal leading-[1.3] text-invite-blessing`}
                        >
                          {fn.title_hi}
                        </span>
                      ) : null}
                    </p>
                    <div className="font-sans text-[25px] leading-[1.4] text-invite-ink group-data-[fit=compact]:hidden">
                      <p>{fn.date_line}</p>
                      {fn.time_line ? <p>{fn.time_line}</p> : null}
                      {fn.muhurat_line ? <p>{fn.muhurat_line}</p> : null}
                      {fn.venue_line ? <p>{fn.venue_line}</p> : null}
                    </div>
                    <p className="hidden font-sans text-[25px] leading-[1.4] text-invite-ink group-data-[fit=compact]:block">
                      {[fn.title, fn.date_line, fn.time_line, fn.venue_line?.split(",")[0]].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ))}
                {model.more_functions_line ? (
                  <p className="font-sans text-[22px] leading-[1.4] text-invite-ink" style={gap(16)}>
                    {model.more_functions_line}
                  </p>
                ) : null}
              </div>
            ) : model.fallback_date_line ? (
              <p className="font-sans text-[25px] leading-[1.4] text-invite-ink" style={gap(30)}>
                {model.fallback_date_line}
              </p>
            ) : null}

            {model.wording_hi ? (
              <p
                lang="hi"
                data-font-check=""
                className={`${hindiFace} text-[28px] leading-[1.5] text-invite-blessing`}
                style={gap(26)}
              >
                {model.wording_hi}
              </p>
            ) : null}

            <p className="font-sans text-[22px] leading-[1.4] text-invite-ink" style={gap(14)}>
              {model.reply_line}
            </p>

            {model.footer ? (
              <p className="font-sans text-[18px] leading-[1.4] text-invite-ink" style={gap(18)}>
                {model.footer}
              </p>
            ) : null}

            {check_line ? (
              <p className="font-sans text-[22px] leading-[1.5] text-invite-ink" style={gap(12)}>
                {check_line.label}{" "}
                <span lang="hi" data-font-check="">
                  {check_line.text_hi}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
