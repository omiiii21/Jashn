"use client";

import { createContext, useContext } from "react";

import type { ChangeSubjects } from "./change-text";

/**
 * What PublishSheet can't get from its fixed props (D97): the revision a publish makes and
 * the function names behind each change's id. The Invite page provides it; a sheet mounted
 * without it says "Publish" and names functions generically.
 */
export type PublishSheetExtras = {
  next_revision: number | null;
  subjects: ChangeSubjects;
};

const PublishSheetContext = createContext<PublishSheetExtras>({ next_revision: null, subjects: {} });

export const PublishSheetProvider = PublishSheetContext.Provider;

export function usePublishSheetExtras(): PublishSheetExtras {
  return useContext(PublishSheetContext);
}
