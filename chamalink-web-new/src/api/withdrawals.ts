import { apiClient } from './client';

// Matches ChamaLink.Application.DTOs.WithdrawalResponseDto exactly — the
// same shape reports.ts already uses for its WithdrawalResponse interface.
// This file owns the write operations (create / decide / mark-paid) that
// the Reports page doesn't need (it only reads).
export interface WithdrawalResponse {
  id: string;
  groupId: string;
  amount: number;
  purpose: string;
  beneficiaryName: string;
  beneficiaryGroupMemberId: string | null;
  groupEventId: string | null;
  status: string;
  approvedByGroupMemberId: string | null;
  recordedByGroupMemberId: string;
  referenceNo: string | null;
  notes: string | null;
  rejectionReason: string | null;
  date: string;
  decisionAt: string | null;
  requiredApprovals: number;
  approvalsReceived: number;
  allowedApproverRoles: string[];
  decisions: WithdrawalApproval[];
}

export interface WithdrawalApproval {
  groupMemberId: string;
  role: string;
  approved: boolean;
  reason: string | null;
  decidedAt: string;
}

// Matches ChamaLink.Application.DTOs.CreateWithdrawalDto. GroupId,
// RecordedByGroupMemberId etc. are resolved server-side from the JWT —
// the client sends only the withdrawal's own details.
export interface CreateWithdrawalPayload {
  groupId: string;
  amount: number;
  purpose: string;
  beneficiaryName: string;
  referenceNo?: string | null;
  notes?: string | null;
  beneficiaryGroupMemberId?: string | null;
  groupEventId?: string | null;
}

// Matches ChamaLink.Application.DTOs.DecideWithdrawalDto.
export interface DecideWithdrawalPayload {
  approve: boolean;
  reason?: string | null;
}

// Matches ChamaLink.Application.DTOs.WithdrawalApprovalRuleDto.
export interface WithdrawalApprovalRule {
  allowedRoles: string[];
  requiredApprovals: number;
}

// ── WithdrawalController endpoints ────────────────────────────────────
// POST  /api/Withdrawal                          — create withdrawal request
// GET   /api/Withdrawal/group/{groupId}           — list group withdrawals
// GET   /api/Withdrawal/group/{groupId}/approval-rule — get governance rule
// POST  /api/Withdrawal/{id}/decide              — approve or reject
// POST  /api/Withdrawal/{id}/mark-paid            — mark as paid out

export async function createWithdrawal(
  payload: CreateWithdrawalPayload
): Promise<WithdrawalResponse> {
  const response = await apiClient.post<WithdrawalResponse>(
    '/Withdrawal',
    payload
  );
  return response.data;
}

export async function getWithdrawals(
  groupId: string
): Promise<WithdrawalResponse[]> {
  const response = await apiClient.get<WithdrawalResponse[]>(
    `/Withdrawal/group/${groupId}`
  );
  return response.data;
}

export async function getWithdrawalApprovalRule(
  groupId: string
): Promise<WithdrawalApprovalRule> {
  const response = await apiClient.get<WithdrawalApprovalRule>(
    `/Withdrawal/group/${groupId}/approval-rule`
  );
  return response.data;
}

export async function decideWithdrawal(
  withdrawalId: string,
  payload: DecideWithdrawalPayload
): Promise<WithdrawalResponse> {
  const response = await apiClient.post<WithdrawalResponse>(
    `/Withdrawal/${withdrawalId}/decide`,
    payload
  );
  return response.data;
}

export async function markWithdrawalPaid(
  withdrawalId: string
): Promise<WithdrawalResponse> {
  const response = await apiClient.post<WithdrawalResponse>(
    `/Withdrawal/${withdrawalId}/mark-paid`
  );
  return response.data;
}
