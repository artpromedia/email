// React 19 compatibility types for third-party components
import * as React from "react";

declare module "react" {
  // Override ReactNode to match the expected type for third-party components
  type ReactNode =
    | React.ReactElement
    | string
    | number
    | boolean
    | null
    | undefined;
}

// Augment global namespace
declare global {
  namespace React {
    type ReactNode =
      | React.ReactElement
      | string
      | number
      | boolean
      | null
      | undefined;
  }
}

export {};
