import { apiClient } from './client';

// Matches ChamaLink.Application.DTOs.LoanResponseDto exactly — the same
// shape reports.ts already uses for its LoanResponse interface, kept here
// as the canonical source for the Loan Management page (MkobaPage > Mikopo
// tab). The Reports page re-exports this from reports.ts for read-only
// display; this file owns the write operations (issue / repay / default).
export interface LoanResponse {
  id: string;
  groupId: string;
  groupMemberId: string;
  userId: string;
  memberName: string | null;
  principalAmount: number;
  interestRate: number;
  interestAmount: number;
  totalPayable: number;
  amountRepaid: number;
  outstandingBalance: number;
  purpose: string | null;
  disbursedAt: string;
  dueDate: string;
  repaidAt: string | null;
  status: string;
  isOverdue: boolean;
}

// Matches ChamaLink.Application.DTOs.IssueLoanDto. All the actor identity
// (IssuedByGroupMemberId) is derived server-side from the JWT — the client
// never sends "who is issuing this", only "who is this loan for".
export interface IssueLoanPayload {
  groupMemberId: string;
  principalAmount: number;
  interestRateOverride?: number | null;
  dueDate?: string | null;
  purpose?: string | null;
}

// Matches ChamaLink.Application.DTOs.RecordLoanRepaymentDto.
export interface RepayLoanPayload {
  amount: number;
  referenceNo?: string | null;
}

// ── LoanController endpoints ──────────────────────────────────────────
// POST   /api/Loan/group/{groupId}        — issue a new loan (leader only)
// POST   /api/Loan/{id}/repay            — record a repayment (leader only)
// POST   /api/Loan/{id}/mark-defaulted   — mark as defaulted (leader only)
// GET    /api/Loan/group/{groupId}        — list all group loans
// GET    /api/Loan/member/{groupMemberId} — list one member's loans

export async function issueLoan(
  groupId: string,
  payload: IssueLoanPayload
): Promise<LoanResponse> {
  const response = await apiClient.post<LoanResponse>(
    `/Loan/group/${groupId}`,
    payload
  );
  return response.data;
}

export async function recordLoanRepayment(
  loanId: string,
  payload: RepayLoanPayload
): Promise<LoanResponse> {
  const response = await apiClient.post<LoanResponse>(
    `/Loan/${loanId}/repay`,
    payload
  );
  return response.data;
}

export async function markLoanDefaulted(loanId: string): Promise<LoanResponse> {
  const response = await apiClient.post<LoanResponse>(
    `/Loan/${loanId}/mark-defaulted`
  );
  return response.data;
}

export async function getGroupLoans(groupId: string): Promise<LoanResponse[]> {
  const response = await apiClient.get<LoanResponse[]>(
    `/Loan/group/${groupId}`
  );
  return response.data;
}

export async function getMemberLoans(
  groupMemberId: string
): Promise<LoanResponse[]> {
  const response = await apiClient.get<LoanResponse[]>(
    `/Loan/member/${groupMemberId}`
  );
  return response.data;
}
