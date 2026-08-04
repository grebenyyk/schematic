const SINGLE: Record<string, string> = {
  b: 'B', c: 'C', f: 'F', h: 'H', i: 'I', n: 'N', o: 'O', p: 'P', s: 'S',
};

const DOUBLE: Record<string, string> = {
  cl: 'Cl', br: 'Br', si: 'Si',
};

const TIMEOUT_MS = 800;

/**
 * Turns a stream of letter keys into element symbols: 'n' → N immediately;
 * 'c' then 'l' within the timeout upgrades the just-applied C to Cl
 * (both are emitted — the caller applies them in order, so the atom ends
 * up Cl, and undo steps walk back through C).
 */
export class ElementTyper {
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(
    private readonly apply: (element: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true when the key was consumed. */
  key(letter: string): boolean {
    const k = letter.toLowerCase();
    const t = this.now();

    if (
      this.lastKey !== null &&
      t - this.lastTime <= TIMEOUT_MS &&
      DOUBLE[this.lastKey + k]
    ) {
      const el = DOUBLE[this.lastKey + k];
      this.apply(el);
      this.lastKey = null;
      return true;
    }

    this.lastKey = null;
    const el = SINGLE[k];
    if (!el) return false;
    this.apply(el);
    this.lastKey = k;
    this.lastTime = t;
    return true;
  }
}
