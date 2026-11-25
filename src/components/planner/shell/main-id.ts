/**
 * The id of the shell's `<main>`, which the skip link also targets. It lives outside the
 * client module FocusMain, because a server component importing a plain value from a
 * "use client" file gets a client reference instead of the string.
 */
export const MAIN_ID = "main";
