"use client";

import { useRef, useState } from "react";
import { CircleNotchIcon, ImageIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { AssetId, WeddingId } from "@/contracts/domain";
import { GHOST_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "./studio-styles";
import {
  addAssetInput,
  checkPhotoFile,
  measureImage,
  PHOTO_ACCEPT,
  PHOTO_ERROR_TEXT,
  putSignedUpload,
  signPhotoUpload,
  uploadFailureText,
} from "./photo-upload";

export const PHOTO_LABEL = "Couple photo, used as uploaded. AI-generated, fictional.";

export type PhotoFieldProps = {
  wedding_id: WeddingId;
  /** The photo the draft shows: a signed URL or this tab's object URL; null when none can show. */
  photo_url: string | null;
  /** True when the shown style has a photo (it may still have no file, D126). */
  has_photo: boolean;
  dispatch: (envelope: CommandEnvelope) => Promise<CommandResponse>;
  /** After the file is stored and `add_asset` succeeded. `preview_url` is a local object URL. */
  on_uploaded: (photo: { asset_id: AssetId; preview_url: string }) => void;
  on_remove: () => void;
  /** The thumbnail failed to load, usually an expired signed URL. */
  on_image_error: () => void;
  /** An error from the last save that belongs to the photo. */
  save_error: string | null;
};

/**
 * The couple photo: pick, check, sign, upload, `add_asset` (architecture 3.6; AT-7.1).
 * The photo is used as uploaded: no crop, filter or resize (D14). The draft only points
 * at the new photo after Save draft sends `photo_asset_id`.
 */
export function PhotoField({
  wedding_id,
  photo_url,
  has_photo,
  dispatch,
  on_uploaded,
  on_remove,
  on_image_error,
  save_error,
}: PhotoFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? save_error;

  async function upload(file: File) {
    setError(null);
    const check = checkPhotoFile(file);
    if (!check.ok) {
      // Refused before any request, so nothing is stored (AT-7.1).
      setError(PHOTO_ERROR_TEXT[check.reason]);
      return;
    }
    setBusy(true);
    try {
      const size = await measureImage(file);
      const sign = await signPhotoUpload({
        wedding_id,
        asset_kind: "couple_photo",
        mime_type: check.mime_type,
        bytes: file.size,
      });
      if (!sign.ok) {
        setError(uploadFailureText(sign.error));
        return;
      }
      const put = await putSignedUpload(sign.signed_upload_url, file, check.mime_type);
      if (!put.ok) {
        setError(PHOTO_ERROR_TEXT.upload);
        return;
      }
      const response = await dispatch({
        wedding_id,
        command: "add_asset",
        input: addAssetInput(sign.asset_id, check.mime_type, file.size, size),
        idempotency_key: `add_asset:${sign.asset_id}`,
        source: "ui",
      });
      if (!response.ok) {
        setError(uploadFailureText(response.error));
        return;
      }
      on_uploaded({ asset_id: sign.asset_id, preview_url: URL.createObjectURL(file) });
    } catch {
      setError(PHOTO_ERROR_TEXT.upload);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={shownError ? "studio-photo-error" : undefined}>
      <legend className="mb-2 text-body font-medium text-ink">Photo</legend>

      <div className="flex items-start gap-3">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-chip border border-line bg-ivory-deep">
          {photo_url ? (
            // Used as uploaded: contained, never cropped (D14). No next/image (architecture 3.6).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo_url} alt="" className="max-h-full max-w-full object-contain" onError={on_image_error} />
          ) : (
            <ImageIcon size={20} aria-hidden="true" className="text-ink-3" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body text-ink">{photo_url ? PHOTO_LABEL : has_photo ? "The photo file isn't uploaded yet." : "No photo. The card prints without one."}</p>
          <p className="text-meta text-ink-3">JPEG, PNG or WebP, up to 10 MB.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={PHOTO_ACCEPT}
          hidden
          data-studio-photo-input=""
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <CircleNotchIcon size={16} aria-hidden="true" className="animate-spin" /> : null}
          {photo_url || has_photo ? "Replace photo" : "Choose a photo"}
        </button>
        {has_photo ? (
          <button
            type="button"
            className={GHOST_BUTTON_CLASS}
            disabled={busy}
            onClick={() => {
              setError(null);
              on_remove();
            }}
          >
            <TrashIcon size={16} aria-hidden="true" />
            Remove photo
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {busy ? "Uploading the photo." : ""}
      </p>
      {shownError ? (
        <p id="studio-photo-error" className="flex items-start gap-2 text-meta text-overdue">
          <WarningCircleIcon size={16} aria-hidden="true" className="mt-1 shrink-0" />
          <span>{shownError}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
