export const DEFAULT_MESSAGE_EXPERIENCE = Object.freeze({
  allowInternalNotes: false,
  allowThreadStateControls: false,
});

export const PRIVILEGED_MESSAGE_EXPERIENCE = Object.freeze({
  allowInternalNotes: true,
  allowThreadStateControls: true,
});

export const getMessageExperience = ({ canUsePrivilegedFeatures = false } = {}) =>
  canUsePrivilegedFeatures
    ? PRIVILEGED_MESSAGE_EXPERIENCE
    : DEFAULT_MESSAGE_EXPERIENCE;
