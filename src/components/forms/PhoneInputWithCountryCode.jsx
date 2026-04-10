import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Phone, Search } from 'lucide-react';

const PHONE_COUNTRY_CODES = [
  { code: '+212', flag: '🇲🇦', name: 'Morocco', pattern: /^\+212\s?\d{9}$/, example: '+212 6XX XXX XXX', digits: 9 },
  { code: '+33', flag: '🇫🇷', name: 'France', pattern: /^\+33\s?\d{9}$/, example: '+33 1 XX XX XX XX', digits: 9 },
  { code: '+34', flag: '🇪🇸', name: 'Spain', pattern: /^\+34\s?\d{9}$/, example: '+34 6XX XXX XXX', digits: 9 },
  { code: '+32', flag: '🇧🇪', name: 'Belgium', pattern: /^\+32\s?\d{8,9}$/, example: '+32 4XX XX XX XX', digits: 9 },
  { code: '+31', flag: '🇳🇱', name: 'Netherlands', pattern: /^\+31\s?\d{9}$/, example: '+31 6 XXXX XXXX', digits: 9 },
  { code: '+351', flag: '🇵🇹', name: 'Portugal', pattern: /^\+351\s?\d{9}$/, example: '+351 9XX XXX XXX', digits: 9 },
  { code: '+41', flag: '🇨🇭', name: 'Switzerland', pattern: /^\+41\s?\d{9}$/, example: '+41 7X XXX XX XX', digits: 9 },
  { code: '+353', flag: '🇮🇪', name: 'Ireland', pattern: /^\+353\s?\d{9}$/, example: '+353 8X XXX XXXX', digits: 9 },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom', pattern: /^\+44\s?\d{10}$/, example: '+44 7XXX XXX XXX', digits: 10 },
  { code: '+49', flag: '🇩🇪', name: 'Germany', pattern: /^\+49\s?\d{10,11}$/, example: '+49 1XX XXX XXXX', digits: 10 },
  { code: '+39', flag: '🇮🇹', name: 'Italy', pattern: /^\+39\s?\d{9,10}$/, example: '+39 3XX XXX XXXX', digits: 9 },
  { code: '+1', flag: '🇺🇸', name: 'United States / Canada', pattern: /^\+1\s?\d{10}$/, example: '+1 XXX XXX XXXX', digits: 10 },
  { code: '+90', flag: '🇹🇷', name: 'Turkey', pattern: /^\+90\s?\d{10}$/, example: '+90 5XX XXX XXXX', digits: 10 },
  { code: '+971', flag: '🇦🇪', name: 'United Arab Emirates', pattern: /^\+971\s?\d{9}$/, example: '+971 5X XXX XXXX', digits: 9 },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', pattern: /^\+966\s?\d{9}$/, example: '+966 5X XXX XXXX', digits: 9 },
  { code: '+974', flag: '🇶🇦', name: 'Qatar', pattern: /^\+974\s?\d{8}$/, example: '+974 XXXX XXXX', digits: 8 },
  { code: '+965', flag: '🇰🇼', name: 'Kuwait', pattern: /^\+965\s?\d{8}$/, example: '+965 XXXX XXXX', digits: 8 },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain', pattern: /^\+973\s?\d{8}$/, example: '+973 XXXX XXXX', digits: 8 },
  { code: '+968', flag: '🇴🇲', name: 'Oman', pattern: /^\+968\s?\d{8}$/, example: '+968 XXXX XXXX', digits: 8 },
  { code: '+213', flag: '🇩🇿', name: 'Algeria', pattern: /^\+213\s?\d{9}$/, example: '+213 5XX XX XX XX', digits: 9 },
  { code: '+216', flag: '🇹🇳', name: 'Tunisia', pattern: /^\+216\s?\d{8}$/, example: '+216 XX XXX XXX', digits: 8 },
  { code: '+20', flag: '🇪🇬', name: 'Egypt', pattern: /^\+20\s?\d{10}$/, example: '+20 1XX XXX XXXX', digits: 10 },
  { code: '+221', flag: '🇸🇳', name: 'Senegal', pattern: /^\+221\s?\d{9}$/, example: '+221 7X XXX XX XX', digits: 9 },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria', pattern: /^\+234\s?\d{10}$/, example: '+234 8XX XXX XXXX', digits: 10 },
  { code: '+91', flag: '🇮🇳', name: 'India', pattern: /^\+91\s?\d{10}$/, example: '+91 XXXXX XXXXX', digits: 10 },
  { code: '+92', flag: '🇵🇰', name: 'Pakistan', pattern: /^\+92\s?\d{10}$/, example: '+92 3XX XXX XXXX', digits: 10 },
  { code: '+86', flag: '🇨🇳', name: 'China', pattern: /^\+86\s?\d{11}$/, example: '+86 1XX XXXX XXXX', digits: 11 }
];

const defaultTr = (en) => en;

const PhoneInputWithCountryCode = ({ value, onChange, tr = defaultTr, label = 'Phone', autoFocus = false, disabled = false }) => {
  const [countryCode, setCountryCode] = useState('+212');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [validationError, setValidationError] = useState('');
  const [whatsAppLink, setWhatsAppLink] = useState('');
  const [isWhatsAppAvailable, setIsWhatsAppAvailable] = useState(false);
  const dropdownRef = useRef(null);

  const translate = (en, fr) => tr(en, fr || en);
  const getCountryConfig = (code) => PHONE_COUNTRY_CODES.find((country) => country.code === code) || PHONE_COUNTRY_CODES[0];

  const validatePhoneNumber = (fullNumber, countryConfig) => {
    if (!fullNumber) {
      setValidationError('');
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const digitsOnly = fullNumber.replace(/\D/g, '');
    const expectedDigits = countryConfig.digits;

    if (!fullNumber.startsWith('+')) {
      setValidationError(translate(`Phone number must start with country code (e.g., ${countryConfig.code})`, `Le numéro doit commencer par l'indicatif pays (ex. ${countryConfig.code})`));
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!fullNumber.startsWith(countryConfig.code)) {
      setValidationError(translate(`Number must start with ${countryConfig.code} for ${countryConfig.name}`, `Le numéro doit commencer par ${countryConfig.code} pour ${countryConfig.name}`));
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const numberWithoutCountryCode = digitsOnly.replace(countryConfig.code.replace('+', ''), '');

    if (numberWithoutCountryCode.length < expectedDigits) {
      setValidationError(translate(`${countryConfig.name} numbers need ${expectedDigits} digits`, `Les numéros ${countryConfig.name} doivent contenir ${expectedDigits} chiffres`));
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (numberWithoutCountryCode.length > expectedDigits) {
      setValidationError(translate(`${countryConfig.name} numbers should have exactly ${expectedDigits} digits`, `Les numéros ${countryConfig.name} doivent contenir exactement ${expectedDigits} chiffres`));
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!countryConfig.pattern.test(fullNumber.replace(/\s/g, ''))) {
      setValidationError(translate(`Invalid ${countryConfig.name} format. Example: ${countryConfig.example}`, `Format ${countryConfig.name} invalide. Exemple : ${countryConfig.example}`));
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const cleanNumber = fullNumber.replace(/\s/g, '').replace('+', '');
    if (countryConfig.code === '+212') {
      const prefix = numberWithoutCountryCode.substring(0, 1);
      const isMoroccanMobile = ['6', '7'].includes(prefix);
      if (isMoroccanMobile) {
        setWhatsAppLink(`https://wa.me/${cleanNumber}`);
        setIsWhatsAppAvailable(true);
      } else {
        setWhatsAppLink('');
        setIsWhatsAppAvailable(false);
      }
    } else {
      setWhatsAppLink(`https://wa.me/${cleanNumber}`);
      setIsWhatsAppAvailable(true);
    }

    setValidationError('');
    return true;
  };

  useEffect(() => {
    if (!value) {
      setPhoneNumber('');
      setValidationError('');
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return;
    }

    const matchedCode = PHONE_COUNTRY_CODES.find((country) => value.startsWith(country.code));
    if (matchedCode) {
      setCountryCode(matchedCode.code);
      setPhoneNumber(value.replace(matchedCode.code, '').trim());
      validatePhoneNumber(value, matchedCode);
      return;
    }

    if (value.startsWith('+')) {
      const possibleCode = PHONE_COUNTRY_CODES.find((country) => value.startsWith(country.code));
      if (possibleCode) {
        setCountryCode(possibleCode.code);
      }
    }

    setPhoneNumber(value);
    validatePhoneNumber(value, getCountryConfig(countryCode));
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePhoneChange = (event) => {
    const input = event.target.value;

    if (input.startsWith('0') && countryCode === '+212') {
      const moroccanNumber = input.substring(1).replace(/\D/g, '');
      const formatted = `+212 ${moroccanNumber}`;
      setPhoneNumber(moroccanNumber);
      onChange(formatted);
      return;
    }

    if (input.startsWith('+')) {
      setPhoneNumber(input);
      onChange(input);
      return;
    }

    const digits = input.replace(/\D/g, '');
    setPhoneNumber(digits);
    onChange(digits ? `${countryCode} ${digits}` : '');
  };

  const handleCountryCodeChange = (newCode) => {
    setCountryCode(newCode);
    setIsDropdownOpen(false);
    setSearchTerm('');
    if (phoneNumber) {
      onChange(`${newCode} ${phoneNumber.replace(/\D/g, '')}`);
    } else {
      onChange('');
    }
  };

  const filteredCountries = PHONE_COUNTRY_CODES.filter((country) =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) || country.code.includes(searchTerm)
  );
  const selectedCountry = getCountryConfig(countryCode);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative flex items-stretch overflow-visible rounded-2xl border border-slate-200 bg-slate-50/80 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((open) => !open)}
            disabled={disabled}
            className="flex h-full min-h-[56px] items-center gap-2 rounded-l-2xl border-r border-slate-200 bg-slate-100/90 px-4 text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="text-lg">{selectedCountry.flag}</span>
            <span className="text-sm font-semibold">{selectedCountry.code}</span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-2 max-h-80 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={translate('Search country...', 'Rechercher un pays...')}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-9 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredCountries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountryCodeChange(country.code)}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-violet-50 last:border-b-0"
                  >
                    <span className="text-xl">{country.flag}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{country.name}</div>
                      <div className="text-xs text-slate-500">
                        {country.code} • {country.digits} {translate('digits', 'chiffres')}
                      </div>
                    </div>
                    {country.code === countryCode ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder={selectedCountry.code === '+212' ? '6XX XXX XXX' : translate('Phone number', 'Numéro de téléphone')}
            className="block w-full rounded-r-2xl bg-transparent py-3.5 pl-10 pr-4 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-600"
          />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {validationError ? (
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="text-xs font-medium text-red-500">{validationError}</p>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-500">
            {selectedCountry.code === '+212'
              ? translate('Moroccan format: +212 6XX XXX XXX', 'Format marocain : +212 6XX XXX XXX')
              : `${translate('Format', 'Format')} : ${selectedCountry.example}`}
          </p>
        )}

        {isWhatsAppAvailable && !validationError && value ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <p className="text-xs text-green-600">
              {translate('WhatsApp available', 'WhatsApp disponible')}
              {whatsAppLink ? (
                <>
                  {' • '}
                  <a href={whatsAppLink} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                    {translate('Open WhatsApp', 'Ouvrir WhatsApp')}
                  </a>
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PhoneInputWithCountryCode;
