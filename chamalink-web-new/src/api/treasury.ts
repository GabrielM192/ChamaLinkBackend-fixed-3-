import { apiClient } from './client';

// ── types — must stay in lock-step with backend
//    ChamaLink.Application/DTOs/TreasuryImportDtos.cs
//    These are the EXACT JSON property names the API returns/accepts.
//    Do not "improve" these to camelCase — ASP.NET Core serializes
//    PascalCase properties as-is by default.

// ── parser output (one row from the Excel) ───────────────────────────
export interface TreasuryExcelRowDto {
  excelName: string;
  phone: string | null;
  monthlyAmounts: (number | null)[]; // length 12
  joiningFee: number | null;
  msiba: number | null;
  sherehe: number | null;
  isNonActive: boolean;
  nonActiveFromMonth: number; // 0 = N/A (parser only sets it when isNonActive)
  rowNumber: number;
}

// ── a name-match candidate for an unmatched/fuzzy row ────────────────
export interface TreasuryMatchCandidateDto {
  memberId: string;
  memberName: string;
  confidence: number; // 0..100
}

// ── one cell's planned split into Contribution / Fine / Savings ──────
export interface TreasuryPlannedSplitDto {
  month: number;        // 1..12
  monthName: string;    // "JAN", "FEB", ...
  totalAmount: number | null; // raw cell; null = '*' or blank (unpaid)
  contribution: number;
  fine: number;
  savings: number;
  splitNote: string;    // e.g. "fine (alichelewa)", "akiba"
}

// ── one preview row: what the importer WOULD post if committed ───────
export interface TreasuryImportPreviewRowDto {
  rowNumber: number;
  excelName: string;

  matchedMemberId: string | null;
  matchedMemberName: string | null;
  matchConfidence: number; // 0..100; 100 = exact
  isExactMatch: boolean;
  candidates: TreasuryMatchCandidateDto[];

  monthlyAmounts: (number | null)[];
  joiningFee: number | null;
  msiba: number | null;
  sherehe: number | null;
  isNonActive: boolean;
  // NOTE: backend's preview row intentionally does NOT carry
  // nonActiveFromMonth (that info is on the parser row only).
  // We display "(Non-Active)" when isNonActive is true, without a month.

  plannedSplits: TreasuryPlannedSplitDto[];
  warnings: string[];
}

// ── the full preview response ─────────────────────────────────────────
export interface TreasuryImportPreviewDto {
  groupId: string;
  detectedYear: number | null; // backend rarely fills this
  rows: TreasuryImportPreviewRowDto[];
  warnings: string[];

  totalRows: number;
  exactMatchedRows: number;
  fuzzyMatchedRows: number;
  unmatchedRows: number;
}

// ── the commit result ─────────────────────────────────────────────────
export interface TreasuryImportResultDto {
  totalRows: number;
  contributionsPosted: number;
  joiningFeesPosted: number;
  finesPosted: number;                  // un-bundled late fines
  savingsPosted: number;                // excess-to-akiba entries
  entriesSkippedDuplicate: number;
  membersMarkedInactive: number;
  unmatchedRowsSkipped: number;

  totalContributionsAmount: number;
  totalJoiningFeesAmount: number;
  totalFinesAmount: number;
  totalSavingsAmount: number;

  msibaShereheDeferred: string[];       // member names whose welfare
                                        // payouts were NOT posted
  skippedUnmatched: string[];
  warnings: string[];
}

// ── calls ────────────────────────────────────────────────────────────

// Backend action signature:
//   POST /api/TreasuryImport/preview/{groupId}  (multipart, file only)
export async function previewTreasuryExcel(
  groupId: string,
  file: File
): Promise<TreasuryImportPreviewDto> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<TreasuryImportPreviewDto>(
    `/TreasuryImport/preview/${groupId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

// Backend action signature:
//   POST /api/TreasuryImport/commit/{groupId}
//   multipart fields: file, year, memberOverridesJson (optional)
export async function commitTreasuryExcel(
  groupId: string,
  file: File,
  year: number,
  memberOverrides: Record<string, string> // excelName -> memberId
): Promise<TreasuryImportResultDto> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));

  // Only send overrides for rows the treasurer actually mapped.
  const filtered: Record<string, string> = {};
  for (const [name, id] of Object.entries(memberOverrides)) {
    if (id) filtered[name] = id;
  }
  if (Object.keys(filtered).length > 0) {
    formData.append('memberOverridesJson', JSON.stringify(filtered));
  }

  const response = await apiClient.post<TreasuryImportResultDto>(
    `/TreasuryImport/commit/${groupId}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}