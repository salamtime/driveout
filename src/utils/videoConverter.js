/**
 * Video Converter Utility
 * Handles iOS .MOV/HEVC to mp4 conversion and video format normalization
 * Uses FFmpeg.wasm for client-side video transcoding
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;
let isFFmpegLoaded = false;

/**
 * Initialize FFmpeg instance (lazy loading)
 * Only loads when conversion is needed to save resources
 */
const getFFmpeg = async () => {
  if (ffmpegInstance && isFFmpegLoaded) {
    return ffmpegInstance;
  }

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (!isFFmpegLoaded) {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    isFFmpegLoaded = true;
    console.log('✅ FFmpeg loaded successfully');
  }

  return ffmpegInstance;
};

/**
 * Detect if video needs conversion (iOS .MOV, HEVC codec, or non-standard formats)
 * @param {File} file - Video file to check
 * @returns {Promise<boolean>} - True if conversion needed
 */
export const needsConversion = async (file) => {
  // iOS .MOV files always need conversion
  if (file.name.toLowerCase().endsWith('.mov')) {
    console.log('📹 iOS .MOV detected, conversion required');
    return true;
  }

  // Check HEVC codec via video element
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      // If video has videoTracks API, check codec
      if (video.videoTracks && video.videoTracks.length > 0) {
        const track = video.videoTracks[0];
        const isHEVC = track.label?.toLowerCase().includes('hevc') || 
                       track.label?.toLowerCase().includes('h.265');
        
        URL.revokeObjectURL(url);
        console.log(`📹 HEVC detection: ${isHEVC ? 'Yes' : 'No'}`);
        resolve(isHEVC);
      } else {
        // Fallback: assume .MOV or large iOS files need conversion
        const isLikelyiOS = file.type === 'video/quicktime' || 
                           file.name.toLowerCase().endsWith('.mov');
        URL.revokeObjectURL(url);
        resolve(isLikelyiOS);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      // If video fails to load, it might need conversion
      resolve(true);
    };

    video.src = url;
  });
};

/**
 * Convert video to mp4 format with H.264 codec
 * Optimized for mobile playback and web compatibility
 * @param {File} file - Input video file
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<Blob>} - Converted mp4 blob
 */
export const convertToMp4 = async (file, onProgress = () => {}) => {
  try {
    console.log('🔄 Starting video conversion to mp4...');
    onProgress(0);

    const ffmpeg = await getFFmpeg();
    
    // Set up progress monitoring
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      console.log(`🔄 Conversion progress: ${percent}%`);
      onProgress(percent);
    });

    // Write input file to FFmpeg virtual filesystem
    const inputName = 'input' + (file.name.match(/\.[^.]+$/) || ['.mov'])[0];
    const outputName = 'output.mp4';
    
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onProgress(10);

    // Convert to mp4 with H.264 codec
    // -c:v libx264: Use H.264 video codec (widely compatible)
    // -preset fast: Balance between speed and compression
    // -crf 23: Quality level (18-28, lower = better quality)
    // -c:a aac: Use AAC audio codec
    // -b:a 128k: Audio bitrate
    // -movflags +faststart: Enable streaming playback
    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName
    ]);

    onProgress(90);

    // Read converted file
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    onProgress(100);
    console.log('✅ Video conversion completed');
    
    return blob;
  } catch (error) {
    console.error('❌ Video conversion failed:', error);
    throw new Error(`Video conversion failed: ${error.message}`);
  }
};

/**
 * Process video file: convert if needed, otherwise return original
 * @param {File} file - Input video file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{blob: Blob, converted: boolean}>}
 */
export const processVideo = async (file, onProgress = () => {}) => {
  const needsConv = await needsConversion(file);
  
  if (needsConv) {
    console.log('🔄 Video requires conversion, starting...');
    const convertedBlob = await convertToMp4(file, onProgress);
    return { blob: convertedBlob, converted: true };
  } else {
    console.log('✅ Video format is compatible, no conversion needed');
    onProgress(100);
    return { blob: file, converted: false };
  }
};