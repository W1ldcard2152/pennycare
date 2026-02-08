import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const FORM_CONFIGS: Record<string, { templatePath: string; label: string }> = {
  'i-9': {
    templatePath: 'public/document-templates/federal/I-9.pdf',
    label: 'Form I-9',
  },
  'w-4': {
    templatePath: 'public/document-templates/federal/W-4.pdf',
    label: 'Form W-4',
  },
  'it-2104': {
    templatePath: 'public/document-templates/state/NYS-IT-2104.pdf',
    label: 'Form IT-2104',
  },
  'ls-54': {
    templatePath: 'public/document-templates/state/LS-54.pdf',
    label: 'Form LS-54',
  },
};

interface EmployeeData {
  firstName: string;
  lastName: string;
  middleName: string | null;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  ssn: string;
  hireDate: Date;
  position: string;
  employmentType: string;
  payType: string;
  hourlyRate: number | null;
  annualSalary: number | null;
  w4FilingStatus: string | null;
  w4Allowances: number | null;
  additionalWithholding: number | null;
  stateFilingStatus: string | null;
  stateAllowances: number | null;
  stateResidency: string | null;
  dependentHealthInsurance: boolean;
}

interface CompanyData {
  companyName: string;
  legalBusinessName: string | null;
  fein: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  defaultPayPeriod: string | null;
  overtimeMultiplier: number;
}

function setFieldSafe(form: ReturnType<PDFDocument['getForm']>, fieldName: string, value: string) {
  try {
    const field = form.getTextField(fieldName);
    field.setText(value);
  } catch {
    // Field not found or not a text field - skip silently
  }
}

function checkFieldSafe(form: ReturnType<PDFDocument['getForm']>, fieldName: string, checked: boolean = true) {
  try {
    const field = form.getCheckBox(fieldName);
    if (checked) {
      field.check();
    } else {
      field.uncheck();
    }
  } catch {
    // Field not found or not a checkbox - skip silently
  }
}

// For multi-widget checkboxes (e.g., Yes/No pairs, Single/Married/Higher Rate triplets),
// pdf-lib's check() only activates widget 0. This function sets a specific widget by value.
function setMultiWidgetCheckbox(form: ReturnType<PDFDocument['getForm']>, fieldName: string, widgetValue: string) {
  try {
    const field = form.getCheckBox(fieldName);
    const acroField = field.acroField;
    const widgets = acroField.getWidgets();

    // Set field-level value
    acroField.dict.set(PDFName.of('V'), PDFName.of(widgetValue));

    // Set each widget's appearance state
    const targetName = PDFName.of(widgetValue);
    for (const widget of widgets) {
      const onValue = widget.getOnValue();
      if (onValue && onValue.encodedName === targetName.encodedName) {
        widget.dict.set(PDFName.of('AS'), targetName);
      } else {
        widget.dict.set(PDFName.of('AS'), PDFName.of('Off'));
      }
    }
  } catch {
    // Field not found or error - skip silently
  }
}

function formatDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatPhoneAreaCode(phone: string): { area: string; prefix: string; line: string } {
  const digits = phone.replace(/\D/g, '');
  return {
    area: digits.slice(0, 3),
    prefix: digits.slice(3, 6),
    line: digits.slice(6, 10),
  };
}

function fillI9(form: ReturnType<PDFDocument['getForm']>, emp: EmployeeData, company: CompanyData) {
  // Section 1 - Employee Information
  setFieldSafe(form, 'Last Name (Family Name)', emp.lastName);
  setFieldSafe(form, 'First Name Given Name', emp.firstName);
  if (emp.middleName) {
    setFieldSafe(form, 'Employee Middle Initial (if any)', emp.middleName.charAt(0));
  }
  setFieldSafe(form, 'Address Street Number and Name', emp.address || '');
  setFieldSafe(form, 'City or Town', emp.city || '');
  setFieldSafe(form, 'ZIP Code', emp.zipCode || '');
  if (emp.dateOfBirth) {
    setFieldSafe(form, 'Date of Birth mmddyyyy', formatDate(emp.dateOfBirth));
  }
  setFieldSafe(form, 'US Social Security Number', emp.ssn);
  setFieldSafe(form, 'Employees E-mail Address', emp.email || '');
  setFieldSafe(form, 'Telephone Number', emp.phone || '');
  setFieldSafe(form, "Today's Date mmddyyy", formatDate(new Date()));

  // State dropdown
  try {
    const stateField = form.getDropdown('State');
    if (emp.state) {
      stateField.select(emp.state);
    }
  } catch {
    // skip
  }

  // Section 2 - Employer Information
  setFieldSafe(form, 'Employers Business or Org Name', company.companyName);
  const companyFullAddress = [
    company.address,
    company.city,
    company.state,
    company.zipCode,
  ].filter(Boolean).join(', ');
  setFieldSafe(form, 'Employers Business or Org Address', companyFullAddress);
  setFieldSafe(form, 'FirstDayEmployed mmddyyyy', formatDate(emp.hireDate));
  setFieldSafe(form, 'S2 Todays Date mmddyyyy', formatDate(new Date()));
}

function fillW4(form: ReturnType<PDFDocument['getForm']>, emp: EmployeeData, company: CompanyData) {
  // Step 1(a) - Name, address, SSN
  const firstNameWithMiddle = emp.middleName
    ? `${emp.firstName} ${emp.middleName.charAt(0)}.`
    : emp.firstName;
  setFieldSafe(form, 'topmostSubform[0].Page1[0].Step1a[0].f1_01[0]', firstNameWithMiddle);
  setFieldSafe(form, 'topmostSubform[0].Page1[0].Step1a[0].f1_02[0]', emp.lastName);
  setFieldSafe(form, 'topmostSubform[0].Page1[0].Step1a[0].f1_03[0]', emp.address || '');
  setFieldSafe(form, 'topmostSubform[0].Page1[0].Step1a[0].f1_04[0]', [emp.city, emp.state, emp.zipCode].filter(Boolean).join(', '));
  // SSN with dashes
  const ssnFormatted = emp.ssn.replace(/(\d{3})(\d{2})(\d{4})/, '$1-$2-$3');
  setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_05[0]', ssnFormatted);

  // Step 1(c) - Filing status checkboxes
  if (emp.w4FilingStatus === 'single') {
    checkFieldSafe(form, 'topmostSubform[0].Page1[0].c1_1[0]', true);
  } else if (emp.w4FilingStatus === 'married') {
    checkFieldSafe(form, 'topmostSubform[0].Page1[0].c1_1[1]', true);
  } else if (emp.w4FilingStatus === 'head_of_household') {
    checkFieldSafe(form, 'topmostSubform[0].Page1[0].c1_1[2]', true);
  }

  // Step 4(c) - Extra withholding
  if (emp.additionalWithholding) {
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_11[0]', emp.additionalWithholding.toFixed(2));
  }

  // Employers Only section
  const employerAddr = [company.address, company.city, company.state, company.zipCode].filter(Boolean).join(', ');
  setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_12[0]', `${company.companyName}\n${employerAddr}`);
  setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_13[0]', formatDate(emp.hireDate));
  setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_14[0]', company.fein || '');
}

function fillIT2104(form: ReturnType<PDFDocument['getForm']>, emp: EmployeeData, company: CompanyData) {
  // Employee information
  const it2104FirstName = emp.middleName
    ? `${emp.firstName} ${emp.middleName.charAt(0)}.`
    : emp.firstName;
  setFieldSafe(form, 'First name and middle initial', it2104FirstName);
  setFieldSafe(form, 'Last name', emp.lastName);
  setFieldSafe(form, 'Permanent mailing address', emp.address || '');
  setFieldSafe(form, 'City, village or post office', emp.city || '');
  setFieldSafe(form, 'State', emp.state || '');
  setFieldSafe(form, 'ZIP code', emp.zipCode || '');
  setFieldSafe(form, 'Your SSN', emp.ssn);

  // Filing status - multi-widget checkbox: Single#2FHOH (widget 0), Married (widget 1), Higher#20Rate (widget 2)
  const filingStatus = emp.stateFilingStatus || emp.w4FilingStatus;
  if (filingStatus === 'married') {
    setMultiWidgetCheckbox(form, 'Status', 'Married');
  } else if (filingStatus === 'single' || filingStatus === 'head_of_household') {
    setMultiWidgetCheckbox(form, 'Status', 'Single#2FHOH');
  }

  // NYC/Yonkers residency - multi-widget checkboxes with Yes/No widgets, default to No
  setMultiWidgetCheckbox(form, 'Resident', 'No');
  setMultiWidgetCheckbox(form, 'Resident of Yonkers', 'No');

  // Allowances
  const allowances = emp.stateAllowances ?? emp.w4Allowances ?? 0;
  setFieldSafe(form, 'line 1', String(allowances));

  // Date
  setFieldSafe(form, 'Date', formatDate(new Date()));

  // New hire checkbox
  checkFieldSafe(form, 'employee is a new hire', true);

  // Dependent health insurance
  if (emp.dependentHealthInsurance) {
    checkFieldSafe(form, 'insurance benefits', true);
  }

  // Employer section
  const employerLine1 = company.companyName;
  const employerLine2 = [company.address, company.city, company.state, company.zipCode].filter(Boolean).join(', ');
  setFieldSafe(form, "Employer's name and address", employerLine1);
  setFieldSafe(form, "Employer's name and address-2", employerLine2);
  // EIN field has maxLength=9, so strip the dash from FEIN format (XX-XXXXXXX -> XXXXXXXXX)
  setFieldSafe(form, 'EIN', company.fein ? company.fein.replace(/\D/g, '') : '');

  // Service date (hire date)
  setFieldSafe(form, 'service date', formatDate(emp.hireDate));
}

function fillLS54(form: ReturnType<PDFDocument['getForm']>, emp: EmployeeData, company: CompanyData) {
  // 1. Employer Information
  setFieldSafe(form, 'Apprenticeship_ApplicantNotification_EmployerName', company.companyName);

  // DBA name
  setFieldSafe(form, 'Contact_OtherName_s_', company.legalBusinessName || company.companyName);

  // FEIN - split into individual digit fields
  if (company.fein) {
    const feinDigits = company.fein.replace(/\D/g, '');
    for (let i = 0; i < 9 && i < feinDigits.length; i++) {
      setFieldSafe(form, `Business_BusinessContact_FEIN${i + 1}`, feinDigits[i]);
    }
  }

  // Physical address
  const physicalAddress = [company.address, company.city, company.state, company.zipCode].filter(Boolean).join(', ');
  setFieldSafe(form, 'Business_BusinessAddress_BusinessStreetAddress1', physicalAddress);

  // Mailing address (same as physical)
  setFieldSafe(form, 'Generic_GenericMultiLine_MultiLine1', physicalAddress);

  // Phone - split into 3 parts
  if (company.phone) {
    const phoneParts = formatPhoneAreaCode(company.phone);
    setFieldSafe(form, 'Contact_OtherPhone1', phoneParts.area);
    setFieldSafe(form, 'Contact_OtherPhone2', phoneParts.prefix);
    setFieldSafe(form, 'Contact_OtherPhone3', phoneParts.line);
  }

  // 2. Notice given - At hiring
  checkFieldSafe(form, 'Generic_GenericYesNo_Yes16', true);

  // 3. Employee's rate of pay
  if (emp.payType === 'hourly' && emp.hourlyRate) {
    setFieldSafe(form, 'Employment_RegularRates_PerRate1', emp.hourlyRate.toFixed(2));
  } else if (emp.payType === 'salary' && emp.annualSalary) {
    // Convert annual salary to hourly equivalent for display (2080 hours/year)
    const hourlyEquivalent = emp.annualSalary / 2080;
    setFieldSafe(form, 'Employment_RegularRates_PerRate1', hourlyEquivalent.toFixed(2));
  }

  // 4. Allowances taken - None (default)
  checkFieldSafe(form, 'Employment_JobBenefits_None', true);

  // 5. Regular payday
  const payPeriodMap: Record<string, string> = {
    weekly: 'Friday',
    biweekly: 'Every other Friday',
    semimonthly: '15th and last day of month',
    monthly: 'Last day of month',
  };
  const payPeriod = company.defaultPayPeriod || 'biweekly';
  setFieldSafe(form, 'Generic_GenericTextField_TextField1', payPeriodMap[payPeriod] || payPeriod);

  // 6. Pay is - checkboxes
  if (payPeriod === 'weekly') {
    checkFieldSafe(form, 'Generic_GenericYesNo_No1', true); // Weekly
  } else if (payPeriod === 'biweekly') {
    checkFieldSafe(form, 'Generic_GenericYesNo_Yes1', true); // Bi-weekly
  } else {
    checkFieldSafe(form, 'Generic_GenericYesNo_Yes2', true); // Other
    setFieldSafe(form, 'Generic_GenericTextField_TextField3', payPeriod);
  }

  // 7. Overtime pay rate (WorkHistory_JobInfo_PerTime1 maps to the $____ field in section 7)
  if (emp.payType === 'hourly' && emp.hourlyRate) {
    const overtimeRate = emp.hourlyRate * company.overtimeMultiplier;
    setFieldSafe(form, 'WorkHistory_JobInfo_PerTime1', overtimeRate.toFixed(2));
  } else if (emp.payType === 'salary' && emp.annualSalary) {
    const hourlyEquivalent = emp.annualSalary / 2080;
    const overtimeRate = hourlyEquivalent * company.overtimeMultiplier;
    setFieldSafe(form, 'WorkHistory_JobInfo_PerTime1', overtimeRate.toFixed(2));
  }

  // 8. Employee acknowledgement
  // Primary language English checkbox
  checkFieldSafe(form, 'Employment_PrimaryLanguageEnglish', true);

  // Employee name
  setFieldSafe(form, 'Business_EmployeeName', `${emp.firstName} ${emp.lastName}`);

  // Signature date
  const today = new Date();
  setFieldSafe(form, 'DocumentSignature_SignatureMM', String(today.getMonth() + 1).padStart(2, '0'));
  setFieldSafe(form, 'DocumentSignature_SignatureDD', String(today.getDate()).padStart(2, '0'));
  setFieldSafe(form, 'DocumentSignature_SignatureYY', String(today.getFullYear()));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; formType: string }> }
) {
  try {
    const { id, formType } = await params;

    const config = FORM_CONFIGS[formType.toLowerCase()];
    if (!config) {
      return NextResponse.json(
        { error: 'Invalid form type. Valid types: i-9, w-4, it-2104, ls-54' },
        { status: 400 }
      );
    }

    // Fetch employee with company
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const company = employee.company;

    // Decrypt SSN
    const ssn = employee.taxIdEncrypted ? decrypt(employee.taxIdEncrypted) : '';

    const empData: EmployeeData = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      middleName: employee.middleName,
      dateOfBirth: employee.dateOfBirth,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      city: employee.city,
      state: employee.state,
      zipCode: employee.zipCode,
      ssn,
      hireDate: employee.hireDate,
      position: employee.position,
      employmentType: employee.employmentType,
      payType: employee.payType,
      hourlyRate: employee.hourlyRate,
      annualSalary: employee.annualSalary,
      w4FilingStatus: employee.w4FilingStatus,
      w4Allowances: employee.w4Allowances,
      additionalWithholding: employee.additionalWithholding,
      stateFilingStatus: employee.stateFilingStatus,
      stateAllowances: employee.stateAllowances,
      stateResidency: employee.stateResidency,
      dependentHealthInsurance: employee.dependentHealthInsurance,
    };

    const companyData: CompanyData = {
      companyName: company.companyName,
      legalBusinessName: company.legalBusinessName,
      fein: company.fein,
      address: company.address,
      city: company.city,
      state: company.state,
      zipCode: company.zipCode,
      phone: company.phone,
      defaultPayPeriod: company.defaultPayPeriod,
      overtimeMultiplier: company.overtimeMultiplier,
    };

    // Load PDF template
    const templatePath = path.join(process.cwd(), config.templatePath);
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill form based on type
    switch (formType.toLowerCase()) {
      case 'i-9':
        fillI9(form, empData, companyData);
        break;
      case 'w-4':
        fillW4(form, empData, companyData);
        break;
      case 'it-2104':
        fillIT2104(form, empData, companyData);
        break;
      case 'ls-54':
        fillLS54(form, empData, companyData);
        break;
    }

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    const fileName = `${empData.lastName}_${empData.firstName}_${config.label.replace(/\s+/g, '_')}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating form:', error);
    return NextResponse.json(
      { error: 'Failed to generate form' },
      { status: 500 }
    );
  }
}
