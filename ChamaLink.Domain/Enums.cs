namespace ChamaLink.Domain;

// Defines types of financial accounts a member can hold
public enum AccountType
{
    Savings = 1,
    Loan = 2,
    Fine = 3,
    SocialFund = 4
}

// Transaction classification for the ledger
public enum TransactionType
{
    Contribution = 1,       // Mchango wa kawaida
    LoanDisbursement = 2,   // Kutoa mkopo
    LoanRepayment = 3,      // Rejesho la mkopo
    FineIssue = 4,          // Kutoza faini
    FinePayment = 5,        // Kulipia faini
    ShareOut = 6,           // Gawio la mwisho wa mwaka
    WelfareDeduction = 7,   // Makato ya tukio (msiba/sherehe) kutoka Mfuko wa Ustawi
    WelfareTopUp = 8,       // Kujaza tena salio la Mfuko wa Ustawi
    EventContribution = 9,  // Mchango wa tukio maalum (Msiba/Sherehe)

    // NEW: was previously untracked entirely - FinancialSettings.JoiningFee
    // existed as a target amount but nothing recorded how much of it any
    // given member had actually paid (audit item: "unenforced JoiningFee").
    // See MkobaImportController's new JoiningFee allocation step.
    JoiningFee = 10
}

// User role within a specific group.
// v1 leadership structure (per ChamaLink product scope): Chairperson,
// Secretary, Treasurer, Member Representative are the four leadership
// roles; everyone else is a plain Member.
public enum GroupRole
{
    Chairperson = 1,
    Treasurer = 2,
    Secretary = 3,
    Member = 4,
    MemberRepresentative = 5
}

// NEW (per-group configurable welfare semantics): a WelfareDeduction
// ledger entry gets created for every member when an event triggers
// (see EventService.TriggerEventAsync). Different groups mean different
// things by that entry, so it is no longer hardcoded one way for
// everyone:
//   DeductBalance  - the amount comes OUT of the member's own welfare
//                     balance (it was already sitting there from past
//                     top-ups, and is now earmarked/spent on the
//                     event). Matches GroupSettings.MinimumReserveBalance,
//                     which only makes sense if a deduction can push a
//                     balance down toward a floor.
//   ContributePot  - the amount is an additional mandatory contribution
//                     that ADDS to the member's welfare balance, the
//                     same direction as a WelfareTopUp.
// DeductBalance is the default because it is what MinimumReserveBalance
// and the original WelfareDeduction naming already assumed before this
// became configurable.
public enum WelfareMode
{
    DeductBalance = 1,
    ContributePot = 2
}

// NEW: what a Debt is for. MissedContribution is generated automatically
// by ContributionComplianceBackgroundService when a member's monthly
// contribution goes unpaid past the grace period. JoiningFee/Other are
// available for manually recorded debts (e.g. a one-time joining fee not
// yet paid).
public enum DebtType
{
    MissedContribution = 1,
    JoiningFee = 2,
    Other = 3
}

// Hali ya Fine (faini) moja moja - hutumika na Fine entity.
public enum FineStatus
{
    Pending = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Waived = 4
}

// NEW (Phase A: GroupSettings Owned Types Refactor - LoanSettings): how
// loan interest is calculated. Field only for now - LoanService still
// computes Flat interest exclusively (see IssueLoanAsync). Reducing is a
// placeholder value that intentionally does nothing different yet; wiring
// it up to actually change the interest calculation is Phase B work, once
// LoanService is touched deliberately rather than as a side effect of
// this settings refactor.
public enum LoanInterestType
{
    Flat = 1,
    Reducing = 2
}

// Chanzo cha Fine - kinatusaidia kutofautisha faini ya kuchelewa mchango
// wa mwezi dhidi ya faini ya salio la Welfare kushuka chini ya kiwango.
public enum FineReasonType
{
    LateMonthlyContribution = 1,
    WelfareBalanceBelowMinimum = 2,
    Other = 3,

    // NEW (Loan Engine V2, item 3/3: LatePenaltyAmount wiring) - issued
    // once per loan by LoanPenaltyBackgroundService when a loan passes
    // its DueDate without being fully repaid. Kept separate from
    // LateMonthlyContribution so a Fine's origin (missed savings
    // contribution vs. overdue loan) is never ambiguous in reports.
    LoanOverdue = 4
}

// Hali ya Debt (deni la mchango uliokosekana) - hutumika na Debt entity.
public enum DebtStatus
{
    Outstanding = 1,
    Cleared = 2,
    Waived = 3
}

// ARCH-001 (Ukonga Rules Specification v1.2, sehemu 4b): malipo mapya
// yanafunga deni gani wakati mwanachama ana madeni ya miezi ya nyuma? Hili
// ni uamuzi wa sheria za kikundi, si la kiufundi - engine haipaswi
// kulibahatisha. Kila GroupSettings.Contribution ina thamani yake.
public enum DebtAllocationStrategy
{
    // Malipo mapya yanahesabiwa kama mchango wa MWEZI WA SASA kwanza.
    // Madeni ya zamani (OutstandingContributionDebt) yanabaki bila
    // kuguswa mpaka mtu alipe ziada mahususi kwa ajili yake. Hii ndiyo
    // Ukonga v1.2 inayotumia.
    CurrentMonthFirst = 1,

    // Malipo mapya yanafunga deni la zamani zaidi kwanza (mf. January
    // kabla ya February), kisha ziada (kama ipo) inahesabiwa kama
    // mchango wa mwezi wa sasa.
    OldestDebtFirst = 2,

    // Mtunza Hazina/Treasurer anachagua mwenyewe malipo yanafunga
    // mwezi/deni gani wakati wa kurekodi - hakuna auto-allocation.
    ManualAllocation = 3
}

// Mtiririko wa uidhinishaji wa Withdrawal (fedha kutoka kwenye kikundi).
public enum WithdrawalStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Paid = 4,

    // NEW: some approval modes need more than one leader to approve
    // (e.g. TreasurerAndChairperson). This status means at least one
    // required approval has been given, but not yet enough to reach the
    // mode's RequiredApprovals count.
    PartiallyApproved = 5
}

// NEW (Withdrawal Governance gap): who is allowed to approve a
// Withdrawal is a decision each group makes for itself via its own
// katiba/taratibu - it must never be hardcoded in the backend. This is
// stored per-group on GroupSettings.WithdrawalApprovalMode.
public enum ApprovalMode
{
    TreasurerOnly = 1,
    ChairpersonOnly = 2,
    TreasurerAndChairperson = 3,
    TreasurerAndSecretary = 4,

    // Any combination of roles + a required-approvals count, read from
    // GroupSettings.CustomApprovalRoles / CustomRequiredApprovals.
    CustomApproval = 5
}

// Hali ya mchango wa mwanachama kwa GroupEvent moja (Msiba/Sherehe).
public enum EventContributionStatus
{
    Pending = 1,
    PartiallyPaid = 2,
    Paid = 3
}

// Status ya mwanachama ndani ya kikundi.
// New/Active/Warning/EligibleForExpulsion are the original governance
// states (still used by the fine/violation flow). Inactive/Suspended/
// Exited were added for ChamaLink v1's member lifecycle spec.
public enum MemberStatus
{
    New = 1,
    Active = 2,
    Warning = 3,
    EligibleForExpulsion = 4,
    Inactive = 5,
    Suspended = 6,
    Exited = 7
}

// NEW (Notification Layer gap): what a Notification is about. Kept as a
// single flat list rather than one type per triggering service, since a
// client mostly just needs to know which icon/category to show.
public enum NotificationType
{
    ContributionDue = 1,
    FineIssued = 2,
    EventCreated = 3,
    MemberOverdue = 4,
    WithdrawalPendingApproval = 5,
    WithdrawalDecided = 6,
    LoanIssued = 7,
    General = 8
}

// NOTE: LoanStatus lives in ChamaLink.Domain.Entities (see Loan.cs),
// alongside the Loan entity it belongs to - not here with the other
// enums - since IsOverdue/TotalPayable/OutstandingBalance on Loan are
// computed from it and keeping them in the same file avoids drift.