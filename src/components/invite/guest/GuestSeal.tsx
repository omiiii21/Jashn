/**
 * The seal (design-direction §6.1): the couple's initials in Eczar 600 inside two concentric
 * rings. Gold on the maroon ground. A crisp geometric mark, not an illustration.
 */
export function GuestSeal({ initials, size = 72 }: { initials: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      role="img"
      aria-label={initials}
      className="text-invite-foil"
    >
      <circle cx="36" cy="36" r="34.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="1" />
      <text
        x="36"
        y="36"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        className="font-serif"
        style={{ fontSize: 24, fontWeight: 600, letterSpacing: "0.04em" }}
      >
        {initials}
      </text>
    </svg>
  );
}
