using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

// Sprint 1 gap: "Debt Table Haipo". Records a member's missed
// contribution as an explicit, trackable Debt (separate from the Fine
// penalty issued alongside it - see FineService).
public class DebtService
{
    private readonly ApplicationDbContext _context;

    public DebtService(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<Debt> RecordShortfallAsync(
        Guid groupId, Guid groupMemberId, Guid userId,
        decimal amount, DateTime period, string reason)
    {
        var debt = new Debt
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            GroupMemberId = groupMemberId,
            UserId = userId,
            Amount = amount,
            Reason = reason,
            Period = period,
            CreatedAt = DateTime.UtcNow
        };

        _context.Debts.Add(debt);
        return Task.FromResult(debt);
    }

    // Applies an over-payment (money paid beyond what the current period
    // needs) against the member's oldest open Debts first, so past
    // shortfalls get cleared automatically as soon as the member catches
    // up, without a treasurer having to do it by hand.
    public async Task<decimal> ClearWithPaymentAsync(Guid groupMemberId, decimal availableAmount)
    {
        if (availableAmount <= 0)
            return 0m;

        var openDebts = await _context.Debts
            .Where(d => d.GroupMemberId == groupMemberId && d.Status == DebtStatus.Outstanding)
            .OrderBy(d => d.Period)
            .ToListAsync();

        decimal remaining = availableAmount;
        decimal totalApplied = 0m;

        foreach (var debt in openDebts)
        {
            if (remaining <= 0) break;

            decimal outstanding = debt.Amount - debt.AmountCleared;
            if (outstanding <= 0) continue;

            decimal portion = Math.Min(outstanding, remaining);
            debt.AmountCleared += portion;
            if (debt.AmountCleared >= debt.Amount)
            {
                debt.Status = DebtStatus.Cleared;
                debt.ClearedAt = DateTime.UtcNow;
            }

            remaining -= portion;
            totalApplied += portion;
        }

        return totalApplied;
    }

    public async Task<decimal> GetOutstandingTotalAsync(Guid groupMemberId)
    {
        return await _context.Debts
            .Where(d => d.GroupMemberId == groupMemberId && d.Status == DebtStatus.Outstanding)
            .SumAsync(d => (decimal?)(d.Amount - d.AmountCleared)) ?? 0m;
    }

    public async Task<List<Debt>> GetDebtsForGroupAsync(Guid groupId)
    {
        return await _context.Debts
            .Where(d => d.GroupId == groupId)
            .OrderByDescending(d => d.Period)
            .ToListAsync();
    }
}
