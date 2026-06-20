/**
 * React 19's `@types/react` no longer ships a global `JSX` namespace (it lives
 * under `React.JSX`). This re-exposes `JSX.Element` globally so the codebase's
 * explicit component return-type annotations keep working without importing
 * `JSX` into every file. Intrinsic-element typing still comes from the
 * automatic `react/jsx-runtime` source, so only `Element` is needed here.
 */
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
