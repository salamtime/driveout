import React, { useState, useRef } from 'react';
import i18n from '../i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import SignatureCanvas from 'react-signature-canvas';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '../utils/storageUpload';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const SignaturePadModal = ({
  isOpen,
  onClose,
  onSave,
  rentalId,
  title,
  description,
}) => {
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
      alert(tr('Please provide a signature first.', 'Veuillez d’abord fournir une signature.'));
      return;
    }

    setIsSaving(true);
    try {
      const signatureImage = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
      const blob = dataURLtoBlob(signatureImage);
      const signatureFile = new File([blob], `${uuidv4()}.png`, { type: 'image/png' });
      const uploadResult = await uploadFile(signatureFile, {
        bucket: 'rental-signatures',
        pathPrefix: `signatures/${rentalId || 'general'}`,
        fileName: `${uuidv4()}.png`,
      });

      if (!uploadResult?.success) {
        throw new Error(uploadResult?.error || 'Failed to save signature');
      }

      onSave(uploadResult.url);
      onClose();
    } catch (error) {
      console.error('Error saving signature:', error);
      alert(tr('Failed to save signature. Please try again.', "Impossible d'enregistrer la signature. Veuillez réessayer."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title || tr('Customer Signature', 'Signature du client')}</DialogTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
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
            {tr('Clear', 'Effacer')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? tr('Saving...', 'Enregistrement...') : tr('Save Signature', 'Enregistrer la signature')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignaturePadModal;
