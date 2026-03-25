import React, { useState } from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';

/**
 * Test Report component
 * Displays test results in an organized manner
 */
const TestReport = ({ title, tests = [] }) => {
  const [expanded, setExpanded] = useState(true);
  
  // Count test results
  const totalTests = tests.length;
  const passedTests = tests.filter(test => test.status === 'pass').length;
  const failedTests = tests.filter(test => test.status === 'fail').length;
  const warningTests = tests.filter(test => test.status === 'warning').length;
  
  // Format date for test report
  const formatDate = () => {
    const now = new Date();
    return now.toLocaleString();
  };
  
  return (
    <div className="border rounded-lg overflow-hidden shadow-sm my-4">
      {/* Report Header */}
      <div className="bg-gray-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center">
          <h3 className="font-medium text-gray-800">{title}</h3>
          <div className="ml-4 flex items-center space-x-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <Check size={12} className="mr-1" /> {passedTests} pass
            </span>
            {failedTests > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <X size={12} className="mr-1" /> {failedTests} fail
              </span>
            )}
            {warningTests > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <AlertTriangle size={12} className="mr-1" /> {warningTests} warn
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Run at {formatDate()}
        </div>
      </div>
      
      {/* Collapsible Content */}
      <div className={`transition-all duration-300 ${expanded ? 'max-h-[2000px]' : 'max-h-0'} overflow-hidden`}>
        <div className="p-4">
          {/* Test Results Table */}
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tests.map((test, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{test.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    {test.status === 'pass' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Check size={12} className="mr-1" /> Pass
                      </span>
                    )}
                    {test.status === 'fail' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <X size={12} className="mr-1" /> Fail
                      </span>
                    )}
                    {test.status === 'warning' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <AlertTriangle size={12} className="mr-1" /> Warn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">{test.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Expand/Collapse Toggle */}
      <div 
        className="bg-gray-50 px-4 py-2 text-center cursor-pointer hover:bg-gray-100 text-sm text-gray-600"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </div>
    </div>
  );
};

export default TestReport;