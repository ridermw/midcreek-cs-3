// loading -> ready | failed | disposed; late completion only releases resources.
export function createLoad({ fetchAsset, validate, attach, release, timeoutMs }) {
  let state = 'loading';
  let error = null;
  let attached = null;
  const timer = setTimeout(() => {
    if (state === 'loading') {
      state = 'failed';
      error = 'LOAD_TIMEOUT';
    }
  }, timeoutMs);
  const finished = (async () => {
    let candidate = null;
    try {
      candidate = await fetchAsset();
      if (state !== 'loading') {
        release(candidate);
        candidate = null;
        return;
      }
      validate(candidate);
      attach(candidate);
      attached = candidate;
      candidate = null;
      state = 'ready';
    } catch (cause) {
      if (candidate) release(candidate);
      if (state === 'loading') {
        state = 'failed';
        error = String(cause);
      }
    } finally {
      clearTimeout(timer);
    }
  })();
  return {
    get state() { return state; },
    get error() { return error; },
    finished,
    dispose() {
      state = 'disposed';
      clearTimeout(timer);
      if (attached) {
        release(attached);
        attached = null;
      }
    },
  };
}
