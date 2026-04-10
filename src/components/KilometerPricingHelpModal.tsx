import React from 'react';
import { X, Info, CheckCircle, AlertTriangle, DollarSign, Package, TrendingUp, Zap } from 'lucide-react';
import i18n from '../i18n';

interface KilometerPricingHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KilometerPricingHelpModal: React.FC<KilometerPricingHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en: string, fr: string) => (isFrench ? fr : en);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <Info className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{tr('Kilometer-Based Pricing Guide', 'Guide de tarification kilométrique')}</h2>
              <p className="text-sm text-purple-100">{tr('Everything you need to know about managing rental packages', 'Tout ce qu’il faut savoir pour gérer les forfaits de location')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* What is Kilometer-Based Pricing */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <Package className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('What is Kilometer-Based Pricing?', 'Qu’est-ce que la tarification kilométrique ?')}</h3>
                <p className="text-gray-700 leading-relaxed">
                  {tr('Kilometer-based pricing allows you to create rental packages that include a specific number of kilometers. If customers exceed the included kilometers, they are automatically charged an overage rate per additional kilometer.', 'La tarification kilométrique vous permet de créer des forfaits de location incluant un nombre précis de kilomètres. Si le client dépasse le kilométrage inclus, un tarif supplémentaire par kilomètre additionnel est appliqué automatiquement.')}
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200">
              <p className="text-sm font-medium text-gray-900 mb-2">💡 {tr('Benefits:', 'Avantages :')}</p>
              <ul className="space-y-1 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>{tr('Fair Pricing:', 'Tarification juste :')}</strong> {tr('Customers pay for what they use', 'Les clients paient selon leur usage')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>{tr('Automatic Calculation:', 'Calcul automatique :')}</strong> {tr('System calculates overage charges automatically', 'Le système calcule automatiquement les frais de dépassement')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>{tr('Flexible Packages:', 'Forfaits flexibles :')}</strong> {tr('Create different packages for different rental durations', 'Créez différents forfaits selon la durée de location')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>{tr('Revenue Optimization:', 'Optimisation des revenus :')}</strong> {tr('Maximize earnings from high-mileage rentals', 'Maximisez les revenus des locations à fort kilométrage')}</span>
                </li>
              </ul>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-green-50 border border-green-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <Zap className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('How It Works', 'Comment ça fonctionne')}</h3>
                <div className="space-y-3 text-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tr('Create a Package', 'Créer un forfait')}</p>
                      <p className="text-sm">{tr('Define the package name, base price, included kilometers, and overage rate', 'Définissez le nom du forfait, le prix de base, les kilomètres inclus et le tarif de dépassement')}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tr('Assign to Rentals', 'Affecter aux locations')}</p>
                      <p className="text-sm">{tr('When creating a rental, select the appropriate package based on duration', 'Lors de la création d’une location, choisissez le forfait adapté à la durée')}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tr('Track Usage', 'Suivre l’utilisation')}</p>
                      <p className="text-sm">{tr('Record starting and ending odometer readings during rental', 'Enregistrez les relevés de compteur au départ et au retour')}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tr('Automatic Calculation', 'Calcul automatique')}</p>
                      <p className="text-sm">{tr('System calculates overage and updates the total amount automatically', 'Le système calcule le dépassement et met à jour automatiquement le montant total')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Example Scenarios */}
          <section className="bg-purple-50 border border-purple-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('Example Scenarios', 'Exemples de scénarios')}</h3>
                
                {/* Example 1 */}
                <div className="bg-white rounded-lg p-4 border border-purple-200 mb-3">
                  <p className="font-medium text-gray-900 mb-2">📦 {tr('Daily 200km Package', 'Forfait journalier 200 km')}</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    <p><strong>{tr('Base Price:', 'Prix de base :')}</strong> 300 MAD</p>
                    <p><strong>{tr('Included Kilometers:', 'Kilomètres inclus :')}</strong> 200 km</p>
                    <p><strong>{tr('Overage Rate:', 'Tarif de dépassement :')}</strong> 2.50 MAD/km</p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-100">
                    <p className="text-sm font-medium text-gray-900 mb-1">{tr('Scenario:', 'Scénario :')}</p>
                    <p className="text-sm text-gray-700">{tr('Customer drives 350 km (150 km over limit)', 'Le client parcourt 350 km (150 km au-dessus de la limite)')}</p>
                    <p className="text-sm text-purple-700 font-medium mt-2">
                      💰 Total: 300 MAD + (150 km × 2.50 MAD) = <strong>675 MAD</strong>
                    </p>
                  </div>
                </div>

                {/* Example 2 */}
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <p className="font-medium text-gray-900 mb-2">📦 {tr('Weekly 1500km Package', 'Forfait hebdomadaire 1500 km')}</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    <p><strong>{tr('Base Price:', 'Prix de base :')}</strong> 2,400 MAD</p>
                    <p><strong>{tr('Included Kilometers:', 'Kilomètres inclus :')}</strong> 1,500 km</p>
                    <p><strong>{tr('Overage Rate:', 'Tarif de dépassement :')}</strong> 1.50 MAD/km</p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-100">
                    <p className="text-sm font-medium text-gray-900 mb-1">{tr('Scenario:', 'Scénario :')}</p>
                    <p className="text-sm text-gray-700">{tr('Customer drives 1,350 km (within limit)', 'Le client parcourt 1 350 km (dans la limite)')}</p>
                    <p className="text-sm text-green-700 font-medium mt-2">
                      ✅ Total: <strong>2,400 MAD</strong> (no overage charge)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step-by-Step Guide */}
          <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <DollarSign className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Creating Your First Package', 'Créer votre premier forfait')}</h3>
                
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">1.</span>
                    <span><strong>{tr('Click "Create Package"', 'Cliquez sur « Créer un forfait »')}</strong> {tr('button in the Kilometer Pricing tab', 'dans l’onglet de tarification kilométrique')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">2.</span>
                    <span><strong>{tr('Enter Package Name:', 'Saisissez le nom du forfait :')}</strong> {tr('Use descriptive names like "Daily 200km" or "Weekly 1000km"', 'Utilisez des noms descriptifs comme « Journalier 200 km » ou « Hebdomadaire 1000 km »')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">3.</span>
                    <span><strong>{tr('Select Rate Type:', 'Choisissez le type de tarif :')}</strong> {tr('Choose Hourly, Daily, Weekly, or Monthly', 'Choisissez horaire, journalier, hebdomadaire ou mensuel')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">4.</span>
                    <span><strong>{tr('Set Base Price:', 'Définissez le prix de base :')}</strong> {tr('The rental price before any overage charges', 'Le prix de location avant tout frais de dépassement')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">5.</span>
                    <span><strong>{tr('Define Included Kilometers:', 'Définissez les kilomètres inclus :')}</strong> {tr('How many kilometers are included in the base price', 'Le nombre de kilomètres inclus dans le prix de base')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">6.</span>
                    <span><strong>{tr('Set Overage Rate:', 'Définissez le tarif de dépassement :')}</strong> {tr('Price per kilometer beyond the included amount (in MAD)', 'Prix par kilomètre au-delà du forfait (en MAD)')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">7.</span>
                    <span><strong>{tr('(Optional) Vehicle-Specific Rates:', '(Optionnel) Tarifs spécifiques au véhicule :')}</strong> {tr('Set different overage rates for Luxury or Premium vehicles', 'Définissez des tarifs différents pour les véhicules luxe ou premium')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">8.</span>
                    <span><strong>{tr('Save Package:', 'Enregistrez le forfait :')}</strong> {tr('Click "Save" to create the package', 'Cliquez sur « Enregistrer » pour créer le forfait')}</span>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section className="bg-orange-50 border border-orange-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Best Practices & Tips', 'Bonnes pratiques et conseils')}</h3>
                
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">💡 {tr('Pricing Strategy', 'Stratégie tarifaire')}</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>{tr('Set competitive included kilometers based on typical usage patterns', "Définissez des kilomètres inclus compétitifs selon les habitudes d'utilisation typiques")}</li>
                      <li>{tr('Price overage rates to discourage excessive mileage while remaining fair', 'Fixez les tarifs de dépassement pour décourager un kilométrage excessif tout en restant justes')}</li>
                      <li>{tr('Offer multiple package options to suit different customer needs', 'Proposez plusieurs options de forfaits pour répondre aux différents besoins des clients')}</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">⚙️ {tr('Package Management', 'Gestion des forfaits')}</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>{tr('Use clear, descriptive package names (e.g., "Daily 200km", not "Package A")', 'Utilisez des noms de forfait clairs et descriptifs (ex. « Journalier 200 km », pas « Forfait A »)')}</li>
                      <li>{tr('Review and adjust packages quarterly based on actual usage data', "Examinez et ajustez les forfaits chaque trimestre selon les données d'utilisation réelles")}</li>
                      <li>{tr('Keep packages active that are currently in use by rentals', 'Gardez actifs les forfaits actuellement utilisés dans les locations')}</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">🚗 {tr('Vehicle-Specific Rates', 'Tarifs spécifiques au véhicule')}</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>{tr('Set higher overage rates for Luxury vehicles to cover wear and tear', "Définissez des tarifs de dépassement plus élevés pour les véhicules de luxe afin de couvrir l'usure")}</li>
                      <li>{tr('Consider fuel efficiency when setting rates for different vehicle types', "Tenez compte de l'efficacité énergétique lors du paramétrage des tarifs selon les types de véhicules")}</li>
                      <li>{tr('Premium vehicles may justify 20-30% higher overage rates', 'Les véhicules premium peuvent justifier des tarifs de dépassement supérieurs de 20 à 30 %')}</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">📊 {tr('Monitoring & Analytics', 'Suivi et analyse')}</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>{tr('Track which packages are most popular with customers', 'Suivez les forfaits les plus populaires auprès des clients')}</li>
                      <li>{tr('Monitor average overage charges to identify pricing issues', 'Surveillez les frais moyens de dépassement pour identifier les problèmes tarifaires')}</li>
                      <li>{tr('Adjust included kilometers if most rentals exceed the limit', 'Ajustez les kilomètres inclus si la plupart des locations dépassent la limite')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Rate Types Explained */}
          <section className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{tr('Rate Types Explained', 'Types de tarifs expliqués')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">⏱️ {tr('Hourly', 'Horaire')}</p>
                <p className="text-gray-700">{tr('No kilometer tracking. Charged by the hour only.', 'Pas de suivi kilométrique. Facturé uniquement à l’heure.')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">📅 {tr('Daily', 'Journalier')}</p>
                <p className="text-gray-700">{tr('24-hour rentals with kilometer limits (e.g., 200km/day)', 'Locations de 24 heures avec limites kilométriques (ex. 200 km/jour)')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">📆 {tr('Weekly', 'Hebdomadaire')}</p>
                <p className="text-gray-700">{tr('7-day rentals with higher kilometer allowances (e.g., 1500km/week)', 'Locations de 7 jours avec des limites kilométriques plus élevées (ex. 1500 km/semaine)')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">🗓️ {tr('Monthly', 'Mensuel')}</p>
                <p className="text-gray-700">{tr('30-day rentals with generous limits (e.g., 5000km/month)', 'Locations de 30 jours avec des limites généreuses (ex. 5000 km/mois)')}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {tr('Need more help? Contact support or check the documentation.', "Besoin d'aide supplémentaire ? Contactez l'assistance ou consultez la documentation.")}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              {tr('Got it!', "J'ai compris !")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KilometerPricingHelpModal;
