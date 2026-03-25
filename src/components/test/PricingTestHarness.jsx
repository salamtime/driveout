import React, { useState, useEffect } from 'react';
import { usePricing } from '../../contexts/PricingContext';
import { calculateBookingPrice, isWeekend, isHoliday } from '../../utils/pricingUtils';
import TourPricingCalculator from '../tours/TourPricingCalculator';

/**
 * Test harness for pricing functionality
 * This component is used for testing the pricing calculation functionality
 * It provides controls to test different pricing scenarios
 */
const PricingTestHarness = () => {
  const { settings, loading, error, pricingEnabled, togglePricingEnabled } = usePricing();
  
  // Test input state
  const [duration, setDuration] = useState(1);
  const [participants, setParticipants] = useState(1);
  const [isVip, setIsVip] = useState(false);
  const [numQuads, setNumQuads] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [priceDetails, setPriceDetails] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // Error testing
  const [forceError, setForceError] = useState(false);
  const [testResults, setTestResults] = useState([]);
  
  const addTestResult = (name, result, expected, details) => {
    const passed = result === expected;
    const newResult = {
      id: Date.now(),
      name,
      passed,
      result,
      expected,
      details,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setTestResults(prev => [newResult, ...prev]);
  };
  
  const handlePriceChange = (details) => {
    setPriceDetails(details);
  };
  
  const runBasePriceTests = () => {
    // Test standard 1 hour rate
    const test1 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "Standard 1h Base Price", 
      test1.basePrice, 
      settings.defaultRate1h,
      `Expected ${settings.defaultRate1h}, got ${test1.basePrice}`
    );
    
    // Test standard 2 hour rate
    const test2 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 2,
      passengers: 1,
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "Standard 2h Base Price", 
      test2.basePrice, 
      settings.defaultRate2h,
      `Expected ${settings.defaultRate2h}, got ${test2.basePrice}`
    );
    
    // Test VIP 1 hour rate
    const test3 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: true,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "VIP 1h Base Price", 
      test3.basePrice, 
      settings.vipRate1h,
      `Expected ${settings.vipRate1h}, got ${test3.basePrice}`
    );
    
    // Test VIP 2 hour rate
    const test4 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 2,
      passengers: 1,
      isVip: true,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "VIP 2h Base Price", 
      test4.basePrice, 
      settings.vipRate2h,
      `Expected ${settings.vipRate2h}, got ${test4.basePrice}`
    );
  };
  
  const runPassengerFeeTests = () => {
    // Test with 1 passenger (no extra fee)
    const test1 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "No Extra Passenger Fee", 
      test1.passengerFees, 
      0,
      `Expected 0, got ${test1.passengerFees}`
    );
    
    // Test with 2 passengers (1 extra)
    const test2 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 2,
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    addTestResult(
      "One Extra Passenger Fee", 
      test2.passengerFees, 
      settings.extraPassengerFee,
      `Expected ${settings.extraPassengerFee}, got ${test2.passengerFees}`
    );
  };
  
  const runSurchargeTests = () => {
    // Create a weekend date for testing
    const weekendDate = new Date();
    weekendDate.setDate(weekendDate.getDate() + (6 - weekendDate.getDay()) % 7); // Next Saturday
    const isWeekendTest = isWeekend(weekendDate);
    
    addTestResult(
      "Weekend Detection", 
      isWeekendTest, 
      true,
      `Expected true (weekend), got ${isWeekendTest}`
    );
    
    // Test weekend surcharge
    const test1 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: false,
      isWeekend: true,
      isHoliday: false
    }, settings);
    
    const expectedWeekendSurcharge = settings.defaultRate1h * 0.1; // 10% surcharge
    
    addTestResult(
      "Weekend Surcharge", 
      test1.weekendSurcharge, 
      expectedWeekendSurcharge,
      `Expected ${expectedWeekendSurcharge}, got ${test1.weekendSurcharge}`
    );
    
    // Test holiday surcharge
    const test2 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: false,
      isWeekend: false,
      isHoliday: true
    }, settings);
    
    const expectedHolidaySurcharge = settings.defaultRate1h * 0.2; // 20% surcharge
    
    addTestResult(
      "Holiday Surcharge", 
      test2.holidaySurcharge, 
      expectedHolidaySurcharge,
      `Expected ${expectedHolidaySurcharge}, got ${test2.holidaySurcharge}`
    );
  };
  
  const runTotalPriceTests = () => {
    // Test with 2 quads, 2 passengers each
    const test1 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 2, // 2 passengers per quad (1 extra)
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    const expectedBaseForTwo = settings.defaultRate1h * 2; // Base price × 2 quads
    const expectedPassengerFeesForTwo = settings.extraPassengerFee * 2; // Extra passenger fee × 2 quads
    const expectedTotal = (test1.basePrice + test1.passengerFees) * 2; // Total for 2 quads
    
    addTestResult(
      "Multiple Quads Total Price", 
      expectedTotal, 
      (settings.defaultRate1h + settings.extraPassengerFee) * 2,
      `Expected ${(settings.defaultRate1h + settings.extraPassengerFee) * 2}, got ${expectedTotal}`
    );
    
    // Test deposit calculation
    const test2 = calculateBookingPrice({
      rentalType: 'hourly',
      duration: 1,
      passengers: 1,
      isVip: false,
      isWeekend: false,
      isHoliday: false
    }, settings);
    
    const expectedDeposit = test2.subtotal * (settings.depositPercentage / 100);
    
    addTestResult(
      "Deposit Calculation", 
      test2.deposit, 
      expectedDeposit,
      `Expected ${expectedDeposit}, got ${test2.deposit}`
    );
  };
  
  const runAllTests = () => {
    setTestResults([]);
    runBasePriceTests();
    runPassengerFeeTests();
    runSurchargeTests();
    runTotalPriceTests();
  };
  
  const clearTestResults = () => {
    setTestResults([]);
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-gray-800">Pricing Test Harness</h1>
          <p className="text-gray-600 mt-1">Test the tour pricing calculation functionality</p>
        </div>
        
        {/* Loading State */}
        {loading && (
          <div className="p-6 bg-gray-50">
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
            <div className="text-center text-gray-500 mt-4">Loading pricing settings...</div>
          </div>
        )}
        
        {/* Error State */}
        {(error || forceError) && (
          <div className="p-6 bg-red-50 text-red-700">
            <div className="flex items-center">
              <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium">Error loading pricing settings</span>
            </div>
            <div className="mt-2 text-sm">
              {error ? error.message : "Forced error for testing"}
            </div>
            {forceError && (
              <button 
                onClick={() => setForceError(false)}
                className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md"
              >
                Clear Error
              </button>
            )}
          </div>
        )}
        
        {/* Test Controls */}
        {!loading && !error && !forceError && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Test Parameters</h2>
              <div className="flex items-center">
                <span className="mr-2 text-sm">Pricing Enabled:</span>
                <button
                  onClick={togglePricingEnabled}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    pricingEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      pricingEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (hours)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDuration(1)}
                    className={`flex-1 px-4 py-2 border rounded-md ${
                      duration === 1 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300'
                    }`}
                  >
                    1 Hour
                  </button>
                  <button
                    onClick={() => setDuration(2)}
                    className={`flex-1 px-4 py-2 border rounded-md ${
                      duration === 2 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300'
                    }`}
                  >
                    2 Hours
                  </button>
                </div>
              </div>
              
              {/* Tour Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tour Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsVip(false)}
                    className={`flex-1 px-4 py-2 border rounded-md ${
                      !isVip ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setIsVip(true)}
                    className={`flex-1 px-4 py-2 border rounded-md ${
                      isVip ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-300'
                    }`}
                  >
                    VIP
                  </button>
                </div>
              </div>
              
              {/* Number of Quads */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Quads
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNumQuads(Math.max(1, numQuads - 1))}
                    className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-md"
                  >
                    -
                  </button>
                  <span className="px-4 py-2 border border-gray-300 rounded-md min-w-[60px] text-center">
                    {numQuads}
                  </span>
                  <button
                    onClick={() => setNumQuads(Math.min(10, numQuads + 1))}
                    className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-md"
                  >
                    +
                  </button>
                </div>
              </div>
              
              {/* Participants Per Quad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Participants Per Quad
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setParticipants(Math.max(1, participants - 1))}
                    className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-md"
                  >
                    -
                  </button>
                  <span className="px-4 py-2 border border-gray-300 rounded-md min-w-[60px] text-center">
                    {participants}
                  </span>
                  <button
                    onClick={() => setParticipants(Math.min(2, participants + 1))}
                    className="h-9 w-9 flex items-center justify-center border border-gray-300 rounded-md"
                  >
                    +
                  </button>
                </div>
              </div>
              
              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Booking Date
                </label>
                <input
                  type="date"
                  value={selectedDate.toISOString().split('T')[0]}
                  onChange={e => setSelectedDate(new Date(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-md w-full"
                />
              </div>
              
              {/* Testing Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Scenarios
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForceError(true)}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md text-sm"
                  >
                    Force Error
                  </button>
                </div>
              </div>
            </div>
            
            {/* Price Calculator */}
            <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Price Calculation</h3>
              
              {pricingEnabled ? (
                <TourPricingCalculator
                  duration={duration}
                  participants={participants}
                  isVip={isVip}
                  numQuads={numQuads}
                  selectedDate={selectedDate}
                  onChange={handlePriceChange}
                />
              ) : (
                <div className="text-gray-500 italic">
                  Pricing is currently disabled. Toggle the switch to enable.
                </div>
              )}
            </div>
            
            {/* Testing Functions */}
            <div className="mt-6 p-4 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Automated Tests</h3>
              
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runAllTests}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Run All Tests
                </button>
                <button
                  onClick={runBasePriceTests}
                  className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                >
                  Test Base Price
                </button>
                <button
                  onClick={runPassengerFeeTests}
                  className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                >
                  Test Passenger Fees
                </button>
                <button
                  onClick={runSurchargeTests}
                  className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                >
                  Test Surcharges
                </button>
                <button
                  onClick={runTotalPriceTests}
                  className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                >
                  Test Total Price
                </button>
                <button
                  onClick={clearTestResults}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200"
                >
                  Clear Results
                </button>
              </div>
            </div>
            
            {/* Test Results */}
            {testResults.length > 0 && (
              <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h3 className="text-lg font-semibold text-gray-800">Test Results</h3>
                </div>
                <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
                  {testResults.map(result => (
                    <div key={result.id} className="px-4 py-3">
                      <div className="flex items-center">
                        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${result.passed ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        <span className="font-medium">{result.name}</span>
                        <span className="ml-auto text-xs text-gray-500">{result.timestamp}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">
                        {result.passed ? (
                          <span className="text-green-600">PASS: {result.details}</span>
                        ) : (
                          <span className="text-red-600">FAIL: {result.details}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Raw Settings */}
            <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
              <div 
                className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center cursor-pointer"
                onClick={() => setShowDetails(!showDetails)}
              >
                <h3 className="text-lg font-semibold text-gray-800">Pricing Settings</h3>
                <button className="text-gray-400 hover:text-gray-600">
                  {showDetails ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
              {showDetails && (
                <div className="p-4 bg-gray-50">
                  <pre className="text-xs overflow-auto p-3 bg-gray-100 rounded">
                    {JSON.stringify(settings, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            
            {/* Selected Date Info */}
            <div className="mt-4 text-sm text-gray-600">
              <div>Selected Date: {selectedDate.toLocaleDateString()}</div>
              <div>Is Weekend: {isWeekend(selectedDate) ? 'Yes' : 'No'}</div>
              <div>Is Holiday: {isHoliday(selectedDate) ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingTestHarness;