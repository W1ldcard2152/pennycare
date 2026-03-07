export interface DocumentTypeDefinition {
  id: string;
  label: string;
  category: 'federal' | 'state' | 'company' | 'certification';
  required: boolean;
  description?: string;
}

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  // Federal Documents
  {
    id: 'w4',
    label: 'W-4 (Federal Withholding)',
    category: 'federal',
    required: true,
    description: 'Employee\'s Withholding Certificate',
  },
  {
    id: 'i9',
    label: 'I-9 (Employment Eligibility)',
    category: 'federal',
    required: true,
    description: 'Employment Eligibility Verification',
  },
  {
    id: 'direct_deposit',
    label: 'Direct Deposit Authorization',
    category: 'federal',
    required: false,
    description: 'Direct deposit form',
  },

  // New York State Documents
  {
    id: 'nys_it2104',
    label: 'NYS IT-2104 (State Withholding)',
    category: 'state',
    required: true,
    description: 'Employee\'s Withholding Allowance Certificate',
  },
  {
    id: 'nys_it2104e',
    label: 'NYS IT-2104-E (Exemption)',
    category: 'state',
    required: false,
    description: 'Certificate of Exemption from Withholding',
  },

  // Company/Personal Documents
  {
    id: 'drivers_license',
    label: 'Driver\'s License',
    category: 'company',
    required: true,
    description: 'Copy of driver\'s license',
  },
  {
    id: 'ssn_card',
    label: 'Social Security Card',
    category: 'company',
    required: true,
    description: 'Copy of social security card',
  },
  {
    id: 'emergency_contact',
    label: 'Emergency Contact Form',
    category: 'company',
    required: true,
    description: 'Emergency contact information',
  },
  {
    id: 'handbook_ack',
    label: 'Handbook Acknowledgment',
    category: 'company',
    required: true,
    description: 'Employee handbook acknowledgment',
  },
  {
    id: 'job_application',
    label: 'Job Application',
    category: 'company',
    required: false,
    description: 'Original job application',
  },
  {
    id: 'offer_letter',
    label: 'Offer Letter',
    category: 'company',
    required: false,
    description: 'Employment offer letter',
  },
  {
    id: 'background_check',
    label: 'Background Check Authorization',
    category: 'company',
    required: false,
    description: 'Background check consent form',
  },
  {
    id: 'drug_test',
    label: 'Drug Test Results',
    category: 'company',
    required: false,
    description: 'Pre-employment drug test',
  },

  // Certifications
  {
    id: 'ase_cert',
    label: 'ASE Certification',
    category: 'certification',
    required: false,
    description: 'Automotive Service Excellence certification',
  },
  {
    id: 'osha_training',
    label: 'OSHA Training Certificate',
    category: 'certification',
    required: false,
    description: 'OSHA safety training certification',
  },
  {
    id: 'safety_training',
    label: 'Safety Training Records',
    category: 'certification',
    required: false,
    description: 'General safety training documentation',
  },
  {
    id: 'other',
    label: 'Other',
    category: 'company',
    required: false,
    description: 'Other employee documents',
  },
];

export function getDocumentTypeById(id: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES.find((type) => type.id === id);
}

export function getRequiredDocumentTypes(): DocumentTypeDefinition[] {
  return DOCUMENT_TYPES.filter((type) => type.required);
}

export function getDocumentTypesByCategory(category: string): DocumentTypeDefinition[] {
  return DOCUMENT_TYPES.filter((type) => type.category === category);
}
