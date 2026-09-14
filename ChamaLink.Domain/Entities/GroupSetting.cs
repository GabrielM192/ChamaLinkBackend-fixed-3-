namespace ChamaLink.Domain.Entities;

// Unified group configuration model.
//
// PHASE A (GroupSettings Owned Types Refactor): storage is split into
// five modules (Financial/Contribution/Event/Loan/Governance - see
// GroupSettingsModules.cs) grouped by which part of the business they
// govern. Each is mapped as an EF Core owned type onto THIS SAME table
// (see ApplicationDbContext.OnModelCreating).
//
// PHASE C (cleanup): the flat pass-through properties that used to live
// here (MonthlyContribution, LateFine, LoanInterestRate, DueDateDay,
// GracePeriodDays, JoiningFee, MinimumReserveBalance,
// MinimumShortfallForFine, WithdrawalApprovalMode, WelfareMode,
// CustomApprovalRoles, CustomRequiredApprovals) have been removed - every
// call site across the codebase (GroupService, LoanService, EventService,
// WithdrawalService, AnalyticsService,
// ContributionComplianceBackgroundService, ReportsController,
// MkobaImportController, WelfarePenaltyBackgroundService) was migrated in
// Phase B to read/write the nested modules directly (e.g.
// settings.Contribution.MonthlyContribution instead of
// settings.MonthlyContribution). There is nothing left depending on the
// old flat shape.
public class GroupSettings
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }

    public FinancialSettings Financial { get; set; } = new();
    public ContributionSettings Contribution { get; set; } = new();
    public EventSettings Event { get; set; } = new();
    public LoanSettings Loan { get; set; } = new();
    public GovernanceSettings Governance { get; set; } = new();

    // Navigation Property
    public Group? Group { get; set; }
}
