import { supabase } from '../lib/supabase';

/**
 * Video Capture Service - Handles video recording and upload functionality
 * 
 * FIXED: Updated to use correct buckets and media table structure
 */
class VideoCaptureService {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.stream = null;
    this.isRecording = false;
  }

  /**
   * Initialize camera stream
   */
  async initializeCamera(constraints = {}) {
    try {
      const defaultConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        },
        audio: true
      };

      const finalConstraints = { ...defaultConstraints, ...constraints };
      
      this.stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      return this.stream;
    } catch (error) {
      console.error('Error initializing camera:', error);
      throw new Error(`Camera initialization failed: ${error.message}`);
    }
  }

  /**
   * Start video recording
   */
  async startRecording(onDataAvailable = null, onStop = null) {
    if (!this.stream) {
      throw new Error('Camera not initialized. Call initializeCamera() first.');
    }

    try {
      this.recordedChunks = [];
      
      const options = {
        mimeType: 'video/webm;codecs=vp9'
      };

      // Fallback to vp8 if vp9 is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          if (onDataAvailable) {
            onDataAvailable(event);
          }
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.isRecording = false;
        if (onStop) {
          onStop(blob);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      
      return this.mediaRecorder;
    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error(`Recording start failed: ${error.message}`);
    }
  }

  /**
   * Stop video recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      return true;
    }
    return false;
  }

  /**
   * Stop camera stream
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isRecording = false;
  }

  /**
   * FIXED: Upload video to correct bucket and store in media table
   */
  async uploadVideo(videoBlob, rentalId, videoType = 'opening', metadata = {}) {
    try {
      if (!videoBlob || !rentalId) {
        throw new Error('Video blob and rental ID are required');
      }

      const timestamp = Date.now();
      const filename = `${rentalId}/${timestamp}_${videoType}_${metadata.suffix || 'video'}.webm`;
      
      // FIXED: Use correct bucket based on video type
      const bucketName = videoType === 'opening' ? 'rental-media-opening' : 'rental-media-closing';

      console.log(`Uploading video to: ${bucketName}/${filename}`);

      // FIXED: Upload to correct bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filename, videoBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'video/webm'
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);

      // FIXED: Store in media table instead of rental table
      const mediaRecord = {
        rental_id: rentalId,
        file_name: filename,
        original_filename: metadata.originalName || `${videoType}_${timestamp}.webm`,
        file_type: 'video/webm',
        file_size: videoBlob.size,
        phase: videoType === 'opening' ? 'out' : 'in', // 'out' = opening, 'in' = closing
        storage_path: uploadData.path,
        public_url: urlData.publicUrl,
        uploaded_at: new Date().toISOString(),
        duration: metadata.duration || null,
        ...metadata.additionalFields
      };

      const { data: mediaData, error: mediaError } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .insert(mediaRecord)
        .select()
        .single();

      if (mediaError) {
        throw new Error(`Failed to save media record: ${mediaError.message}`);
      }

      return {
        success: true,
        uploadData,
        publicUrl: urlData.publicUrl,
        mediaRecord: mediaData,
        filename,
        bucketName
      };

    } catch (error) {
      console.error('Error uploading video:', error);
      throw error;
    }
  }

  /**
   * Get recorded video blob
   */
  getRecordedBlob() {
    if (this.recordedChunks.length === 0) {
      return null;
    }
    return new Blob(this.recordedChunks, { type: 'video/webm' });
  }

  /**
   * Check if currently recording
   */
  getIsRecording() {
    return this.isRecording;
  }

  /**
   * Get current stream
   */
  getStream() {
    return this.stream;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopRecording();
    this.stopCamera();
    this.recordedChunks = [];
  }

  /**
   * FIXED: Get videos for a rental from media table
   */
  async getRentalVideos(rentalId) {
    try {
      const { data: mediaRecords, error } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .select('*')
        .eq('rental_id', rentalId)
        .ilike('file_type', 'video%')
        .order('uploaded_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load videos: ${error.message}`);
      }

      return mediaRecords || [];
    } catch (error) {
      console.error('Error loading rental videos:', error);
      throw error;
    }
  }

  /**
   * FIXED: Generate signed URLs for video playback
   */
  async generateSignedUrl(mediaRecord, expiresIn = 3600) {
    try {
      const bucket = mediaRecord.phase === 'out' ? 'rental-media-opening' : 'rental-media-closing';
      
      const { data: signedUrl, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(mediaRecord.storage_path, expiresIn);

      if (error) {
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }

      return signedUrl.signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Delete video from storage and database
   */
  async deleteVideo(mediaRecord) {
    try {
      const bucket = mediaRecord.phase === 'out' ? 'rental-media-opening' : 'rental-media-closing';
      
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([mediaRecord.storage_path]);

      if (storageError) {
        console.warn('Warning: Could not delete file from storage:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .delete()
        .eq('id', mediaRecord.id);

      if (dbError) {
        throw new Error(`Failed to delete media record: ${dbError.message}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting video:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const videoCaptureService = new VideoCaptureService();
export default VideoCaptureService;