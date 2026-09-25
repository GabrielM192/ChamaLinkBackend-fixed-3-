namespace ChamaLink.Domain.Entities;

/// <summary>
/// Every financial action is an event. Ledger entries are derived from events.
/// This is the foundation of event sourcing — no direct balance updates.
/// </summary>
public class FinancialEvent
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid? MemberId { get; set; }
    public FinancialEventType Type { get; set; }
    public decimal Amount { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid CreatedBy { get; set; }
    public EventSource Source { get; set; } = EventSource.Manual;
    public string? SourceReference { get; set; }
    public int PolicyVersion { get; set; } = 1;
    public Guid? CorrelationId { get; set; }
    public string? MetadataJson { get; set; }
    public Guid? AuditTrailId { get; set; }

    // AWAMU C Fixed31: Approval workflow for manual/historical financial events (e.g., Frank's 10k via Chairperson)
    // Pattern copied from Withdrawal.cs
    public FinancialEventStatus Status { get; set; } = FinancialEventStatus.Approved; // Auto-approved for system imports, Pending for manual
    public Guid? ApprovedByGroupMemberId { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovalNote { get; set; }
    public string? Reason { get; set; } // e.g., "Kianzio kupitia Mwenyekiti"

    public Group? Group { get; set; }
    public GroupMember? Member { get; set; }
}

public enum FinancialEventStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4
}

public enum FinancialEventType
{
    PaymentReceived = 1,
    ContributionCharged = 2,
    ContributionPaid = 3,
    LoanIssued = 10,
    LoanRepaymentDue = 11,
    LoanRepaymentPaid = 12,
    FineCharged = 20,
    FinePaid = 21,
    JoiningFeeCharged = 30,
    JoiningFeePaid = 31,
    SavingsDeposited = 40,
    SavingsWithdrawn = 41,
    SavingsHeld = 42,
    SavingsReleased = 43,
    SavingsHeldUsedForLoan = 44,
    WelfareEventCreated = 50,
    WelfareObligationCreated = 51,
    WelfareContributionPaid = 52,
    WelfareDisbursement = 53,
    DebtCreated = 60,
    DebtCleared = 61
}

public enum EventSource
{
    Manual = 1,
    MKobaImport = 2,
    ExcelImport = 3,
    System = 4,
    BackgroundJob = 5,
    API = 6,
    Migration = 7
}
