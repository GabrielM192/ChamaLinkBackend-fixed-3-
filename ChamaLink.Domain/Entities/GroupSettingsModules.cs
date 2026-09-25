namespace ChamaLink.Domain.Entities;

// Product configuration layer - each module governs one business area
// Stored as owned types on GroupSettings table

public enum JoinFeeMode
{
    Optional = 1,
    ParallelWithContributions = 2,
    MustCompleteBeforeContributing = 3
}

public enum JoinFeeCaptureMode
{
    AutomaticOnly = 1,
    AutomaticAndManual = 2,
    ManualOnly = 3
}

public class JoinFeeSettings
{
    public decimal RequiredAmount { get; set; } = 50000m;
    public JoinFeeMode Mode { get; set; } = JoinFeeMode.ParallelWithContributions;
    public JoinFeeCaptureMode CaptureMode { get; set; } = JoinFeeCaptureMode.AutomaticAndManual;
    public decimal? ApprovalThreshold { get; set; } // e.g., manual entries above this need approval
}

public class FinancialSettings
{
    public decimal JoiningFee { get; set; } = 0m;
    public decimal MinimumReserveBalance { get; set; } = 0m;
    public JoinFeeSettings JoinFeeConfig { get; set; } = new(); // AWAMU C Fixed31
}

public class ContributionSettings
{
    public decimal MonthlyContribution { get; set; } = 0m;
    public int DueDateDay { get; set; } = 5;
    public int GracePeriodDays { get; set; } = 5; // Fixed31: unified to 5 to match GroupPolicy (was 7, caused inconsistency 3.6)
    public decimal LateFine { get; set; } = 0m;
    public decimal MinimumShortfallForFine { get; set; } = 0m;
    public int MaxConsecutiveMissedMonths { get; set; } = 3;
    public DebtAllocationStrategy DebtAllocationStrategy { get; set; } = DebtAllocationStrategy.OldestDebtFirst; // Fixed31: was CurrentMonthFirst, now OldestDebtFirst for AWAMU A
    public ShortfallStrategy ShortfallStrategy { get; set; } = ShortfallStrategy.CreateDebt;
    public ComplianceStrategy ComplianceStrategy { get; set; } = ComplianceStrategy.MonthlyTarget;
}

public class EventSettings
{
    public bool EventsEnabled { get; set; } = true;
    public WelfareMode WelfareMode { get; set; } = WelfareMode.DeductBalance;
    public decimal WelfareFineAmount { get; set; } = 5000m;
}

public class LoanSettings
{
    public bool Enabled { get; set; } = true;
    public decimal InterestRate { get; set; } = 0m;
    public LoanInterestType InterestType { get; set; } = LoanInterestType.Flat;
    public int RepaymentDays { get; set; } = 30;
    public decimal LatePenaltyAmount { get; set; } = 0m;
    public decimal? MaxLoanMultiplier { get; set; }
    public LoanStrategy LoanStrategy { get; set; } = LoanStrategy.DirectIssue;
    public bool GuarantorRequired { get; set; } = false;
    public int MinGuarantors { get; set; } = 0;
}

public class ApprovalPolicy
{
    public ApprovalMode Mode { get; set; } = ApprovalMode.TreasurerOnly;
    public string? CustomRoles { get; set; }
    public int? CustomRequiredApprovals { get; set; }
}

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
