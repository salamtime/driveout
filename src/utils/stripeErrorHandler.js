// Completely disabled Stripe error handler - all methods are silent

export class StripeErrorHandler {
  static ERROR_TYPES = {};
  static TROUBLESHOOTING_STEPS = {};

  static analyzeError() {
    return {};
  }

  static getTroubleshootingSteps() {
    return [];
  }

  static async testStripeConnectivity() {
    return { connected: true, error: null };
  }

  static handleInitializationError() {
    return {};
  }

  static logError() {
    // Silent - no logging
  }

  static getErrorMessage() {
    return {
      title: '',
      message: '',
      steps: [],
      severity: 'low',
      showAlternatives: false
    };
  }
}

export default StripeErrorHandler;