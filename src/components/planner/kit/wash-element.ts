/**
 * The wash (design-direction 7.2): a changed figure's background turns to wash in 120 ms,
 * holds for 1.6 s and fades over 1.2 s; with reduced motion it shows for 3 s without the
 * fade. The timing lives in the `animate-wash` token in globals.css; this helper only starts
 * it and cleans up. It never moves focus or scroll and shows no toast.
 *
 * Plain DOM code: call it from an effect or an event handler in a client component.
 */
export const WASH_CLASS = "animate-wash";

const pending = new WeakMap<Element, (event: AnimationEvent) => void>();

/** Washes one element once. Calling it again while it runs restarts the wash. */
export function washElement(element: HTMLElement): void {
  const previous = pending.get(element);
  if (previous) element.removeEventListener("animationend", previous);

  element.classList.remove(WASH_CLASS);
  // Reading layout restarts the animation when the class was already on.
  void element.offsetWidth;
  element.classList.add(WASH_CLASS);

  const onEnd = (event: AnimationEvent) => {
    if (event.target !== element) return;
    element.classList.remove(WASH_CLASS);
    element.removeEventListener("animationend", onEnd);
    pending.delete(element);
  };
  pending.set(element, onEnd);
  element.addEventListener("animationend", onEnd);
}

/** Washes every element under `root` whose `data-field` is one of `keys`. Returns how many. */
export function washFields(root: ParentNode, keys: readonly string[]): number {
  let count = 0;
  for (const key of keys) {
    const selector = `[data-field="${CSS.escape(key)}"]`;
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      washElement(element);
      count += 1;
    });
  }
  return count;
}
