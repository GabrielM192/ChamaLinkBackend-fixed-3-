import { apiClient } from './client';

// Matches ChamaLink.Application.DTOs.LoanResponseDto exactly.
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

// Matches ChamaLink.Application.DTOs.MemberEventContributionDto exactly.
export interface MemberEventContribution {
  groupEventId: string;
  eventTitle: string;
  expectedAmount: number;
  paidAmount: number;
  status: string;
}

// Fact-based label, not a High/Medium/Low judgement call - see
// AnalyticsService.ComputeLoanRiskCategory on the backend. This only
// ever answers "has this member currently, or ever, had a late loan" -
// nothing about how much money or how many times.
export type LoanRiskCategory = 'GoodStanding' | 'PreviousDelinquency' | 'CurrentOverdue';

// Quick-glance grade - see AnalyticsService.ComputeFinancialScore.
export type FinancialScoreGrade = 'A' | 'B' | 'C' | 'D';

// Matches ChamaLink.Application.DTOs.MemberFinancialProfileDto exactly,
// field for field, in the same order as the backend C# record - this
// is the member's "financial passport". Keep this in sync whenever the
// backend DTO changes; a mismatch here is a silent wrong number on
// screen, not a compile error (this crosses a JSON boundary, not a
// shared type).
export interface MemberFinancialProfile {
  userId: string;
  groupMemberId: string;
  memberName: string;
  phoneNumber: string;
  groupId: string;
  groupName: string;
  role: string;
  status: string;
  joinedAt: string;

  totalContributions: number;
  expectedContributions: number;
  contributionCompliancePercent: number;

  outstandingDebt: number;
  overdueDebt: number;
  totalDebtCleared: number;

  totalFinesIssued: number;
  finesPaid: number;
  outstandingFines: number;

  welfareContributions: number;

  activeLoansOutstanding: number;
  activeLoansCount: number;
  loans: LoanResponse[];

  totalBorrowed: number;
  totalRepaid: number;
  overdueLoansCount: number;

  events: MemberEventContribution[];

  benefitsReceived: number;

  approvalsParticipated: number;

  financialScore: FinancialScoreGrade;
  loanRiskCategory: LoanRiskCategory;
}

export async function getMemberFinancialProfile(
  groupId: string,
  userId: string
): Promise<MemberFinancialProfile> {
  const response = await apiClient.get<MemberFinancialProfile>(
    `/Reports/member-profile/${groupId}/${userId}`
  );
  return response.data;
}

// ---------------------------------------------------------------------
// Reports Engine (leadership screen) - group-wide numbers rather than
// one member's own profile. Every type below matches its backend DTO
// in ChamaLink.Application.DTOs.AnalyticsDtos / MemberProfileDtos
// field-for-field - see the note on MemberFinancialProfile above for
// why that discipline matters.
// ---------------------------------------------------------------------

// Matches ChamaLink.Application.DTOs.GroupFinancialSummaryDto exactly.
// The single "open the app, see everything" snapshot - everything else
// on this screen is one of these numbers broken out into more detail.
export interface GroupFinancialSummary {
  groupId: string;
  groupName: string;
  totalMembers: number;
  activeMembers: number;
  cashAvailable: number;
  outstandingLoans: number;
  outstandingFines: number;
  outstandingDebts: number;
  totalAssets: number;
  collectionRatePercent: number;
  openEventsCount: number;
  pendingWithdrawalsCount: number;
}

// Matches ChamaLink.Application.DTOs.CollectionRateDto exactly. Always
// the calendar month containing `period` - GroupFinancialSummary's
// collectionRatePercent is this same figure, just without the
// Expected/Collected breakdown behind it.
export interface CollectionRate {
  groupId: string;
  period: string;
  expectedAmount: number;
  collectedAmount: number;
  collectionRatePercent: number;
}

// Matches ChamaLink.Application.DTOs.DefaulterDto exactly. The backend
// only includes a member here if they actually owe something right
// now (outstanding debt or fine > 0) - an empty array is good news,
// not a loading/error state.
export interface Defaulter {
  userId: string;
  memberName: string;
  phoneNumber: string;
  outstandingDebt: number;
  outstandingFine: number;
  lastContributionDate: string | null;
  daysLate: number;
}

// Matches ChamaLink.Application.DTOs.GroupBalanceDto exactly. The A4 fix
// added TotalWalletWithdrawals — money that physically left the group's
// mobile wallet per imported M-Koba statements but hasn't been promoted
// into a formal Withdrawal record. These reduce Cash Available.
export interface GroupBalance {
  groupId: string;
  totalContributions: number;
  cashAvailable: number;
  outstandingLoans: number;
  outstandingFines: number;
  outstandingDebts: number;
  totalWelfareHeld: number;
  totalWithdrawalsPaid: number;
  totalWalletWithdrawals: number;
  totalAssets: number;
}

// Matches ChamaLink.Application.DTOs.MemberReportRowDto exactly.
export interface MemberReportRow {
  userId: string;
  memberName: string;
  status: string;
  savingsBalance: number;
  outstandingDebt: number;
  outstandingFine: number;
  outstandingLoan: number;
}

export async function getGroupFinancialSummary(groupId: string): Promise<GroupFinancialSummary> {
  const response = await apiClient.get<GroupFinancialSummary>(
    `/Reports/group-financial-summary/${groupId}`
  );
  return response.data;
}

export async function getCollectionRate(groupId: string): Promise<CollectionRate> {
  const response = await apiClient.get<CollectionRate>(`/Reports/collection-rate/${groupId}`);
  return response.data;
}

export async function getDefaulters(groupId: string): Promise<Defaulter[]> {
  const response = await apiClient.get<Defaulter[]>(`/Reports/defaulters/${groupId}`);
  return response.data;
}

export async function getGroupBalance(groupId: string): Promise<GroupBalance> {
  const response = await apiClient.get<GroupBalance>(`/Reports/group-balance/${groupId}`);
  return response.data;
}

export async function getMembersReport(groupId: string): Promise<MemberReportRow[]> {
  const response = await apiClient.get<MemberReportRow[]>(`/Reports/members/${groupId}`);
  return response.data;
}

// ---------------------------------------------------------------------
// Reports Engine — 9 new endpoints that complete the leader's reporting
// toolkit. Every type below matches its backend DTO or entity shape
// field-for-field. See the notes on MemberFinancialProfile above for
// why that discipline matters (JSON boundary, not a shared type).
// ---------------------------------------------------------------------

// Matches ChamaLink.Application.DTOs.LoanPortfolioDto exactly.
export interface LoanPortfolio {
  groupId: string;
  totalIssued: number;
  totalRecovered: number;
  totalOutstanding: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  repaidLoansCount: number;
  defaultedLoansCount: number;
  overdueAmount: number;
  defaultedAmount: number;
}

// Matches ChamaLink.Domain.Entities.Fine — FineService.GetFinesForGroupAsync
// returns the raw entity without .Include(m => m.User), so memberName is
// NOT on the object. The Reports page cross-references userId → name from
// the Members report to fill the gap. Enums (reasonType, status) are
// serialized as integers by default (no JsonStringEnumConverter).
export interface Fine {
  id: string;
  groupId: string;
  groupMemberId: string;
  userId: string;
  amount: number;
  amountPaid: number;
  reasonType: number;
  reason: string;
  groupEventId: string | null;
  period: string | null;
  status: number;
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
}

// Matches ChamaLink.Domain.Entities.Debt — DebtService.GetDebtsForGroupAsync
// returns the raw entity, same memberName caveat as Fine above.
export interface Debt {
  id: string;
  groupId: string;
  groupMemberId: string;
  userId: string;
  amount: number;
  amountCleared: number;
  reason: string;
  period: string;
  status: number;
  createdAt: string;
  clearedAt: string | null;
}

// Matches the anonymous object shape returned by
// ReportsController.GetEventReport — each event with its aggregate stats.
export interface EventReport {
  id: string;
  title: string;
  description: string | null;
  beneficiaryName: string;
  targetAmountPerMember: number;
  amountDeducted: number;
  eventDate: string;
  deadlineDate: string | null;
  isActive: boolean;
  isResolved: boolean;
  totalExpected: number;
  totalCollected: number;
  paidCount: number;
  pendingCount: number;
}

// Matches ChamaLink.Application.DTOs.WithdrawalResponseDto exactly.
export interface WithdrawalApproval {
  groupMemberId: string;
  role: string;
  approved: boolean;
  reason: string | null;
  decidedAt: string;
}

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

// Matches the anonymous object returned by ReportsController.GetMemberRegistry.
// `id` is the GroupMember.Id (not the UserId) — needed by the Loan issue form
// (IssueLoanDto.GroupMemberId expects this, not the UserId).
export interface MemberRegistryRow {
  id: string;
  userId: string;
  name: string;
  phone: string;
  memberNumber: string;
  role: string;
  status: string;
  joinedAt: string;
  totalContributionsCount: number;
}

// Matches ChamaLink.Application.DTOs.MemberStatusDto exactly.
export interface MemberStatusRow {
  userId: string;
  memberName: string;
  phoneNumber: string;
  monthlyContributionTarget: number;
  totalMonthlyPaidThisMonth: number;
  hasPaidCurrentMonth: boolean;
  pendingFineAmount: number;
  advanceBalance: number;
}

// Matches ChamaLink.Domain.DTOs.WhatsAppReportDto exactly.
export interface WhatsAppSummary {
  groupId: string;
  groupName: string;
  generatedAt: string;
  formattedMessage: string;
}

export async function getLoanPortfolio(groupId: string): Promise<LoanPortfolio> {
  const response = await apiClient.get<LoanPortfolio>(`/Reports/loan-portfolio/${groupId}`);
  return response.data;
}

export async function getFines(groupId: string): Promise<Fine[]> {
  const response = await apiClient.get<Fine[]>(`/Reports/fines/${groupId}`);
  return response.data;
}

export async function getDebts(groupId: string): Promise<Debt[]> {
  const response = await apiClient.get<Debt[]>(`/Reports/debts/${groupId}`);
  return response.data;
}

export async function getEvents(groupId: string): Promise<EventReport[]> {
  const response = await apiClient.get<EventReport[]>(`/Reports/events/${groupId}`);
  return response.data;
}

export async function getWithdrawals(groupId: string): Promise<WithdrawalResponse[]> {
  const response = await apiClient.get<WithdrawalResponse[]>(`/Reports/withdrawals/${groupId}`);
  return response.data;
}

export async function getMemberRegistry(groupId: string): Promise<MemberRegistryRow[]> {
  const response = await apiClient.get<MemberRegistryRow[]>(`/Reports/member-registry/${groupId}`);
  return response.data;
}

export async function getGroupMembersSummary(groupId: string): Promise<MemberStatusRow[]> {
  const response = await apiClient.get<MemberStatusRow[]>(`/Reports/group-members-summary/${groupId}`);
  return response.data;
}

export async function getWhatsAppSummary(groupId: string): Promise<WhatsAppSummary> {
  const response = await apiClient.get<WhatsAppSummary>(`/Reports/whatsapp-summary/${groupId}`);
  return response.data;
}

// ---------------------------------------------------------------------
// Ukonga Rules Specification v1.2, sehemu 5/6/7/8 (Phase 5). Reads ONLY
// from ComplianceSnapshots (Phase 4), which the daily
// ContributionComplianceBackgroundService writes - not a live recompute.
// This is deliberately separate from Defaulter/MemberStatusRow above:
// those are real-time ("what does the ledger say right now"), these are
// the compliance ENGINE's own history (TotalMissedMonths vs
// ConsecutiveMissedMonths, month-by-month trend) - complementary views,
// not a replacement for each other.
// ---------------------------------------------------------------------

// Matches ChamaLink.Application.DTOs.ComplianceSummaryRowDto exactly.
export interface ComplianceSummaryRow {
  groupMemberId: string;
  userId: string;
  memberName: string;
  phoneNumber: string;
  snapshotMonth: string;
  totalMissedMonths: number;
  consecutiveMissedMonths: number;
  outstandingFineAmount: number;
  outstandingContributionDebt: number;
  status: string;
}

// Matches ChamaLink.Application.DTOs.ComplianceTrendPointDto exactly.
export interface ComplianceTrendPoint {
  month: string;
  expectedContribution: number;
  paidContribution: number;
  fineIssuedAmount: number;
  finePaidAmount: number;
  outstandingFineAmount: number;
  totalMissedMonths: number;
  consecutiveMissedMonths: number;
  outstandingContributionDebt: number;
  status: string;
}

// Matches ChamaLink.Application.DTOs.ComplianceTrendDto exactly.
export interface ComplianceTrend {
  groupMemberId: string;
  memberName: string;
  trend: ComplianceTrendPoint[];
}

export async function getComplianceSummary(groupId: string): Promise<ComplianceSummaryRow[]> {
  const response = await apiClient.get<ComplianceSummaryRow[]>(
    `/Reports/compliance-summary/${groupId}`
  );
  return response.data;
}

export async function getComplianceTrend(
  groupId: string,
  groupMemberId: string
): Promise<ComplianceTrend> {
  const response = await apiClient.get<ComplianceTrend>(
    `/Reports/compliance-trend/${groupId}/${groupMemberId}`
  );
  return response.data;
}
