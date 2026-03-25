import React, { useState, useEffect, useCallback } from 'react';
import { Plus, MoreVertical, Edit, Trash2, Eye, Search, ChevronLeft, ChevronRight, FileText, UserPlus, Clock } from 'lucide-react';
import CustomerService from '../services/EnhancedUnifiedCustomerService';
import { Link } from 'react-router-dom';

const CustomerManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  const PAGE_LIMIT = 10;

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await CustomerService.getCustomers(page, PAGE_LIMIT, searchTerm);
      if (result.success) {
        setCustomers(result.data);
        setTotalPages(Math.ceil(result.count / PAGE_LIMIT));
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };
  
  const handleFormSubmit = async (customerData) => {
    const result = selectedCustomer
      ? await CustomerService.updateCustomer(selectedCustomer.id, customerData)
      : await CustomerService.createCustomer(customerData);

    if (result.success) {
      fetchCustomers();
      setIsModalOpen(false);
      setSelectedCustomer(null);
    } else {
      alert(`Error: ${result.message}`);
    }
  };
  
  const openCreateModal = () => {
    setSelectedCustomer(null);
    setIsModalOpen(true);
  };

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };
  
  const openDetailsModal = (customer) => {
    setSelectedCustomer(customer);
    setIsDetailsModalOpen(true);
  };

  const openDeleteModal = (customer) => {
    setCustomerToDelete(customer);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    const rentalHistoryResult = await CustomerService.checkCustomerRentalHistory(customerToDelete.full_name);
    if (rentalHistoryResult.hasHistory) {
      alert("Cannot delete customer with rental history. Please reassign or delete rentals first.");
      setIsDeleteModalOpen(false);
      return;
    }

    const result = await CustomerService.deleteCustomer(customerToDelete.id);
    if (result.success) {
      fetchCustomers();
    } else {
      alert(`Error: ${result.message}`);
    }
    setIsDeleteModalOpen(false);
    setCustomerToDelete(null);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Customer Management</h1>
        <div className="flex items-center space-x-2">
          <Link to="/admin/rentals/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition duration-300 flex items-center">
            <UserPlus size={20} className="mr-2" />
            New Rental
          </Link>
          <button onClick={openCreateModal} className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition duration-300 flex items-center">
            <Plus size={20} className="mr-2" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {loading && <p>Loading customers...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      
      {!loading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member Since</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map(customer => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{customer.full_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{customer.email}</div>
                    <div className="text-sm text-gray-500">{customer.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative inline-block text-left">
                      <DropdownMenu>
                        <button onClick={() => openDetailsModal(customer)} className="dropdown-item">
                          <Eye size={16} className="mr-2" /> View Details
                        </button>
                        <button onClick={() => openEditModal(customer)} className="dropdown-item">
                          <Edit size={16} className="mr-2" /> Edit
                        </button>
                        <button onClick={() => openDeleteModal(customer)} className="dropdown-item text-red-600">
                          <Trash2 size={16} className="mr-2" /> Delete
                        </button>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {isModalOpen && (
        <CustomerFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleFormSubmit}
          customer={selectedCustomer}
        />
      )}
      
      {isDetailsModalOpen && (
        <CustomerDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          customer={selectedCustomer}
        />
      )}

      {isDeleteModalOpen && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteCustomer}
          customerName={customerToDelete?.full_name}
        />
      )}

    </div>
  );
};

const DropdownMenu = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-full hover:bg-gray-100">
        <MoreVertical size={20} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

const Pagination = ({ page, totalPages, setPage }) => (
  <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
    <button
      onClick={() => setPage(p => Math.max(1, p - 1))}
      disabled={page === 1}
      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
    >
      <ChevronLeft size={16} className="inline" /> Previous
    </button>
    <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
    <button
      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
      disabled={page === totalPages}
      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
    >
      Next <ChevronRight size={16} className="inline" />
    </button>
  </div>
);

const CustomerFormModal = ({ isOpen, onClose, onSubmit, customer }) => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        full_name: customer.full_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
      });
    } else {
      setFormData({ full_name: '', email: '', phone: '', address: '' });
    }
  }, [customer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6">{customer ? 'Edit Customer' : 'Add New Customer'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} placeholder="Full Name" className="w-full px-4 py-2 border rounded-lg" required />
            <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email Address" className="w-full px-4 py-2 border rounded-lg" required />
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone Number" className="w-full px-4 py-2 border rounded-lg" />
            <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Address" className="w-full px-4 py-2 border rounded-lg" rows="3"></textarea>
          </div>
          <div className="mt-6 flex justify-end space-x-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{customer ? 'Save Changes' : 'Add Customer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CustomerDetailsModal = ({ isOpen, onClose, customer }) => {
  const [rentalHistory, setRentalHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && customer) {
      setLoadingHistory(true);
      CustomerService.getCustomerRentalHistory(customer.full_name)
        .then(result => {
          if (result.success) {
            setRentalHistory(result.data);
          }
        })
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, customer]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">{customer.full_name}</h2>
            <p className="text-gray-600">{customer.email}</p>
            <p className="text-gray-600">{customer.phone}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200">&times;</button>
        </div>
        
        <div className="mt-6 border-t pt-6">
          <h3 className="text-lg font-semibold flex items-center"><Clock size={20} className="mr-2" /> Rental History</h3>
          {loadingHistory ? <p>Loading history...</p> : (
            <div className="mt-4 space-y-4 max-h-60 overflow-y-auto">
              {rentalHistory.length > 0 ? rentalHistory.map(rental => (
                <div key={rental.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between">
                    <p className="font-semibold">{rental.vehicle?.name || 'Unknown Vehicle'}</p>
                    <span className={`px-2 py-1 text-xs rounded-full ${rental.rental_status === 'completed' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                      {rental.rental_status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {new Date(rental.rental_start_date).toLocaleDateString()} - {new Date(rental.rental_end_date).toLocaleDateString()}
                  </p>
                </div>
              )) : <p className="text-gray-500">No rental history found for this customer.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, customerName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Confirm Deletion</h2>
        <p>Are you sure you want to delete the customer "{customerName}"? This action cannot be undone.</p>
        <div className="mt-6 flex justify-end space-x-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg">Delete</button>
        </div>
      </div>
    </div>
  );
};


export default CustomerManagement;