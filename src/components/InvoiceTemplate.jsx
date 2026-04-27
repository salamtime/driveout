import { forwardRef } from "react";
import i18n from "../i18n";

const loadPdfTools = async () => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  return { jsPDF, html2canvas };
};

const getRentalKilometerPackage = (rental) => {
  const pkg = rental?.package;
  if (!pkg) return null;

  const hasLinkedPackage = Boolean(
    rental?.package_id ||
    rental?.selected_package_id ||
    rental?.package?.id
  );
  const hasKmConfig =
    pkg.included_kilometers !== null && pkg.included_kilometers !== undefined ||
    pkg.extra_km_rate !== null && pkg.extra_km_rate !== undefined;

  return hasLinkedPackage && hasKmConfig ? pkg : null;
};

const getRentalDurationUnits = (rental) =>
  rental?.rental_type === 'hourly'
    ? (rental?.quantity_hours ?? rental?.quantity_days ?? 1)
    : (rental?.quantity_days ?? 1);

const getPackageTotalIncludedKilometers = (rental, pkg = null) => {
  const resolvedPackage = pkg || getRentalKilometerPackage(rental);
  if (!resolvedPackage) return 0;

  const appliedIncludedKm = Number.parseFloat(
    rental?.included_kilometers_applied ??
    rental?.package_total_included_km ??
    rental?.selected_package_total_included_km ??
    0
  ) || 0;
  if (appliedIncludedKm > 0) return appliedIncludedKm;

  const includedPerUnit = Number.parseFloat(resolvedPackage?.included_kilometers || 0) || 0;
  if (!includedPerUnit) return 0;

  return includedPerUnit * Number(getRentalDurationUnits(rental) || 1);
};

const isFlatHourlyTierRental = (rental, hasPackage = false) => {
  const duration = Number(getRentalDurationUnits(rental));
  return !hasPackage && rental?.rental_type === 'hourly' && duration === 1.5;
};

const getEffectiveRentalBaseTotal = (rental, hasPackage = false, packageRate = null) => {
  const duration = Number(getRentalDurationUnits(rental));
  const fallbackRate = Number(rental?.unit_price || 0) || 0;
  const rate = packageRate ?? fallbackRate;
  if (isFlatHourlyTierRental(rental, hasPackage)) {
    return rate;
  }
  return rate * duration;
};

const InvoiceTemplate = forwardRef(({ rental, logoUrl, stampUrl }, ref) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  if (!rental) {
    return <div ref={ref}>{tr('No rental data available.', 'Aucune donnée de location disponible.')}</div>;
  }

  const {
    id,
    rental_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_license_number,
    nationality,
    start_date,
    end_date,
    vehicle_details,
    signature_url,
    second_driver_name,
    second_driver_license,
    unit_price,
    total_amount,
    overage_charge,
    total_extension_price,
    total_kilometers_driven,
    included_kilometers,
    extra_km_rate_applied,
    total_extended_hours,
    deposit_amount,
    remaining_amount,
    package: rentalPackage,
    total_distance,
    start_odometer,
    ending_odometer,
    original_end_date,
    extensions,
  } = rental;

  const kilometerPackage = getRentalKilometerPackage(rental);
  const durationUnits = getRentalDurationUnits(rental);
  const flatHourlyTier = isFlatHourlyTierRental(rental, !!kilometerPackage);
  const effectiveBaseTotal = kilometerPackage
    ? getEffectiveRentalBaseTotal(rental, true, Number(kilometerPackage.fixed_amount || unit_price || 0))
    : getEffectiveRentalBaseTotal(rental, false, Number(unit_price || 0));

  // Calculate overage details - Use stored value as source of truth only for real kilometer packages
  const calculateOverageDetails = () => {
    if (!rental) return { hasOverage: false, extraKm: 0, overageCharge: 0, includedKm: 0, rate: 0, totalKm: 0 };
    if (!kilometerPackage) return { hasOverage: false, extraKm: 0, overageCharge: 0, includedKm: 0, rate: 0, totalKm: 0 };
    
    // First, use the stored overage_charge if it exists (this is the source of truth)
    const storedOverageCharge = parseFloat(overage_charge || 0);
    
    // Get package details
    const includedKm = rental.included_kilometers_applied ||
                       getPackageTotalIncludedKilometers(rental, kilometerPackage) ||
                       0;
    const rate = rental.extra_km_rate_applied ||
                 kilometerPackage?.extra_km_rate ||
                 0;
    
    const totalKm = total_kilometers_driven || 
                    (ending_odometer && start_odometer ? 
                     ending_odometer - start_odometer : 0);
    
    const extraKm = Math.max(0, totalKm - includedKm);
    
    // Calculate what the overage should be based on the data
    const calculatedOverageCharge = extraKm * rate;
    
    // If there's a mismatch, log it but USE THE STORED VALUE
    if (storedOverageCharge > 0 && Math.abs(storedOverageCharge - calculatedOverageCharge) > 1) {
      console.warn('⚠️ Overage charge mismatch:', {
        stored: storedOverageCharge,
        calculated: calculatedOverageCharge,
        difference: storedOverageCharge - calculatedOverageCharge,
        using: tr('STORED VALUE', 'VALEUR ENREGISTRÉE')
      });
    }
    
    return {
      hasOverage: storedOverageCharge > 0,
      extraKm,
      overageCharge: storedOverageCharge, // Use stored value as source of truth
      includedKm,
      rate,
      totalKm,
      calculatedOverageCharge // Include for debugging
    };
  };

  const overageDetails = calculateOverageDetails();
  const includedKms = overageDetails.includedKm;
  const extraKmRate = overageDetails.rate;
  const totalKms = overageDetails.totalKm;
  const extraKms = overageDetails.extraKm;
  const finalOverageCharge = overageDetails.overageCharge;

  // ✅ Enhanced data extraction for extensions
  const extensionsList = extensions || [];
  const approvedExtensions = extensionsList.filter(ext => ext.status === 'approved');
  const calculatedHours = approvedExtensions.reduce((sum, ext) => sum + (ext.extension_hours || 0), 0);
  const calculatedPrice = approvedExtensions.reduce((sum, ext) => sum + (ext.extension_price || 0), 0);
  
  // Use calculated values if array exists, otherwise use direct values
  const displayHours = extensionsList.length > 0 ? calculatedHours : (total_extended_hours || 0);
  const displayPrice = extensionsList.length > 0 ? calculatedPrice : (total_extension_price || 0);

  const getCorrectSignatureUrl = (url) => {
    if (!url) {
      return null;
    }
    if (url.startsWith("http")) {
      return url;
    }
    const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL;
    const bucketName = 'signatures';
    return supabaseProjectUrl
      ? `${supabaseProjectUrl}/storage/v1/object/public/${bucketName}/${url}`
      : url;
  };

  const finalSignatureUrl = getCorrectSignatureUrl(signature_url);

  const handleDownloadPdf = async () => {
    const input = document.getElementById("rental-contract-to-print");
    const { jsPDF, html2canvas } = await loadPdfTools();

    html2canvas(input, {
      scale: 2,
      useCORS: true,
      scrollY: -window.scrollY,
      windowWidth: input.scrollWidth,
      windowHeight: input.scrollHeight
    }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      const ratio = imgWidth / imgHeight;
      
      const width = pdfWidth;
      const height = width / ratio;

      let position = 0;
      let heightLeft = height;

      pdf.addImage(imgData, "PNG", 0, position, width, height);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, width, height);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`rental-contract-${id}.pdf`);
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 bg-white rounded-lg shadow-lg print:shadow-none font-sans print:p-0">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .page-break { page-break-before: always; }
          .no-print { display: none; }
          .financial-section { page-break-inside: avoid; }
          .signature-section { page-break-inside: avoid; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>
      
      <div id="rental-contract-to-print" ref={ref} className="p-3 print:p-4">
        {/* Page 1 */}
        <div>
          {/* Header - Compact */}
          <header className="flex justify-between items-start pb-3 border-b-2 border-gray-800">
            <div className="flex items-center">
              <img src={logoUrl || "/assets/logo.jpg"} alt="Company Logo" className="h-14 w-auto object-contain" />
              <div className="ml-3">
                <h1 className="text-xl font-bold text-gray-900">SaharaX Rentals</h1>
                <p className="text-[9px] text-gray-600">Ave. Mohammed El Yazidi 43 Sect. 12 Bur. 34-3 Riad Rabat | contact@saharax.co | +212658888852</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-extrabold text-gray-800 uppercase">{tr('Rental Agreement', 'Contrat de location')}</h2>
              <p className="text-xs text-gray-600 mt-1">{tr('Agreement #:', 'Contrat n° :')} {rental_id || id.substring(0, 8)}</p>
            </div>
          </header>

          {/* Parties Involved - Compact */}
          <section className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-1">{tr('Renter Details', 'Détails du locataire')}</h3>
              <div className="text-xs space-y-0.5">
                <p><strong>{tr('Name:', 'Nom :')}</strong> {customer_name}</p>
                {customer_email && <p><strong>{tr('Email:', 'E-mail :')}</strong> {customer_email}</p>}
                <p><strong>{tr('Phone:', 'Téléphone :')}</strong> {customer_phone || tr("N/A", "N/D")}</p>
                <p><strong>{tr('License:', 'Permis :')}</strong> {customer_license_number || tr("N/A", "N/D")}</p>
                {nationality && nationality !== "N/A" && <p><strong>{tr('Nationality:', 'Nationalité :')}</strong> {nationality}</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-1">{tr('Vehicle Details', 'Détails du véhicule')}</h3>
              <div className="text-xs space-y-0.5">
                <p><strong>{tr('Vehicle:', 'Véhicule :')}</strong> {vehicle_details?.name || tr('Not specified', 'Non précisé')}</p>
                {vehicle_details?.plate_number && <p><strong>{tr('Plate:', 'Plaque :')}</strong> {vehicle_details.plate_number}</p>}
              </div>
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-1 mt-2">{tr('Rental Period', 'Période de location')}</h3>
              <div className="text-xs space-y-0.5">
                <p><strong>{tr('Start:', 'Début :')}</strong> {start_date || tr("N/A", "N/D")}</p>
                <p><strong>{tr('End:', 'Fin :')}</strong> {end_date || tr("N/A", "N/D")}</p>
              </div>
            </div>
          </section>
          
          {/* Second Driver Details - Compact */}
          {second_driver_name && (
            <section className="mt-3">
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-1">{tr('Second Driver', 'Second conducteur')}</h3>
              <div className="text-xs space-y-0.5">
                <p><strong>{tr('Name:', 'Nom :')}</strong> {second_driver_name}</p>
                <p><strong>{tr('License:', 'Permis :')}</strong> {second_driver_license || tr("N/A", "N/D")}</p>
              </div>
            </section>
          )}

          {/* Financial Breakdown Section - Compact */}
          <section className="mt-3 financial-section">
            <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-1">{tr('Financial Details', 'Détails financiers')}</h3>
            
            <div className="space-y-1 text-xs">
              {/* Package Information - Compact */}
              {kilometerPackage?.package_name && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2">
                  <p className="font-semibold text-blue-900 text-[10px] mb-0.5">📦 {kilometerPackage.package_name}</p>
                  <div className="text-[9px] text-blue-800">
                    <span>• {tr('Included KM:', 'KM inclus :')} {includedKms} km</span>
                    <span className="ml-2">• {tr('Extra Rate:', 'Tarif extra :')} {extraKmRate.toFixed(2)} MAD/km</span>
                  </div>
                </div>
              )}
              
              {/* Base Price */}
              <div className="flex justify-between">
                <span>{kilometerPackage ? tr('Package Base Price:', 'Prix de base du package :') : tr('Base Rental Price:', 'Prix de base de location :')}</span>
                <span className="font-medium">{effectiveBaseTotal.toFixed(2)} MAD</span>
              </div>
              
              {/* Kilometer Overage - Compact */}
              {finalOverageCharge > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-yellow-800 text-[10px]">{tr('KM Overage', 'Dépassement KM')}</span>
                    <span className="font-bold text-red-600 text-[10px]">+{finalOverageCharge.toFixed(2)} MAD</span>
                  </div>
                  
                  <div className="text-[9px] text-gray-700 space-y-0.5">
                    {start_odometer && ending_odometer && (
                      <div className="flex justify-between">
                        <span>{tr('Start:', 'Départ :')} {start_odometer} km</span>
                        <span>{tr('End:', 'Fin :')} {ending_odometer} km</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-yellow-200 pt-0.5">
                      <span>{tr('Total:', 'Total :')} {totalKms.toFixed(2)} km</span>
                      <span>{tr('Included:', 'Inclus :')} {includedKms} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{tr('Extra KM:', 'KM extra :')}</span>
                      <span className="font-medium">{extraKms.toFixed(2)} km @ {extraKmRate.toFixed(2)} MAD/km</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* No Overage Message - Compact */}
              {totalKms > 0 && finalOverageCharge === 0 && (
                <div className="bg-green-50 border border-green-200 rounded p-1.5">
                  <div className="text-[9px] text-green-800">
                    <p className="font-semibold">✓ {tr('No KM Overage', 'Aucun dépassement KM')}</p>
                    <p>{tr('Total:', 'Total :')} {totalKms.toFixed(2)} km ({tr('within', 'dans la limite de')} {includedKms} km)</p>
                  </div>
                </div>
              )}
              
              {/* Extension Fees - Compact */}
              {displayPrice > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded p-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-purple-800 text-[10px]">{tr('Ext. Info', "Infos d'extension")}</span>
                    <span className="font-bold text-purple-600 text-[10px]">+{displayPrice.toFixed(2)} MAD</span>
                  </div>
                  
                  <div className="text-[9px] text-gray-700">
                    <div className="flex justify-between mb-0.5">
                      <span>{tr('Extensions:', 'Extensions :')} {approvedExtensions.length || (displayHours > 0 ? 1 : 0)}</span>
                      <span>{tr('Hours:', 'Heures :')} {displayHours}h</span>
                    </div>
                    
                    {original_end_date && (
                      <div className="border-t border-purple-200 pt-0.5">
                        <div className="flex justify-between">
                          <span>{tr('Original End:', 'Fin initiale :')}</span>
                          <span className="text-[8px]">
                            {new Date(original_end_date).toLocaleString(isFrench ? 'fr-FR' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Grand Total */}
              <div className="flex justify-between pt-1 border-t-2 border-gray-800 text-sm font-bold">
                <span>{tr('Grand Total:', 'Total général :')}</span>
                <span>{(effectiveBaseTotal + (finalOverageCharge || 0) + (displayPrice || 0)).toFixed(2)} MAD</span>
              </div>
              
              {/* Deposit & Remaining */}
              <div className="flex justify-between">
                <span>{tr('Deposit Paid:', 'Dépôt payé :')}</span>
                <span>{(deposit_amount || 0).toFixed(2)} MAD</span>
              </div>
              
              <div className="flex justify-between font-semibold">
                <span>{tr('Remaining Due:', 'Reste dû :')}</span>
                <span>{(remaining_amount || 0).toFixed(2)} MAD</span>
              </div>
            </div>
          </section>

          {/* Signature Section - Compact */}
          <section className="mt-4 pt-3 border-t-2 border-dashed signature-section">
            <p className="text-[10px] text-center text-gray-600 mb-3">{tr('By signing below, the Renter acknowledges and agrees to all terms and conditions.', 'En signant ci-dessous, le locataire reconnaît et accepte tous les termes et conditions.')}</p>
            <div className="grid grid-cols-2 gap-6 items-end">
              <div>
                <h4 className="font-semibold text-xs text-gray-800 mb-1">{tr("Renter's Signature:", 'Signature du locataire :')}</h4>
                {finalSignatureUrl ? (
                  <img src={finalSignatureUrl} alt="Customer Signature" className="h-14 w-auto border-b-2 border-gray-400 pb-1" />
                ) : (
                  <div className="h-14 border-b-2 border-gray-400"></div>
                )}
                <p className="text-[10px] mt-1">{tr('Date:', 'Date :')} {new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-US')}</p>
              </div>
              <div className="text-center">
                <img src={stampUrl || "/assets/stamp.png"} alt="Company Stamp" className="h-20 w-auto mx-auto opacity-90" />
                <div className="border-t-2 border-gray-400 mt-1 pt-1">
                  <p className="font-semibold text-xs text-gray-800">{tr('SaharaX Rentals Representative', 'Représentant SaharaX Rentals')}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Page 2: Terms and Conditions - Highly Compact */}
        <div className="page-break">
          <section className="mt-3">
            <h3 className="text-sm font-semibold text-gray-800 border-b pb-1 mb-2">{tr('Terms & Conditions', 'Termes & conditions')}</h3>
            <div className="grid grid-cols-2 gap-2 text-[6px] leading-[0.95]">
              {/* French Column */}
              <div className="font-sans">
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 1 - Responsabilité</h4>
                  <p>1.1. Le locataire assume l'entière responsabilité de la conduite sûre et légale du quad pendant toute la durée de la location.</p>
                  <p>1.2. La société n'est pas responsable des accidents, blessures ou décès du locataire, des passagers ou de tiers, ni des dommages matériels résultant de l'utilisation du quad.</p>
                  <p>1.3. Le locataire est seul responsable de toute amende, sanction ou conséquence légale résultant d'infractions routières, d'une utilisation inappropriée ou d'une négligence.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 2 - Utilisation du Quad</h4>
                  <p>2.1. Le quad ne peut être conduit que par la ou les personnes mentionnées dans le contrat de location.</p>
                  <p>2.2. Il est interdit d'utiliser le quad pour des courses, des sauts, dans des zones interdites, pour remorquer ou pour toute activité dangereuse.</p>
                  <p>2.3. Le locataire doit porter un équipement de sécurité approprié, y compris un casque, en tout temps lors de la conduite.</p>
                  <p>2.4. Il est strictement interdit de conduire sous l'influence de l'alcool, de drogues ou de substances intoxicantes.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 3 - État du Véhicule et Dommages</h4>
                  <p>3.1. Le locataire reconnaît l'état du quad tel qu'indiqué dans le schéma d'inspection du véhicule au début de la location.</p>
                  <p>3.2. Toute nouvelle rayure ou dommage au retour sera facturé au locataire au coût de réparation ou de remplacement.</p>
                  <p>3.3. Le locataire est responsable de tous les frais découlant de dommages aux pneus, jantes, rétroviseurs ou accessoires pendant la période de location.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 4 - Carburant et Accessoires</h4>
                  <p>4.1. Le locataire doit restituer le quad avec le même niveau de carburant qu'au départ, sous peine de frais de ravitaillement.</p>
                  <p>4.2. Le locataire est entièrement responsable de la conservation de tous les documents du véhicule (carte grise, assurance, documents de location).</p>
                  <p>4.3. Une pénalité de 2000 MAD sera appliquée en cas de perte, de vol ou de détérioration de l'un de ces documents.</p>
                  <p>4.4. Tous les accessoires (casque, clés, outils, équipement de sécurité) doivent être restitués dans le même état qu'à la remise. Tout élément manquant ou endommagé sera facturé au coût de remplacement.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 5 - Durée de Location et Retards</h4>
                  <p>5.1. Le quad doit être restitué à l'heure et au lieu convenus dans le contrat.</p>
                  <p>5.2. Les retards entraînent des frais de 100 MAD par heure.</p>
                  <p>5.3. Si le quad est restitué après 12h00 le lendemain, il sera considéré comme une location de 24 heures complètes et facturé en conséquence.</p>
                  <p>5.4. La société se réserve le droit de mettre fin immédiatement à la location en cas de non-respect des présentes conditions.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">Art. 6 - Paiement et Caution</h4>
                  <p>6.1. Une caution est exigée et sera restituée au retour du quad dans son état initial, déduction faite des frais éventuels pour dommages, carburant manquant ou amendes.</p>
                  <p>6.2. Tous les frais de location et supplémentaires doivent être payés intégralement avant la remise du quad au locataire.</p>
                </div>
                <div>
                  <h4 className="font-bold mb-0.5">Art. 7 - Droit Applicable</h4>
                  <p>7.1. Le présent contrat est régi par les lois du Royaume du Maroc.</p>
                  <p>7.2. Le locataire reconnaît avoir lu et accepté l'ensemble des conditions.</p>
                </div>
              </div>
              {/* Arabic Column */}
              <div className="text-right" dir="rtl">
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 1 - المسؤولية</h4>
                  <p>1.1. يتحمل المستأجر المسؤولية الكاملة عن القيادة الآمنة والقانونية للدراجة الرباعية طوال فترة الإيجار.</p>
                  <p>1.2. لا تتحمل الشركة أي مسؤولية عن أي حوادث أو إصابات أو وفاة للمستأجر أو الركاب أو الأطراف الثالثة، أو عن أي أضرار بالممتلكات الناتجة عن استخدام الدراجة الرباعية.</p>
                  <p>1.3. يكون المستأجر مسؤولاً عن أي غرامات أو مخالفات أو عواقب قانونية نتيجة مخالفات المرور أو الاستخدام غير السليم أو الإهمال.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 2 - استخدام الدراجة الرباعية</h4>
                  <p>2.1. لا يجوز قيادة الدراجة إلا من قبل الشخص أو الأشخاص المذكورين في عقد الإيجار.</p>
                  <p>2.2. يمنع استخدام الدراجة في السباقات أو القفزات أو المناطق الممنوعة أو الجر أو أي نشاط خطير آخر.</p>
                  <p>2.3. يجب على المستأجر ارتداء معدات السلامة المناسبة، بما في ذلك الخوذة، في جميع الأوقات أثناء القيادة.</p>
                  <p>2.4. يمنع منعاً باتاً القيادة تحت تأثير الكحول أو المخدرات أو أي مواد مخدرة.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 3 - حالة المركبة والأضرار</h4>
                  <p>3.1. يقر المستأجر بحالة الدراجة كما هو موضح في مخطط فحص المركبة عند بداية الإيجار.</p>
                  <p>3.2. أي خدوش أو أضرار جديدة عند الإرجاع سيتم تحميل المستأجر تكاليف إصلاحها أو استبدالها.</p>
                  <p>3.3. يتحمل المستأجر جميع التكاليف الناتجة عن تلف الإطارات أو الجنط أو المرايا أو الإكسسوارات خلال فترة الإيجار.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 4 - الوقود والإكسسوارات</h4>
                  <p>4.1. يجب على المستأجر إعادة الدراجة بنفس مستوى الوقود كما كانت عند الاستلام، وإلا سيتم فرض رسوم تعبئة.</p>
                  <p>4.2. يتحمل المستأجر المسؤولية الكاملة عن الحفاظ على جميع وثائق المركبة (البطاقة الرمادية، التأمين، أوراق الإيجار).</p>
                  <p>4.3. يتم فرض غرامة 2000 درهم مغربي في حالة فقدان أو سرقة أو إتلاف أي من الوثائق.</p>
                  <p>4.4. يجب إعادة جميع الإكسسوارات (خوذة، مفاتيح، أدوات، معدات السلامة) بنفس الحالة التي تم تسليمها بها، وأي فقدان أو تلف سيتم تحميل المستأجر تكلفة استبداله.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 5 - مدة الايجار والرسوم الإضافية</h4>
                  <p>5.1. يجب إعادة الدراجة في الوقت والمكان المتفق عليهما في عقد الإيجار.</p>
                  <p>5.2. يتم فرض رسوم تأخير قدرها 100 درهم مغربي لكل ساعة.</p>
                  <p>5.3. إذا تمت إعادة الدراجة بعد الساعة 12:00 ظهراً من اليوم التالي، فسيتم احتسابها كإيجار لمدة 24 ساعة كاملة ويتوجب دفع تكلفة يوم كامل.</p>
                  <p>5.4. تحتفظ الشركة بحق إنهاء عقد الإيجار فوراً في حال خرق أي بند من هذه الشروط.</p>
                </div>
                <div className="mb-1">
                  <h4 className="font-bold mb-0.5">المادة 6 - الدفع والوديعة</h4>
                  <p>6.1. يتم دفع وديعة تأمين ويتم استرجاعها عند إعادة الدراجة بنفس حالتها الأصلية، مع خصم أي تكاليف للأضرار أو النقص في الوقود أو الغرامات.</p>
                  <p>6.2. يجب دفع جميع رسوم الإيجار وأي رسوم إضافية كاملة قبل تسليم الدراجة إلى المستأجر.</p>
                </div>
                <div>
                  <h4 className="font-bold mb-0.5">المادة 7 - القانون المطبق</h4>
                  <p>7.1. يخضع هذا العقد لقوانين المملكة المغربية.</p>
                  <p>7.2. يقر المستأجر بفهمه الكامل والموافقة على جميع الشروط الواردة هنا.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Footer - Compact */}
          <footer className="mt-4 pt-2 border-t border-gray-200 text-center text-[9px] text-gray-500">
            <p>{tr('Thank you for your business. Drive safely!', 'Merci pour votre confiance. Conduisez prudemment !')}</p>
          </footer>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 text-center no-print">
        <button onClick={handleDownloadPdf} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
          {tr('Download as PDF', 'Télécharger en PDF')}
        </button>
      </div>
    </div>
  );
});

InvoiceTemplate.displayName = "InvoiceTemplate";

export default InvoiceTemplate;
