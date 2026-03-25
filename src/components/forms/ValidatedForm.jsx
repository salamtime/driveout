import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import dataValidator from '../../utils/DataValidator';

/**
 * Validated Form Component with real-time validation and sanitization
 */
const ValidatedForm = ({
  entityType,
  initialData = {},
  onSubmit,
  onCancel,
  title,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  className = ''
}) => {
  const [formData, setFormData] = useState(initialData);
  const [validationErrors, setValidationErrors] = useState({});
  const [fieldTouched, setFieldTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSchema, setFormSchema] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    // Load validation schema for the entity type
    try {
      const schema = dataValidator.generateFormSchema(entityType);
      setFormSchema(schema);
    } catch (error) {
      console.error('Failed to load form schema:', error);
    }
  }, [entityType]);

  useEffect(() => {
    // Validate form whenever data changes
    if (formSchema && (submitAttempted || Object.keys(fieldTouched).length > 0)) {
      validateForm();
    }
  }, [formData, formSchema, submitAttempted]);

  const validateForm = () => {
    const validation = dataValidator.validateEntity(entityType, formData);
    setValidationErrors(validation.errors || {});
    return validation.isValid;
  };

  const validateField = (fieldName, value) => {
    if (!formSchema || !formSchema[fieldName]) return [];
    
    const rule = formSchema[fieldName];
    return dataValidator.validateField(value, rule, fieldName);
  };

  const handleFieldChange = (fieldName, value) => {
    // Sanitize input based on field type
    let sanitizedValue = value;
    
    if (formSchema && formSchema[fieldName]) {
      const rule = formSchema[fieldName];
      
      switch (rule.type) {
        case 'string':
          sanitizedValue = dataValidator.sanitizeString(value);
          break;
        case 'number':
          sanitizedValue = value === '' ? '' : Number(value);
          break;
        case 'boolean':
          sanitizedValue = Boolean(value);
          break;
        default:
          sanitizedValue = value;
      }
    }

    setFormData(prev => ({
      ...prev,
      [fieldName]: sanitizedValue
    }));

    // Mark field as touched
    setFieldTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));

    // Clear field-specific errors
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const handleFieldBlur = (fieldName) => {
    setFieldTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));

    // Validate specific field
    const fieldErrors = validateField(fieldName, formData[fieldName]);
    if (fieldErrors.length > 0) {
      setValidationErrors(prev => ({
        ...prev,
        [fieldName]: fieldErrors
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setIsSubmitting(true);

    try {
      // Validate entire form
      const isValid = validateForm();
      
      if (!isValid) {
        setIsSubmitting(false);
        return;
      }

      // Perform security validation
      const securityCheck = dataValidator.validateSecurityContext('create', formData);
      if (!securityCheck.isSecure) {
        setValidationErrors({
          _security: securityCheck.securityErrors
        });
        setIsSubmitting(false);
        return;
      }

      // Submit form
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
      
      if (error.validationErrors) {
        setValidationErrors(error.validationErrors);
      } else {
        setValidationErrors({
          _general: [error.message || 'An error occurred while submitting the form']
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (fieldName, rule) => {
    const value = formData[fieldName] || '';
    const errors = validationErrors[fieldName] || [];
    const hasError = errors.length > 0;
    const isTouched = fieldTouched[fieldName];

    const fieldProps = {
      id: fieldName,
      value: value,
      onChange: (e) => handleFieldChange(fieldName, e.target.value),
      onBlur: () => handleFieldBlur(fieldName),
      className: `${hasError ? 'border-red-500' : ''}`
    };

    let fieldElement;

    switch (rule.type) {
      case 'enum':
        fieldElement = (
          <Select
            value={value}
            onValueChange={(newValue) => handleFieldChange(fieldName, newValue)}
          >
            <SelectTrigger className={hasError ? 'border-red-500' : ''}>
              <SelectValue placeholder={`Select ${fieldName.replace('_', ' ')}`} />
            </SelectTrigger>
            <SelectContent>
              {rule.validation.enum?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;

      case 'boolean':
        fieldElement = (
          <Select
            value={value.toString()}
            onValueChange={(newValue) => handleFieldChange(fieldName, newValue === 'true')}
          >
            <SelectTrigger className={hasError ? 'border-red-500' : ''}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        );
        break;

      case 'number':
        fieldElement = (
          <Input
            {...fieldProps}
            type="number"
            min={rule.validation.min}
            max={rule.validation.max}
            step={rule.type === 'decimal' ? '0.01' : '1'}
          />
        );
        break;

      case 'date':
        fieldElement = (
          <Input
            {...fieldProps}
            type="date"
          />
        );
        break;

      case 'time':
        fieldElement = (
          <Input
            {...fieldProps}
            type="time"
          />
        );
        break;

      case 'string':
        if (rule.validation.maxLength > 500) {
          fieldElement = (
            <Textarea
              {...fieldProps}
              rows={4}
              maxLength={rule.validation.maxLength}
            />
          );
        } else {
          fieldElement = (
            <Input
              {...fieldProps}
              type="text"
              maxLength={rule.validation.maxLength}
            />
          );
        }
        break;

      default:
        fieldElement = (
          <Input
            {...fieldProps}
            type="text"
          />
        );
    }

    return (
      <div key={fieldName} className="space-y-2">
        <Label htmlFor={fieldName} className="flex items-center gap-2">
          {fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          {rule.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
        </Label>
        
        {fieldElement}
        
        {/* Field validation info */}
        {rule.validation && (
          <div className="text-xs text-gray-500">
            {rule.validation.minLength && rule.validation.maxLength && (
              <span>Length: {rule.validation.minLength}-{rule.validation.maxLength} characters</span>
            )}
            {rule.validation.min !== undefined && rule.validation.max !== undefined && (
              <span>Range: {rule.validation.min}-{rule.validation.max}</span>
            )}
            {rule.validation.pattern && (
              <span>Format required</span>
            )}
          </div>
        )}
        
        {/* Field errors */}
        {hasError && isTouched && (
          <div className="space-y-1">
            {errors.map((error, index) => (
              <Alert key={index} variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!formSchema) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Info className="h-5 w-5 mr-2" />
            Loading form schema...
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasGeneralErrors = validationErrors._general || validationErrors._security || validationErrors._crossField;
  const isFormValid = Object.keys(validationErrors).length === 0;

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      
      <CardContent className="space-y-6">
        {/* General errors */}
        {hasGeneralErrors && (
          <div className="space-y-2">
            {validationErrors._general?.map((error, index) => (
              <Alert key={index} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ))}
            {validationErrors._security?.map((error, index) => (
              <Alert key={index} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Security: {error}</AlertDescription>
              </Alert>
            ))}
            {validationErrors._crossField?.map((error, index) => (
              <Alert key={index} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Render form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(formSchema).map(([fieldName, rule]) => 
              renderField(fieldName, rule)
            )}
          </div>

          {/* Form actions */}
          <div className="flex justify-end gap-2 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
            )}
            
            <Button
              type="submit"
              disabled={isSubmitting || (!isFormValid && submitAttempted)}
              className="flex items-center gap-2"
            >
              {isFormValid && <CheckCircle className="h-4 w-4" />}
              {isSubmitting ? 'Submitting...' : submitLabel}
            </Button>
          </div>
        </form>

        {/* Form validation summary */}
        {submitAttempted && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              {isFormValid ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">Form is valid and ready to submit</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600">
                    Please fix {Object.keys(validationErrors).length} validation error(s)
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ValidatedForm;