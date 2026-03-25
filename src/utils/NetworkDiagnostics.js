// Network Diagnostics Utility
import { supabase } from './supabaseClient';

class NetworkDiagnostics {
  constructor() {
    this.tests = [];
    this.results = {};
  }

  // Test basic internet connectivity
  async testInternetConnectivity() {
    try {
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      return { success: true, message: 'Internet connectivity: OK' };
    } catch (error) {
      return { success: false, message: 'No internet connectivity', error: error.message };
    }
  }

  // Test Supabase connectivity
  async testSupabaseConnectivity() {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        return { success: false, message: 'Supabase environment is not configured' };
      }
      
      // Use Supabase client instead of manual REST API
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      if (!error) {
        return { success: true, message: 'Supabase connectivity: OK' };
      } else {
        return { success: false, message: `Supabase server error: ${error.message}` };
      }
    } catch (error) {
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
        return { 
          success: false, 
          message: 'Supabase blocked by ad blocker or network filter',
          solution: 'Disable ad blocker or try incognito mode',
          error: error.message 
        };
      }
      return { success: false, message: 'Supabase connectivity failed', error: error.message };
    }
  }

  // Test Stripe connectivity
  async testStripeConnectivity() {
    try {
      // Test basic Stripe API endpoint
      const response = await fetch('https://api.stripe.com/', {
        method: 'HEAD',
        mode: 'no-cors'
      });
      return { success: true, message: 'Stripe connectivity: OK' };
    } catch (error) {
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
        return { 
          success: false, 
          message: 'Stripe blocked by ad blocker or network filter',
          solution: 'Disable ad blocker for payment processing',
          error: error.message 
        };
      }
      return { success: false, message: 'Stripe connectivity failed', error: error.message };
    }
  }

  // Detect ad blocker presence
  async detectAdBlocker() {
    try {
      // Create a fake ad element that ad blockers typically block
      const adTest = document.createElement('div');
      adTest.innerHTML = '&nbsp;';
      adTest.className = 'adsbox';
      adTest.style.position = 'absolute';
      adTest.style.left = '-999px';
      document.body.appendChild(adTest);

      await new Promise(resolve => setTimeout(resolve, 100));

      const isBlocked = adTest.offsetHeight === 0;
      document.body.removeChild(adTest);

      return {
        detected: isBlocked,
        message: isBlocked ? 'Ad blocker detected' : 'No ad blocker detected'
      };
    } catch (error) {
      return { detected: false, message: 'Could not detect ad blocker' };
    }
  }

  // Test table existence in Supabase
  async testSupabaseTables() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !apiKey) {
      return [{
        table: 'environment',
        success: false,
        message: 'Supabase environment is not configured'
      }];
    }
    
    const tablesToTest = [
      'app_b30c02e74da644baad4668e3587d86b1_vehicles',
      'vehicles',
      'saharax_0u4w4d_vehicles'
    ];

    const results = [];

    for (const tableName of tablesToTest) {
      try {
        // Use Supabase client instead of manual REST API
        const { data, error } = await supabase
          .from(tableName)
          .select('id')
          .limit(1);

        if (!error) {
          results.push({
            table: tableName,
            success: true,
            message: `Table '${tableName}' accessible`,
            recordCount: data.length
          });
        } else {
          results.push({
            table: tableName,
            success: false,
            message: `Table '${tableName}' not accessible: ${error.message}`
          });
        }
      } catch (error) {
        results.push({
          table: tableName,
          success: false,
          message: `Table '${tableName}' test failed`,
          error: error.message
        });
      }
    }

    return results;
  }

  // Run all diagnostic tests
  async runFullDiagnostics() {
    console.log('🔍 Running network diagnostics...');
    
    const results = {
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // Test internet connectivity
    results.tests.internet = await this.testInternetConnectivity();
    
    // Detect ad blocker
    results.tests.adBlocker = await this.detectAdBlocker();
    
    // Test Supabase
    results.tests.supabase = await this.testSupabaseConnectivity();
    
    // Test Stripe
    results.tests.stripe = await this.testStripeConnectivity();
    
    // Test Supabase tables
    results.tests.tables = await this.testSupabaseTables();

    // Generate recommendations
    results.recommendations = this.generateRecommendations(results.tests);

    console.log('🔍 Network diagnostics complete:', results);
    return results;
  }

  // Generate user-friendly recommendations
  generateRecommendations(tests) {
    const recommendations = [];

    if (tests.adBlocker?.detected) {
      recommendations.push({
        priority: 'high',
        issue: 'Ad Blocker Detected',
        solution: 'Disable your ad blocker for this website or add it to your allowlist',
        details: 'Ad blockers can block API calls to external services like Supabase and Stripe'
      });
    }

    if (!tests.supabase?.success) {
      recommendations.push({
        priority: 'critical',
        issue: 'Supabase Connection Failed',
        solution: 'Check your internet connection and try disabling browser extensions',
        details: tests.supabase?.solution || 'Database services are not accessible'
      });
    }

    if (!tests.stripe?.success) {
      recommendations.push({
        priority: 'medium',
        issue: 'Stripe Connection Failed',
        solution: 'Payment processing may not work. Try disabling ad blocker.',
        details: tests.stripe?.solution || 'Payment services are not accessible'
      });
    }

    if (!tests.internet?.success) {
      recommendations.push({
        priority: 'critical',
        issue: 'No Internet Connection',
        solution: 'Check your internet connection and try again',
        details: 'Basic internet connectivity is required for the application to work'
      });
    }

    const workingTables = tests.tables?.filter(t => t.success) || [];
    if (workingTables.length === 0) {
      recommendations.push({
        priority: 'high',
        issue: 'No Database Tables Accessible',
        solution: 'Check your database configuration and network connectivity',
        details: 'Vehicle and maintenance data cannot be loaded'
      });
    }

    return recommendations;
  }
}

export default NetworkDiagnostics;
