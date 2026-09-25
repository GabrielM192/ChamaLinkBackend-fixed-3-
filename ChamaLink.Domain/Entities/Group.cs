namespace ChamaLink.Domain.Entities;

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
    public string Description { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public GroupType Type { get; set; } = GroupType.MonthlySavings;
    public OrganizationType OrganizationType { get; set; } = OrganizationType.Mkoba;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public GroupSettings? Settings { get; set; }
    public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
}
