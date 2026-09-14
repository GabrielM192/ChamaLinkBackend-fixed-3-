namespace ChamaLink.Domain.Entities;

// ============================================================================
// Phase A: GroupSettings Owned Types Refactor.
//
// These five classes are the new *authoritative* storage for group
// configuration (see GroupSettings.cs). They replace one flat bag of
// ~15 unrelated properties with modules grouped by the part of the
// business they actually govern, so (per the design discussion that
// produced this spec) LoanService never has to know about EventSettings,
// EventService never has to know about LoanSettings, etc.
//
// Each is mapped as an EF Core owned type (OwnsOne) directly on the
// GroupSettings table - see ApplicationDbContext.OnModelCreating - so
// there is still exactly one GroupSettings row per group, just with its
// columns now grouped under C# objects instead of being flat.
// ============================================================================

// General financial policy - not specific to any one group type. Kept
// deliberately small: this is the home for cross-cutting money rules
// that could apply to Monthly Contribution, Event-Based, or Hybrid
// groups alike (currency, external wallet reference, etc. could land
// here later without disturbing ContributionSettings/EventSettings).
public class FinancialSettings
{
    public decimal JoiningFee { get; set; } = 0m;

    // Moved here from being event-only: this is a floor on a member's
    // overall reserve/wallet balance, not an event-specific concept -
    // see EventService.TriggerEventAsync (deduction floor enforcement)
    // and WelfarePenaltyBackgroundService (below-floor fine trigger).
    public decimal MinimumReserveBalance { get; set; } = 0m;
}

// Monthly Contribution Group rules.
public class ContributionSettings
{
    public decimal MonthlyContribution { get; set; } = 0m;
    public int DueDateDay { get; set; } = 5;
    public int GracePeriodDays { get; set; } = 7;
    public decimal LateFine { get; set; } = 0m;
    public decimal MinimumShortfallForFine { get; set; } = 0m;

    // NEW (Compliance Engine, Ukonga Rules Specification v1.2, Phase 1):
    // how many CONSECUTIVE months a member can miss before Member Status
    // Engine (Phase 2) moves them to NonActive. Was previously hardcoded
    // as "3" (AddMonths(-2)) inside ContributionComplianceBackgroundService
    // - now a per-group config value like everything else in this class.
    // Default of 3 preserves that old hardcoded behaviour until a group
    // admin explicitly changes it.
    public int MaxConsecutiveMissedMonths { get; set; } = 3;

    // NEW (ARCH-001, Ukonga Rules Specification v1.2 sehemu 4b): resolves
    // which debt a new payment closes when a member has both current-month
    // and historical shortfalls outstanding. See DebtAllocationStrategy in
    // Enums.cs. Default CurrentMonthFirst matches Ukonga's confirmed rule.
    public DebtAllocationStrategy DebtAllocationStrategy { get; set; } = DebtAllocationStrategy.CurrentMonthFirst;
}

// Welfare / Event-Based Group rules.
public class EventSettings
{
    // NEW: lets a MonthlySavings-only group turn event/welfare handling
    // off entirely rather than relying on GroupType alone to imply it.
    // Defaults to true so existing behaviour (events always processed)
    // is unchanged until a group explicitly opts out.
    public bool EventsEnabled { get; set; } = true;

    public WelfareMode WelfareMode { get; set; } = WelfareMode.DeductBalance;

    // NEW: replaces the `fineAmount = 5000m` constant that used to be
    // hardcoded inside WelfarePenaltyBackgroundService. Default kept at
    // 5000 to match that old hardcoded behaviour for every existing
    // group until a group admin explicitly changes it.
    public decimal WelfareFineAmount { get; set; } = 5000m;
}

// Loan module rules. Several fields here are intentionally
// "field-only, not enforced yet" - see the XML docs on each - so Phase A
// can capture the settings shape now without also being forced to
// rewrite LoanService's calculation logic in the same change.
public class LoanSettings
{
    public bool Enabled { get; set; } = true;

    public decimal InterestRate { get; set; } = 0m;

    // Field only for now - LoanService always computes Flat interest
    // regardless of this value. See LoanInterestType in Enums.cs.
    public LoanInterestType InterestType { get; set; } = LoanInterestType.Flat;

    // Field only for now - DueDate is still supplied directly by the
    // caller via IssueLoanDto.DueDate, not derived from this default.
    public int RepaymentDays { get; set; } = 30;

    // Field only for now - LoanService has an IsOverdue flag but no
    // "overdue loan -> apply this penalty" action yet.
    public decimal LatePenaltyAmount { get; set; } = 0m;

    // Field only for now (e.g. "loan cannot exceed 3x savings balance").
    // Null means no cap is enforced - matches today's actual behaviour,
    // where LoanService does not check savings balance at all yet.
    public decimal? MaxLoanMultiplier { get; set; }
}

// A single approve/reject rule: who is allowed to decide, and how many
// of them must agree. Reused across every approval surface in the app
// (Withdrawal today; Loan/Event/Import as of this Phase A change) so the
// same resolution logic (see WithdrawalService.ResolveApprovalRule) can
// eventually be shared instead of re-implemented per module.
public class ApprovalPolicy
{
    public ApprovalMode Mode { get; set; } = ApprovalMode.TreasurerOnly;

    // Only read when Mode == CustomApproval. Comma-separated GroupRole
    // names, e.g. "Treasurer,Chairperson" - kept as plain text (not a
    // collection) for Phase A since WithdrawalService's existing
    // ParseCustomRoles helper already works against this exact shape;
    // switching to a real collection type is Phase B/C work once the
    // services that read it are being touched anyway.
    public string? CustomRoles { get; set; }

    // Only read when Mode == CustomApproval. Null means "all of
    // CustomRoles must approve" (unanimous).
    public int? CustomRequiredApprovals { get; set; }
}

// Who must approve which kind of action. WithdrawalApproval already
// existed (as flat WithdrawalApprovalMode/CustomApprovalRoles/
// CustomRequiredApprovals properties) and defaults to TreasurerOnly,
// unchanged. LoanApproval/EventApproval/ImportApproval are NEW - they
// replace the hardcoded "Treasurer or Chairperson" role checks found in
// LoanService, EventController and MkobaImportController. Their default
// reproduces that exact hardcoded behaviour (CustomApproval, roles
// "Treasurer,Chairperson", 1 required) so nothing changes for any
// existing group until it is deliberately rewired to read from here in
// a later phase, and until an admin explicitly changes the policy.
public class GovernanceSettings
{
    public ApprovalPolicy WithdrawalApproval { get; set; } = new();

    public ApprovalPolicy LoanApproval { get; set; } = new()
    {
        Mode = ApprovalMode.CustomApproval,
        CustomRoles = "Treasurer,Chairperson",
        CustomRequiredApprovals = 1
    };

    public ApprovalPolicy EventApproval { get; set; } = new()
    {
        Mode = ApprovalMode.CustomApproval,
        CustomRoles = "Treasurer,Chairperson",
        CustomRequiredApprovals = 1
    };

    public ApprovalPolicy ImportApproval { get; set; } = new()
    {
        Mode = ApprovalMode.CustomApproval,
        CustomRoles = "Treasurer,Chairperson",
        CustomRequiredApprovals = 1
    };
}
