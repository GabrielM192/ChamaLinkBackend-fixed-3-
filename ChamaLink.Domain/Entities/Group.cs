namespace ChamaLink.Domain.Entities;

// ChamaLink v1 scope serves two group types:
//   MonthlySavings = "Monthly Contribution Group" (fixed periodic
//     contribution, due date, grace period, late fine, joining fee)
//   EventBased     = "Welfare/Event-Based Group" (minimum reserve
//     balance, contributions tied to events like msiba/harusi)
// Hybrid is an existing extension (both behaviours combined) that is not
// part of the v1-exposed group type choice, but the underlying logic
// already supports it, so it is left in place rather than removed.
public enum GroupType
{
    MonthlySavings,
    EventBased,
    Hybrid
}

public class Group
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty; // Fixed missing field
    public string Code { get; set; } = string.Empty;        // Fixed missing field
    public GroupType Type { get; set; } = GroupType.MonthlySavings;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation Properties
    public GroupSettings? Settings { get; set; }
    public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
}