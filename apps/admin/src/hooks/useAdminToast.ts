import { toast, ToastOptions } from "react-hot-toast";

export interface AdminToastOptions extends Partial<ToastOptions> {
  autoClose?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  description?: string;
}

export function useAdminToast() {
  const success = (message: string, options?: AdminToastOptions) => {
    return toast.success(message, {
      duration: options?.autoClose === false ? Infinity : 4000,
      position: "top-right",
      ...options,
    });
  };

  const error = (message: string, options?: AdminToastOptions) => {
    return toast.error(message, {
      duration: options?.autoClose === false ? Infinity : 6000,
      position: "top-right",
      ...options,
    });
  };

  const warning = (message: string, options?: AdminToastOptions) => {
    return toast(message, {
      icon: "⚠️",
      duration: options?.autoClose === false ? Infinity : 5000,
      position: "top-right",
      style: {
        background: "#fbbf24",
        color: "#000",
      },
      ...options,
    });
  };

  const info = (message: string, options?: AdminToastOptions) => {
    return toast(message, {
      icon: "ℹ️",
      duration: options?.autoClose === false ? Infinity : 4000,
      position: "top-right",
      style: {
        background: "#3b82f6",
        color: "#ffffff",
      },
      ...options,
    });
  };

  const loading = (message: string) => {
    return toast.loading(message, {
      position: "top-right",
    });
  };

  const dismiss = (toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  };

  return {
    success,
    error,
    warning,
    info,
    loading,
    dismiss,
  };
}
