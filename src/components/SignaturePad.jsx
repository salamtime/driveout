import React, { useRef } from 'react';
import i18n from '../i18n';
import SignatureCanvas from 'react-signature-canvas';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const SignaturePad = ({ onSave, onClear }) => {
  const sigPad = useRef(null);

  const handleSave = () => {
    if (sigPad.current.isEmpty()) {
      alert(tr('Please provide a signature first.', 'Veuillez d’abord fournir une signature.'));
    } else {
      const dataURL = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
      onSave(dataURL);
    }
  };

  const handleClear = () => {
    sigPad.current.clear();
    onClear();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{tr('Customer Signature', 'Signature du client')}</h3>
      <div className="border border-gray-300 rounded-lg">
        <SignatureCanvas
          ref={sigPad}
          penColor="black"
          canvasProps={{
            className: 'w-full h-48 rounded-lg',
          }}
        />
      </div>
      <div className="flex justify-end space-x-4 mt-4">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          {tr('Clear', 'Effacer')}
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {tr('Save Signature', 'Enregistrer la signature')}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
