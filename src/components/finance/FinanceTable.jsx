import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download
} from 'lucide-react';

const FinanceTable = ({ 
  title,
  data = [], 
  columns = [], 
  loading = false,
  pageSize = 10,
  searchable = true,
  sortable = true,
  exportable = true,
  onRowClick,
  className = ''
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Filter data based on search term
  const filteredData = data.filter(row => {
    if (!searchTerm) return true;
    return Object.values(row).some(value => 
      value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (key) => {
    if (!sortable) return;
    
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (columnKey) => {
    if (!sortable) return null;
    
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-blue-600" />
      : <ArrowDown className="h-4 w-4 text-blue-600" />;
  };

  const formatCellValue = (value, column) => {
    if (value === null || value === undefined) return 'N/A';
    
    switch (column.type) {
      case 'currency':
        return new Intl.NumberFormat('fr-MA', {
          style: 'currency',
          currency: column.currency || 'MAD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      case 'percentage':
        return `${parseFloat(value).toFixed(1)}%`;
      case 'number':
        return new Intl.NumberFormat('fr-MA').format(value);
      case 'date':
        return new Date(value).toLocaleDateString('fr-MA');
      case 'datetime':
        return new Date(value).toLocaleString('fr-MA');
      default:
        return value.toString();
    }
  };

  const exportToCSV = () => {
    if (!exportable || !data.length) return;
    
    const headers = columns.map(col => col.header).join(',');
    const rows = data.map(row => 
      columns.map(col => {
        const value = row[col.key];
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      }).join(',')
    ).join('\n');
    
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex items-center space-x-2">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 w-64"
                />
              </div>
            )}
            {exportable && data.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paginatedData.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium">No data found</p>
              <p className="text-sm">
                {searchTerm ? 'Try adjusting your search terms' : 'No records available'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={`text-left py-3 px-4 font-medium text-gray-700 ${
                          sortable ? 'cursor-pointer hover:bg-gray-50' : ''
                        }`}
                        onClick={() => handleSort(column.key)}
                      >
                        <div className="flex items-center space-x-2">
                          <span>{column.header}</span>
                          {getSortIcon(column.key)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, index) => (
                    <tr
                      key={index}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        onRowClick ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => onRowClick?.(row)}
                    >
                      {columns.map((column) => (
                        <td key={column.key} className="py-3 px-4 text-sm text-gray-900">
                          {formatCellValue(row[column.key], column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(startIndex + pageSize, sortedData.length)} of {sortedData.length} results
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default FinanceTable;