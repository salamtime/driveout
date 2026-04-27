import { useEffect } from 'react';

const dispatchAdminModalEvent = (eventName, modalName) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, {
    detail: modalName ? { modal: modalName } : undefined,
  }));
};

export const openAdminModalFocus = (modalName) => {
  dispatchAdminModalEvent('admin:modal-open', modalName);
};

export const closeAdminModalFocus = (modalName) => {
  dispatchAdminModalEvent('admin:modal-close', modalName);
};

export default function useAdminModalFocus(isActive, modalName = 'modal') {
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    openAdminModalFocus(modalName);

    return () => {
      closeAdminModalFocus(modalName);
    };
  }, [isActive, modalName]);
}
