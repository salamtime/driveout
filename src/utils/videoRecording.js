const PREFERRED_VIDEO_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

export const COMPRESSED_VIDEO_RECORDER_SETTINGS = {
  videoBitsPerSecond: 900000,
  audioBitsPerSecond: 96000,
};

export const getSupportedVideoMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';

  for (const type of PREFERRED_VIDEO_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
};

export const getCompressedVideoRecorderOptions = () => {
  const mimeType = getSupportedVideoMimeType();
  const options = {
    ...COMPRESSED_VIDEO_RECORDER_SETTINGS,
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  return options;
};
