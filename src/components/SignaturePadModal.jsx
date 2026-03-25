import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const SignaturePadModal = ({ isOpen, onClose, onSave, rentalId }) => {
  const sigPad = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleClear = () => {
    sigPad.current.clear();
  };

  const dataURLtoBlob = (dataurl) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSave = async () => {
    if (sigPad.current.isEmpty()) {
      alert('Please provide a signature first.');
      return;
    }

    setIsSaving(true);
    try {
      const signatureImage = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
      const blob = dataURLtoBlob(signatureImage);
      const fileName = `signatures/${rentalId || 'general'}/${uuidv4()}.png`;

      const { data, error } = await supabase.storage
        .from('rental-signatures')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage.from('rental-signatures').getPublicUrl(fileName);
      
      onSave(publicUrlData.publicUrl);
      onClose();
    } catch (error) {
      console.error('Error saving signature:', error);
      alert('Failed to save signature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Customer Signature</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="border border-gray-300 rounded-lg">
            <SignatureCanvas
              ref={sigPad}
              penColor="black"
              canvasProps={{
                className: 'w-full h-48 rounded-lg',
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClear} disabled={isSaving}>
            Clear
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Signature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignaturePadModal;