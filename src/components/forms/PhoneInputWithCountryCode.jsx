import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Phone, Search } from 'lucide-react';
import { PHONE_COUNTRY_CODES } from '../../constants/phoneCountryCodes';

const defaultTr = (en) => en;

const PhoneInputWithCountryCode = ({ value, onChange, tr = defaultTr, label = 'Phone', autoFocus = false, disabled = false, required = false }) => {
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
      <div className="relative flex w-full min-w-0 items-stretch overflow-visible rounded-2xl border border-slate-200 bg-slate-50/80 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
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
            <div className="absolute left-0 top-full z-20 mt-2 max-h-80 min-w-[18rem] w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)] sm:z-50">
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

        <div className="relative min-w-0 flex-1">
          <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            autoFocus={autoFocus}
            disabled={disabled}
            required={required}
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
