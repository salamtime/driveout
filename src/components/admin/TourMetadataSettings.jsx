import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, MapPin, Info, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import toast from 'react-hot-toast';
import { 
  fetchTourMetadata, 
  createTourMetadata, 
  updateTourMetadata, 
  deleteTourMetadata 
} from '../../services/tourMetadataService';
import TourMetadataModal from './TourMetadataModal';
import { DialogOverlay, DialogContent } from "../ui/dialog";

const TourMetadataSettings = () => {
  const [metadata, setMetadata] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 10;

  // Load tour metadata on component mount and when page changes
  useEffect(() => {
    loadTourMetadata();
  }, [currentPage]);

  const loadTourMetadata = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error, count } = await fetchTourMetadata(currentPage, PAGE_SIZE);
      
      if (error) throw new Error(error);
      
      setMetadata(data || []);
      setTotalItems(count || 0);
    } catch (err) {
      console.error('Failed to load tour metadata:', err);
      setError('Failed to load tour metadata. Please try again.');
      toast.error('Failed to load tour metadata');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMetadata = async (formData) => {
    try {
      let result;
      
      if (editingId) {
        result = await updateTourMetadata(editingId, formData);
      } else {
        result = await createTourMetadata(formData);
      }

      if (result.error) throw new Error(result.error);

      toast.success(`Tour metadata ${editingId ? 'updated' : 'created'} successfully`);
      resetForm();
      loadTourMetadata();
    } catch (err) {
      console.error('Failed to save tour metadata:', err);
      toast.error(`Failed to ${editingId ? 'update' : 'create'} tour metadata`);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    
    try {
      const { error } = await deleteTourMetadata(deleteItem.id);
      if (error) throw new Error(error);

      toast.success('Tour metadata deleted successfully');
      setShowDeleteDialog(false);
      setDeleteItem(null);
      loadTourMetadata();
    } catch (err) {
      console.error('Failed to delete tour metadata:', err);
      toast.error('Failed to delete tour metadata');
    }
  };

  const openDeleteDialog = (item) => {
    setDeleteItem(item);
    setShowDeleteDialog(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setIsCreating(false);
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Tour Metadata
        </CardTitle>
        <CardDescription>
          Manage tour metadata including names and locations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4 mr-2" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {/* Add New Button */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium">Manage Tour Metadata</h3>
          <Button 
            onClick={() => setIsCreating(true)}
            disabled={isCreating || editingId !== null}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Tour Metadata
          </Button>
        </div>

        {/* Create/Edit Form */}
        {(isCreating || editingId !== null) && (
          <TourMetadataModal 
            initialData={editingId ? metadata.find(m => m.id === editingId) : null}
            onSave={handleSaveMetadata}
            onCancel={resetForm}
            isEditing={editingId !== null}
          />
        )}

        {/* Tour Metadata List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Loading tour metadata...</div>
          ) : metadata.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Info className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No tour metadata found. Create your first tour metadata to get started.</p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-12 font-medium text-sm bg-gray-50 p-3 rounded-t-lg border-b">
                <div className="col-span-5">Tour Name</div>
                <div className="col-span-5">Tour Location</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              
              {/* Table Body */}
              <div className="border rounded-b-lg divide-y">
                {metadata.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 p-3 hover:bg-gray-50">
                    <div className="col-span-5 flex items-center">{item.name}</div>
                    <div className="col-span-5 flex items-center text-gray-600">
                      <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                      {item.location}
                    </div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        disabled={editingId !== null || isCreating}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(item)}
                        disabled={editingId !== null || isCreating}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4 pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} entries
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && deleteItem && (
        <>
          <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
          <DialogContent className="fixed z-50 bg-white rounded-lg shadow-lg top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-6 w-[90%] max-w-md">
            <h3 className="font-bold text-lg mb-2">Confirm Deletion</h3>
            <p className="mb-4">
              Are you sure you want to delete the tour metadata "{deleteItem.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </div>
          </DialogContent>
        </>
      )}
    </Card>
  );
};

export default TourMetadataSettings;