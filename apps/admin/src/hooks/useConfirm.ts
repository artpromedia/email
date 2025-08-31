import { useState, useCallback } from "react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "default" | "destructive" | "warning";
}

export interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions | null;
  resolve?: (value: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    options: null,
  });

  const show = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        options: {
          confirmText: "Confirm",
          cancelText: "Cancel",
          confirmVariant: "default",
          ...options,
        },
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    setState((prevState) => {
      if (prevState.resolve) {
        prevState.resolve(true);
      }
      return { isOpen: false, options: null, resolve: undefined };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState((prevState) => {
      if (prevState.resolve) {
        prevState.resolve(false);
      }
      return { isOpen: false, options: null, resolve: undefined };
    });
  }, []);

  const close = useCallback(() => {
    setState((prevState) => {
      if (prevState.resolve) {
        prevState.resolve(false);
      }
      return { isOpen: false, options: null, resolve: undefined };
    });
  }, []);

  return {
    show,
    isOpen: state.isOpen,
    options: state.options,
    handleConfirm,
    handleCancel,
    close,
  };
}
