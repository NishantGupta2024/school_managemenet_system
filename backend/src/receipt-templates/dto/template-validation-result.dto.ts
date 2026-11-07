export interface PlaceholderValidationDiagnostics {
  unsupportedPlaceholders: string[];
  missingRequiredPlaceholders: string[];
  hasRepeatingAllocations: boolean;
  warnings: string[];
  errors: string[];
}

export interface TemplateValidationResult {
  isValid: boolean;
  canActivate: boolean;
  placeholdersDetected: string[];
  diagnostics: PlaceholderValidationDiagnostics;
  pdfEngineAvailable: boolean;
  pdfEngineName: string;
}
