/**
 * A household's invite link as a guest can open it. `create_invitation_links` returns the
 * guest site's path (`/i/<token>`, routes.guestSite); the copy box needs the full address,
 * so a path gets the page's origin in front. A full URL passes through unchanged.
 */
export function absoluteLinkUrl(link: string, origin: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  return `${origin.replace(/\/+$/, "")}/${link.replace(/^\/+/, "")}`;
}
