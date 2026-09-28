import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

let mql: MediaQueryList | undefined;
function mediaQuery() {
  mql ??= window.matchMedia(QUERY);
  return mql;
}

function subscribe(onChange: () => void) {
  const m = mediaQuery();
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => mediaQuery().matches,
    () => false
  );
}
