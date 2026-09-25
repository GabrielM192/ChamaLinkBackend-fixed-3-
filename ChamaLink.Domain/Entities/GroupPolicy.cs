namespace ChamaLink.Domain.Entities;

/// <summary>
/// Versioned business rules for a group. Each version has EffectiveFrom/To.
/// Reports use the policy version active at that time, so old reports never change.
/// </summary>
public class GroupPolicy
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public int Version { get; set; } = 1;
    public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
    public DateTime? EffectiveTo { get; set; }
    public bool IsActive { get; set; } = true;

    // Monthly contribution rules
    public decimal MonthlyContribution { get; set; } = 10000m;
    public decimal JoiningFee { get; set; } = 50000m;
    public decimal LateFine { get; set; } = 5000m;
    // The due day is part of the versioned policy. Do not read it from
    // GroupSettings in the obligation engine, otherwise old reports can
    // change when current settings are edited.
    public int DueDateDay { get; set; } = 5;
    public int GracePeriodDays { get; set; } = 5;
    public int MaxConsecutiveMissedMonths { get; set; } = 3;

    // AWAMU C Fixed31: JoinFee configuration for versioning (so 2026 reports don't change when 2027 fee changes)
    public JoinFeeMode JoinFeeMode { get; set; } = JoinFeeMode.ParallelWithContributions;
    public JoinFeeCaptureMode JoinFeeCaptureMode { get; set; } = JoinFeeCaptureMode.AutomaticAndManual;
    public decimal? JoinFeeApprovalThreshold { get; set; }

    // Allocation strategy
    public AllocationStrategy AllocationStrategy { get; set; } = AllocationStrategy.ContributionFirst;
    public ShortfallStrategy ShortfallStrategy { get; set; } = ShortfallStrategy.UseSavingsThenFine;
    public ComplianceStrategy ComplianceStrategy { get; set; } = ComplianceStrategy.MonthlyTarget;
    public DebtAllocationStrategy DebtAllocationStrategy { get; set; } = DebtAllocationStrategy.OldestDebtFirst;

    // Loan rules
    public bool LoanEnabled { get; set; } = true;
    public decimal LoanInterestRate { get; set; } = 0m;
    public LoanInterestType LoanInterestType { get; set; } = LoanInterestType.Flat;
    public int LoanRepaymentDays { get; set; } = 30;
    public decimal LoanLatePenaltyAmount { get; set; } = 0m;
    public decimal? LoanMaxMultiplier { get; set; }
    public LoanStrategy LoanStrategy { get; set; } = LoanStrategy.DirectIssue;
    public bool GuarantorRequired { get; set; } = false;
    public int MinGuarantors { get; set; } = 0;
    public decimal LoanCollateralPercent { get; set; } = 30m; // % of loan held as savings collateral
    public bool CollateralCanBeUsedForDefault { get; set; } = true;

    // Welfare rules
    public bool WelfareEnabled { get; set; } = true;
    public decimal WelfareFineAmount { get; set; } = 5000m;
    public WelfareMode WelfareMode { get; set; } = WelfareMode.DeductBalance;
    public bool BeneficiaryExempted { get; set; } = true;
    public decimal WelfareCollectionThreshold { get; set; } = 90m; // % collected before disbursement

    // Governance
    public ApprovalMode WithdrawalApprovalMode { get; set; } = ApprovalMode.TreasurerAndChairperson;
    public ApprovalMode LoanApprovalMode { get; set; } = ApprovalMode.CustomApproval;
    public ApprovalMode EventApprovalMode { get; set; } = ApprovalMode.CustomApproval;
    public ApprovalMode ImportApprovalMode { get; set; } = ApprovalMode.CustomApproval;

    // Audit
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string Reason { get; set; } = "Initial policy";

    public Group? Group { get; set; }
}

public enum AllocationStrategy
{
    ContributionFirst = 1,
    RepaymentFirst = 2,
    Custom = 3
}
