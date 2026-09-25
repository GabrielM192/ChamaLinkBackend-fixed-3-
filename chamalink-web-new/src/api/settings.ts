import { apiClient } from './client';

// Matches ChamaLink.Application.DTOs.GroupSettingsResponseDto exactly.
// This is the full group configuration — contribution rules, loan policy,
// financial floors, welfare mode, and withdrawal governance. Returned by
// GET /Group/{groupId}/settings (any member can read; a member should be
// able to see their own group's rules).
export interface GroupSettings {
  groupId: string;
  monthlyContribution: number;
  lateFine: number;
  loanInterestRate: number;
  dueDateDay: number;
  gracePeriodDays: number;
  joiningFee: number;
  minimumReserveBalance: number;
  withdrawalApprovalMode: string;
  customApprovalRoles: string | null;
  customRequiredApprovals: number | null;
  minimumShortfallForFine: number;
  welfareMode: string;
  // Ukonga Rules Specification v1.2, sehemu 3/4b (ARCH-001) - these
  // existed on the backend since Phase 1 but were never returned by this
  // endpoint until now.
  maxConsecutiveMissedMonths: number;
  debtAllocationStrategy: string;
}

// Matches ChamaLink.Application.DTOs.UpdateGroupSettingsDto. Every field is
// optional so a caller sends only what changed (e.g. just MonthlyContribution).
export interface UpdateGroupSettingsDto {
  monthlyContribution?: number;
  lateFine?: number;
  loanInterestRate?: number;
  dueDateDay?: number;
  gracePeriodDays?: number;
  joiningFee?: number;
  minimumReserveBalance?: number;
  withdrawalApprovalMode?: string;
  customApprovalRoles?: string | null;
  customRequiredApprovals?: number | null;
  minimumShortfallForFine?: number;
  welfareMode?: string;
  maxConsecutiveMissedMonths?: number;
  // 'CurrentMonthFirst' | 'OldestDebtFirst' | 'ManualAllocation' - see
  // DEBT_ALLOCATION_STRATEGY_OPTIONS in SettingsPage.tsx.
  debtAllocationStrategy?: string;
}

export async function getGroupSettings(groupId: string): Promise<GroupSettings> {
  const response = await apiClient.get<GroupSettings>(`/Group/${groupId}/settings`);
  return response.data;
}

export async function updateGroupSettings(
  groupId: string,
  dto: UpdateGroupSettingsDto
): Promise<GroupSettings> {
  const response = await apiClient.put<GroupSettings>(`/Group/${groupId}/settings`, dto);
  return response.data;
}
