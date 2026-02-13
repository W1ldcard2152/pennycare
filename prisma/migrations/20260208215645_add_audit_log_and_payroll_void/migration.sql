/*
  Warnings:

  - You are about to drop the column `filingStatus` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `otherDeductions` on the `PayrollRecord` table. All the data in the column will be lost.
  - Added the required column `companyId` to the `Account` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Employee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `PayrollRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `TimeEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Vendor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN "expirationDate" DATETIME;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCompanyAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "legalBusinessName" TEXT,
    "fein" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "industryType" TEXT,
    "fiscalYearEnd" TEXT,
    "defaultPayPeriod" TEXT,
    "overtimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overtimeMultiplier" REAL NOT NULL DEFAULT 1.5,
    "stateUIClientId" TEXT,
    "stateTaxId" TEXT,
    "localTaxId" TEXT,
    "suiRate" REAL,
    "futaRate" REAL DEFAULT 0.6,
    "nycEmployer" BOOLEAN NOT NULL DEFAULT false,
    "nextEmployeeNumber" INTEGER NOT NULL DEFAULT 1,
    "workersCompPolicy" TEXT,
    "workersCompCarrier" TEXT,
    "bankName" TEXT,
    "bankRoutingNumberEncrypted" TEXT,
    "bankAccountNumberEncrypted" TEXT,
    "federalDepositSchedule" TEXT NOT NULL DEFAULT 'monthly',
    "reminderLeadDays" INTEGER NOT NULL DEFAULT 7,
    "defaultPTODays" INTEGER DEFAULT 0,
    "defaultSickDays" INTEGER DEFAULT 5,
    "ptoAccrualEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ptoAccrualHoursEarned" REAL DEFAULT 1,
    "ptoAccrualHoursWorked" REAL DEFAULT 40,
    "sickAccrualEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sickAccrualHoursEarned" REAL DEFAULT 1,
    "sickAccrualHoursWorked" REAL DEFAULT 30,
    "sickAnnualCapHours" REAL DEFAULT 40,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT,
    "documentTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeDeduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "deductionType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "preTax" BOOLEAN NOT NULL DEFAULT true,
    "annualLimit" REAL,
    "ytdAmount" REAL NOT NULL DEFAULT 0,
    "caseNumber" TEXT,
    "totalOwed" REAL,
    "remainingBalance" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TaxFiling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filedDate" DATETIME,
    "confirmationNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("code", "createdAt", "description", "id", "isActive", "name", "subtype", "type", "updatedAt") SELECT "code", "createdAt", "description", "id", "isActive", "name", "subtype", "type", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_companyId_idx" ON "Account"("companyId");
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "dateOfBirth" DATETIME,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "employeeNumber" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "department" TEXT,
    "hireDate" DATETIME NOT NULL,
    "terminationDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "payType" TEXT NOT NULL,
    "hourlyRate" REAL,
    "annualSalary" REAL,
    "taxIdEncrypted" TEXT,
    "w4FormType" TEXT,
    "w4FilingStatus" TEXT,
    "w4Allowances" INTEGER,
    "additionalWithholding" REAL,
    "additionalWithholdingPercentage" REAL,
    "overrideAmount" REAL,
    "overridePercentage" REAL,
    "federalTaxability" TEXT,
    "federalTaxesWithheld" BOOLEAN NOT NULL DEFAULT true,
    "federalResidency" TEXT,
    "socialSecurityTaxability" TEXT,
    "medicareTaxability" TEXT,
    "stateFilingStatus" TEXT,
    "stateResidency" TEXT,
    "stateAllowances" INTEGER,
    "stateTaxesWithheld" BOOLEAN NOT NULL DEFAULT true,
    "stateTaxability" TEXT,
    "unemploymentTaxability" TEXT,
    "worksiteCode" TEXT,
    "dependentHealthInsurance" BOOLEAN NOT NULL DEFAULT false,
    "disabilityTaxability" TEXT,
    "disabilityTaxesWithheld" BOOLEAN NOT NULL DEFAULT true,
    "paidFamilyLeaveTaxability" TEXT,
    "paidFamilyLeaveTaxesWithheld" BOOLEAN NOT NULL DEFAULT true,
    "nycResident" BOOLEAN NOT NULL DEFAULT false,
    "yonkersResident" BOOLEAN NOT NULL DEFAULT false,
    "yonkersNonResident" BOOLEAN NOT NULL DEFAULT false,
    "workersCompClassCode" TEXT,
    "payFrequency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("additionalWithholding", "address", "annualSalary", "city", "createdAt", "department", "email", "employeeNumber", "employmentType", "firstName", "hireDate", "hourlyRate", "id", "isActive", "lastName", "payType", "phone", "position", "state", "taxIdEncrypted", "terminationDate", "updatedAt", "w4Allowances", "zipCode") SELECT "additionalWithholding", "address", "annualSalary", "city", "createdAt", "department", "email", "employeeNumber", "employmentType", "firstName", "hireDate", "hourlyRate", "id", "isActive", "lastName", "payType", "phone", "position", "state", "taxIdEncrypted", "terminationDate", "updatedAt", "w4Allowances", "zipCode" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "vendorId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paymentMethod" TEXT,
    "referenceNumber" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" DATETIME,
    "notes" TEXT,
    "attachments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "attachments", "category", "createdAt", "date", "description", "id", "isPaid", "notes", "paidDate", "paymentMethod", "referenceNumber", "updatedAt", "vendorId") SELECT "amount", "attachments", "category", "createdAt", "date", "description", "id", "isPaid", "notes", "paidDate", "paymentMethod", "referenceNumber", "updatedAt", "vendorId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_companyId_date_idx" ON "Expense"("companyId", "date");
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");
CREATE TABLE "new_PayrollRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payPeriodStart" DATETIME NOT NULL,
    "payPeriodEnd" DATETIME NOT NULL,
    "payDate" DATETIME NOT NULL,
    "regularHours" REAL NOT NULL,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "regularPay" REAL NOT NULL,
    "overtimePay" REAL NOT NULL DEFAULT 0,
    "otherEarnings" REAL NOT NULL DEFAULT 0,
    "grossPay" REAL NOT NULL,
    "preTax401k" REAL NOT NULL DEFAULT 0,
    "preTaxHealthIns" REAL NOT NULL DEFAULT 0,
    "preTaxDental" REAL NOT NULL DEFAULT 0,
    "preTaxVision" REAL NOT NULL DEFAULT 0,
    "preTaxHSA" REAL NOT NULL DEFAULT 0,
    "preTaxFSA" REAL NOT NULL DEFAULT 0,
    "preTaxOther" REAL NOT NULL DEFAULT 0,
    "totalPreTaxDeductions" REAL NOT NULL DEFAULT 0,
    "taxableWages" REAL,
    "federalTax" REAL NOT NULL,
    "stateTax" REAL NOT NULL,
    "localTax" REAL NOT NULL DEFAULT 0,
    "socialSecurity" REAL NOT NULL,
    "medicare" REAL NOT NULL,
    "additionalMedicare" REAL NOT NULL DEFAULT 0,
    "nySDI" REAL NOT NULL DEFAULT 0,
    "nyPFL" REAL NOT NULL DEFAULT 0,
    "totalTaxWithholdings" REAL NOT NULL DEFAULT 0,
    "postTaxRoth401k" REAL NOT NULL DEFAULT 0,
    "garnishments" REAL NOT NULL DEFAULT 0,
    "childSupport" REAL NOT NULL DEFAULT 0,
    "loanRepayments" REAL NOT NULL DEFAULT 0,
    "postTaxOther" REAL NOT NULL DEFAULT 0,
    "totalPostTaxDeductions" REAL NOT NULL DEFAULT 0,
    "totalDeductions" REAL NOT NULL,
    "netPay" REAL NOT NULL,
    "employerSocialSecurity" REAL NOT NULL DEFAULT 0,
    "employerMedicare" REAL NOT NULL DEFAULT 0,
    "employerSUI" REAL NOT NULL DEFAULT 0,
    "employerFUTA" REAL NOT NULL DEFAULT 0,
    "employerWorkersComp" REAL NOT NULL DEFAULT 0,
    "employerHealthIns" REAL NOT NULL DEFAULT 0,
    "totalEmployerCost" REAL NOT NULL DEFAULT 0,
    "ytdGrossPay" REAL NOT NULL DEFAULT 0,
    "ytdFederalTax" REAL NOT NULL DEFAULT 0,
    "ytdStateTax" REAL NOT NULL DEFAULT 0,
    "ytdSocialSecurity" REAL NOT NULL DEFAULT 0,
    "ytdMedicare" REAL NOT NULL DEFAULT 0,
    "ytdNetPay" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" DATETIME,
    "paymentMethod" TEXT,
    "checkNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "voidedAt" DATETIME,
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "originalRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollRecord" ("createdAt", "employeeId", "federalTax", "grossPay", "id", "isPaid", "medicare", "netPay", "notes", "overtimeHours", "overtimePay", "paidDate", "payDate", "payPeriodEnd", "payPeriodStart", "regularHours", "regularPay", "socialSecurity", "stateTax", "totalDeductions", "updatedAt") SELECT "createdAt", "employeeId", "federalTax", "grossPay", "id", "isPaid", "medicare", "netPay", "notes", "overtimeHours", "overtimePay", "paidDate", "payDate", "payPeriodEnd", "payPeriodStart", "regularHours", "regularPay", "socialSecurity", "stateTax", "totalDeductions", "updatedAt" FROM "PayrollRecord";
DROP TABLE "PayrollRecord";
ALTER TABLE "new_PayrollRecord" RENAME TO "PayrollRecord";
CREATE INDEX "PayrollRecord_companyId_employeeId_payPeriodStart_idx" ON "PayrollRecord"("companyId", "employeeId", "payPeriodStart");
CREATE INDEX "PayrollRecord_employeeId_payPeriodStart_idx" ON "PayrollRecord"("employeeId", "payPeriodStart");
CREATE INDEX "PayrollRecord_payDate_idx" ON "PayrollRecord"("payDate");
CREATE INDEX "PayrollRecord_status_idx" ON "PayrollRecord"("status");
CREATE TABLE "new_TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "hoursWorked" REAL NOT NULL,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeEntry" ("createdAt", "date", "employeeId", "hoursWorked", "id", "notes", "overtimeHours", "updatedAt") SELECT "createdAt", "date", "employeeId", "hoursWorked", "id", "notes", "overtimeHours", "updatedAt" FROM "TimeEntry";
DROP TABLE "TimeEntry";
ALTER TABLE "new_TimeEntry" RENAME TO "TimeEntry";
CREATE INDEX "TimeEntry_companyId_employeeId_date_idx" ON "TimeEntry"("companyId", "employeeId", "date");
CREATE INDEX "TimeEntry_employeeId_date_idx" ON "TimeEntry"("employeeId", "date");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT,
    "tags" TEXT,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledDate" DATETIME,
    "notes" TEXT,
    "attachments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "attachments", "category", "createdAt", "creditAccountId", "date", "debitAccountId", "description", "id", "isReconciled", "notes", "reconciledDate", "referenceNumber", "tags", "updatedAt") SELECT "amount", "attachments", "category", "createdAt", "creditAccountId", "date", "debitAccountId", "description", "id", "isReconciled", "notes", "reconciledDate", "referenceNumber", "tags", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_companyId_date_idx" ON "Transaction"("companyId", "date");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_debitAccountId_idx" ON "Transaction"("debitAccountId");
CREATE INDEX "Transaction_creditAccountId_idx" ON "Transaction"("creditAccountId");
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "taxId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("address", "city", "createdAt", "email", "id", "isActive", "name", "notes", "phone", "state", "taxId", "updatedAt", "zipCode") SELECT "address", "city", "createdAt", "email", "id", "isActive", "name", "notes", "phone", "state", "taxId", "updatedAt", "zipCode" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserCompanyAccess_userId_idx" ON "UserCompanyAccess"("userId");

-- CreateIndex
CREATE INDEX "UserCompanyAccess_companyId_idx" ON "UserCompanyAccess"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompanyAccess_userId_companyId_key" ON "UserCompanyAccess"("userId", "companyId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_companyId_idx" ON "DocumentTemplate"("companyId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_documentTypeId_idx" ON "DocumentTemplate"("documentTypeId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_category_idx" ON "DocumentTemplate"("category");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_employeeId_idx" ON "EmployeeDeduction"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDeduction_deductionType_idx" ON "EmployeeDeduction"("deductionType");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "TaxFiling_companyId_idx" ON "TaxFiling"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFiling_companyId_formType_year_quarter_key" ON "TaxFiling"("companyId", "formType", "year", "quarter");
