"use client";

import { ImageIcon } from "@phosphor-icons/react";

import type { AssetId } from "@/contracts/domain";

import type { StudioPhoto } from "./studio-types";

export type PhotoPickerProps = {
  /** Every couple photo of the wedding, oldest first, with member-signed thumbnails. */
  photos: StudioPhoto[];
  /** The draft's photo, or null for none. */
  selected: AssetId | null;
  on_select: (asset_id: AssetId) => void;
  /** A thumbnail failed to load, usually an expired signed URL. */
  on_image_error: () => void;
  /** Sample weddings' photos are AI-generated and fictional, and say so. */
  is_sample: boolean;
};

/**
 * The wedding's own couple photos as one radio group: one tap sets the draft's photo, no
 * upload (design-direction 10.7). The choice reaches guests only after a publish.
 */
export function PhotoPicker({ photos, selected, on_select, on_image_error, is_sample }: PhotoPickerProps) {
  if (photos.length < 2 && photos.every((photo) => photo.asset_id === selected)) return null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-body font-medium text-ink">Choose a photo</legend>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => {
          const id = `studio-photo-${photo.asset_id}`;
          return (
            <label
              key={photo.asset_id}
              htmlFor={id}
              className="relative block cursor-pointer overflow-hidden rounded-control border border-line-strong bg-ivory has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-maroon has-[:focus-visible]:ring-offset-2"
            >
              <input
                id={id}
                type="radio"
                name="studio-photo"
                value={photo.asset_id}
                checked={selected === photo.asset_id}
                onChange={() => on_select(photo.asset_id)}
                className="sr-only"
              />
              <span className="sr-only">{`Photo ${index + 1} of ${photos.length}`}</span>
              <span className="flex aspect-[4/5] w-full items-center justify-center">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" onError={on_image_error} />
                ) : (
                  <ImageIcon aria-hidden="true" className="size-5 text-ink-3" />
                )}
              </span>
            </label>
          );
        })}
      </div>
      {is_sample ? <p className="text-meta text-ink-3">AI-generated, fictional.</p> : null}
    </fieldset>
  );
}
