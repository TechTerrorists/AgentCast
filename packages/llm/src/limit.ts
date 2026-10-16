/** Minimal concurrency limiter: at most `max` tasks run at once, the rest queue in order. */
export function createLimiter(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error(`concurrency must be a positive integer, got ${max}`);
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
