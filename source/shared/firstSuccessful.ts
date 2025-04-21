/**
 * Waits for the first promise to resolve with a truthy value.
 * Ignores rejections and resolves to undefined if all fail or resolve to falsey.
 * Useful for racing multiple async checks (e.g., IPFS) and acting on the first success.
 */
export async function firstSuccessful<T>(promises: Promise<T | undefined | null>[]): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let pending = promises.length;
    let resolved = false;
    if (pending === 0) {
      resolve(undefined);
      return;
    }
    promises.forEach((p) => {
      p.then((result) => {
        if (!resolved && result) {
          resolved = true;
          resolve(result);
        } else if (--pending === 0 && !resolved) {
          resolve(undefined);
        }
      }).catch(() => {
        if (--pending === 0 && !resolved) {
          resolve(undefined);
        }
      });
    });
  });
}
