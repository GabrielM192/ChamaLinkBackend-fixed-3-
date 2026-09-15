using ChamaLink.Application.DTOs;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

// Ukonga Rules Specification v1.2, sehemu 5/7/8 (Phase 5 - Reports). Reads
// ONLY from ComplianceSnapshots (Phase 4) - this is a pure read layer, it
// never touches Status, never creates a Debt/Fine, never recomputes
// anything ContributionComplianceBackgroundService already decided. If a
// group's snapshots haven't been generated yet (the background job
// hasn't run for it), these come back empty rather than silently falling
// back to a live recompute - Phase 5 is built ON TOP OF Phase 4, not a
// substitute for it (sehemu 10).
public class ComplianceReportService
{
    private readonly ApplicationDbContext _context;

    public ComplianceReportService(ApplicationDbContext context)
    {
        _context = context;
    }

    // Sehemu 7: one row per member, taken from each member's most recent
    // snapshot. "Defaulters" (ConsecutiveMissedMonths >= 1), "Warnings"
    // (Status = Warning) and "NonActive list" (Status = Inactive, sehemu
    // 8) are all just filtered views over this one table - the caller
    // filters client-side instead of hitting three separate endpoints
    // that would each have to re-derive the same numbers.
    //
    // Grouping/ordering happens in memory rather than as a single SQL
    // query - group member counts and snapshot-month counts are both
    // small (one row per member per month), and "latest snapshot per
    // member" is exactly the kind of grouped-top-1 query EF Core does not
    // reliably translate to SQL across providers.
    public async Task<List<ComplianceSummaryRowDto>> GetComplianceSummaryAsync(Guid groupId)
    {
        var allSnapshots = await _context.ComplianceSnapshots
            .Where(s => s.GroupId == groupId)
            .ToListAsync();

        if (allSnapshots.Count == 0)
            return new List<ComplianceSummaryRowDto>();

        var latestSnapshots = allSnapshots
            .GroupBy(s => s.GroupMemberId)
            .Select(g => g.OrderByDescending(s => s.Month).First())
            .ToList();

        var memberIds = latestSnapshots.Select(s => s.GroupMemberId).ToList();

        var members = await _context.GroupMembers
            .Include(m => m.User)
            .Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id);

        return latestSnapshots
            .Select(s =>
            {
                members.TryGetValue(s.GroupMemberId, out var member);
                return new ComplianceSummaryRowDto(
                    s.GroupMemberId,
                    member?.UserId ?? Guid.Empty,
                    member?.User?.FullName ?? "Mwanachama",
                    member?.User?.PhoneNumber ?? string.Empty,
                    s.Month,
                    s.TotalMissedMonths,
                    s.ConsecutiveMissedMonths,
                    s.OutstandingFineAmount,
                    s.OutstandingContributionDebt,
                    s.Status.ToString());
            })
            // Worst-standing members first - matches how sehemu 7's own
            // example table reads (Leonard/Frank/Adam, ascending compliance).
            .OrderByDescending(r => r.ConsecutiveMissedMonths)
            .ThenByDescending(r => r.OutstandingContributionDebt)
            .ToList();
    }

    // Sehemu 6/8: full month-by-month trend for one member, oldest first,
    // so a chart or table can show "mwenendo" directly.
    public async Task<ComplianceTrendDto?> GetComplianceTrendAsync(Guid groupId, Guid groupMemberId)
    {
        var member = await _context.GroupMembers
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.Id == groupMemberId && m.GroupId == groupId);

        if (member == null)
            return null;

        var snapshots = await _context.ComplianceSnapshots
            .Where(s => s.GroupMemberId == groupMemberId)
            .OrderBy(s => s.Month)
            .ToListAsync();

        var points = snapshots
            .Select(s => new ComplianceTrendPointDto(
                s.Month,
                s.ExpectedContribution,
                s.PaidContribution,
                s.FineIssuedAmount,
                s.FinePaidAmount,
                s.OutstandingFineAmount,
                s.TotalMissedMonths,
                s.ConsecutiveMissedMonths,
                s.OutstandingContributionDebt,
                s.Status.ToString()))
            .ToList();

        return new ComplianceTrendDto(groupMemberId, member.User?.FullName ?? "Mwanachama", points);
    }
}
