/**
 * Fixed Tesseract.js v6.0.1 Worker Pool Implementation
 * Uses correct API patterns for Tesseract.js v6.0.1
 */

import Tesseract from 'tesseract.js';

class TesseractWorkerPool {
  constructor() {
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers = [];
    this.maxWorkers = 1; // Start with single worker for stability
    this.isInitialized = false;
    this.initializationPromise = null;
    this.supportedLanguages = [];
  }

  /**
   * Initialize the worker pool with correct v6.0.1 API
   * @param {Array} languages - Languages to load
   * @returns {Promise<void>}
   */
  async initialize(languages = ['eng']) {
    if (this.initializationPromise) {
      console.log('⏳ Worker pool initialization in progress, waiting...');
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      console.log('✅ Worker pool already initialized');
      return;
    }

    console.log('🔧 Initializing Tesseract v6.0.1 worker pool...');
    
    this.initializationPromise = this._initializeWithV6API(languages);
    
    try {
      await this.initializationPromise;
      this.isInitialized = true;
      console.log('✅ Worker pool initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize worker pool:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Initialize using correct Tesseract.js v6.0.1 API patterns
   * @param {Array} requestedLanguages - Requested languages
   * @returns {Promise<void>}
   */
  async _initializeWithV6API(requestedLanguages) {
    console.log('🔍 Using Tesseract.js v6.0.1 API patterns...');
    
    // Clean up any existing workers
    await this.terminate();

    // Language fallback strategies for v6.0.1
    const languageStrategies = [
      requestedLanguages,
      ['fra', 'eng'], // Fallback to French + English
      ['eng'] // Final fallback to English only
    ];

    let lastError = null;

    for (const languages of languageStrategies) {
      try {
        console.log(`🔄 Trying v6.0.1 worker with languages: ${languages.join(', ')}`);
        
        const workerData = await this._createV6Worker(languages);
        
        if (workerData) {
          console.log(`✅ Successfully created v6.0.1 worker with languages: ${languages.join(', ')}`);
          
          // Store the working configuration
          this.supportedLanguages = [...languages];
          this.workers = [workerData];
          this.availableWorkers = [workerData];
          
          return; // Success, exit the loop
        }
      } catch (error) {
        console.warn(`⚠️ Failed to create v6.0.1 worker with ${languages.join(', ')}:`, error.message);
        lastError = error;
        continue; // Try next language strategy
      }
    }

    // If we get here, all strategies failed
    throw new Error(`Failed to create v6.0.1 worker with any language configuration. Last error: ${lastError?.message}`);
  }

  /**
   * Create worker using correct Tesseract.js v6.0.1 API
   * @param {Array} languages - Language codes
   * @returns {Promise<Object>} - Worker object
   */
  async _createV6Worker(languages) {
    try {
      console.log(`🏗️ Creating Tesseract v6.0.1 worker...`);
      
      // Method 1: Try creating worker with language parameter (v6.0.1 pattern)
      let worker;
      
      if (languages.length === 1) {
        // Single language - direct parameter
        console.log(`📚 Creating worker with single language: ${languages[0]}`);
        worker = await Tesseract.createWorker(languages[0]);
      } else {
        // Multiple languages - join with '+'
        const langString = languages.join('+');
        console.log(`📚 Creating worker with multiple languages: ${langString}`);
        worker = await Tesseract.createWorker(langString);
      }

      console.log('✅ Worker created successfully');
      
      // Debug: Check what methods are available on the worker
      console.log('🔍 Available worker methods:', Object.getOwnPropertyNames(worker));
      console.log('🔍 Worker prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(worker)));

      // Test the worker with a simple operation
      console.log('🧪 Testing worker functionality...');
      const testCanvas = this._createTestCanvas();
      
      console.log('🔍 Running test OCR...');
      const testResult = await worker.recognize(testCanvas);
      console.log('✅ Test OCR completed:', testResult.data.text.trim());

      return {
        worker,
        languages: [...languages],
        isAvailable: true,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: Date.now()
      };

    } catch (error) {
      console.error('❌ Failed to create v6.0.1 worker:', error);
      throw error;
    }
  }

  /**
   * Create a test canvas with text for OCR testing
   * @returns {HTMLCanvasElement} - Test canvas
   */
  _createTestCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Black text
    ctx.fillStyle = 'black';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TEST OCR', canvas.width / 2, canvas.height / 2);
    
    return canvas;
  }

  /**
   * Get an available worker from the pool
   * @returns {Promise<Object>} - Available worker
   */
  async getWorker() {
    if (!this.isInitialized) {
      throw new Error('Worker pool not initialized. Call initialize() first.');
    }

    if (this.availableWorkers.length === 0) {
      throw new Error('No workers available. Pool may be busy or not properly initialized.');
    }

    const workerData = this.availableWorkers.pop();
    this.busyWorkers.push(workerData);
    
    console.log(`🔧 Worker ${workerData.id} acquired. Available: ${this.availableWorkers.length}, Busy: ${this.busyWorkers.length}`);
    return workerData;
  }

  /**
   * Return a worker to the available pool
   * @param {Object} workerData - Worker to return
   */
  releaseWorker(workerData) {
    if (!workerData) return;

    const busyIndex = this.busyWorkers.findIndex(w => w.id === workerData.id);
    if (busyIndex !== -1) {
      this.busyWorkers.splice(busyIndex, 1);
      workerData.isAvailable = true;
      this.availableWorkers.push(workerData);
      console.log(`♻️ Worker ${workerData.id} released. Available: ${this.availableWorkers.length}, Busy: ${this.busyWorkers.length}`);
    }
  }

  /**
   * Safely terminate a worker
   * @param {Object} worker - Worker to terminate
   */
  async _safeTerminateWorker(worker) {
    try {
      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
        console.log('🧹 Worker terminated safely');
      }
    } catch (error) {
      console.warn('⚠️ Error during worker termination:', error);
    }
  }

  /**
   * Terminate all workers and clean up the pool
   */
  async terminate() {
    if (this.workers.length === 0) return;

    console.log('🧹 Terminating worker pool...');
    
    const terminationPromises = this.workers.map(async (workerData) => {
      await this._safeTerminateWorker(workerData.worker);
    });

    await Promise.all(terminationPromises);
    
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers = [];
    this.isInitialized = false;
    this.supportedLanguages = [];
    this.initializationPromise = null;
    
    console.log('✅ Worker pool terminated');
  }

  /**
   * Get pool statistics
   * @returns {Object} - Pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.busyWorkers.length,
      isInitialized: this.isInitialized,
      supportedLanguages: [...this.supportedLanguages],
      maxWorkers: this.maxWorkers
    };
  }

  /**
   * Check if the pool is ready for use
   * @returns {boolean}
   */
  isReady() {
    return this.isInitialized && this.availableWorkers.length > 0;
  }

  /**
   * Get supported languages
   * @returns {Array} - Array of supported language codes
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }
}

// Global worker pool instance
const workerPool = new TesseractWorkerPool();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    workerPool.terminate().catch(console.error);
  });
}

export default workerPool;
export { TesseractWorkerPool };
