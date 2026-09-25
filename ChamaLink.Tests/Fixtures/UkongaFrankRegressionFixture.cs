using ChamaLink.Infrastructure.Services;

namespace ChamaLink.Tests.Fixtures;

/// <summary>
/// Regression fixture for Tunganege Mwalubilo / Frank Mkoma scenarios.
/// Fixed26: Moved from Infrastructure/Services to Tests - production code must not contain name-based fixtures.
/// This fixture is ONLY for tests, not for production allocation.
/// </summary>
public static class UkongaFrankRegressionFixture
{
    public static TunganegeTruthTableDto GetTunganegeBusinessTruth(Guid memberId, string fullName)
    {
        // Only for regression test, validates waterfall logic hasn't broken
        if (!fullName.Contains("Tunganege", StringComparison.OrdinalIgnoreCase) &&
            !fullName.Contains("Frank", StringComparison.OrdinalIgnoreCase))
        {
            // Allow any name in tests, but log warning
        }

        return new TunganegeTruthTableDto
        {
            MemberId = memberId,
            FullName = fullName,
            Months = new List<TunganegeMonthDto>
            {
                new() { Month = "Jan 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Mchango wa Jan" },
                new() { Month = "Feb 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Mchango wa Feb" },
                new() { Month = "Mar 2026", Paid = 60000, Contribution = 10000, JoinFee = 50000, FinePaid = 0, Savings = 0, Note = "Mchango + Kianzio (60k = 10k contribution + 50k join fee)" },
                new() { Month = "Apr 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Mchango wa Apr" },
                new() { Month = "May 2026", Paid = 0, Contribution = 0, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Hakulipa — Debt 10k + Fine 5k" },
                new() { Month = "Jun 2026", Paid = 25000, Contribution = 20000, JoinFee = 0, FinePaid = 5000, Savings = 0, Note = "10k May debt + 5k Fine + 10k Jun" },
                new() { Month = "Jul 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Mchango wa Jul" },
                new() { Month = "Aug 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Mchango wa Aug (Excel only, not in M-Koba PDF)" },
            },
            TotalPaid = 135000,
            TotalContribution = 80000,
            TotalJoinFee = 50000,
            TotalFinePaid = 5000,
            TotalSavings = 0,
            IsBusinessTruth = true
        };
    }

    public static TunganegeTruthTableDto GetFrankScenario()
    {
        // Frank: 9 entries, 80k total, testing oldest-first
        return new TunganegeTruthTableDto
        {
            MemberId = Guid.NewGuid(),
            FullName = "Frank Mkoma",
            Months = new List<TunganegeMonthDto>
            {
                new() { Month = "Jan 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0 },
                new() { Month = "Feb 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0 },
                new() { Month = "Mar 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0 },
                new() { Month = "Apr 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0 },
                new() { Month = "May 2026", Paid = 0, Contribution = 0, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Missed" },
                new() { Month = "Jun 2026", Paid = 0, Contribution = 0, JoinFee = 0, FinePaid = 0, Savings = 0, Note = "Missed" },
                new() { Month = "Jul 2026", Paid = 15000, Contribution = 10000, JoinFee = 0, FinePaid = 5000, Savings = 0, Note = "Jul pays May 10k + Fine 5k" },
                new() { Month = "Aug 2026", Paid = 15000, Contribution = 10000, JoinFee = 0, FinePaid = 5000, Savings = 0, Note = "Aug pays Jun 10k + Fine 5k" },
                new() { Month = "Sep 2026", Paid = 10000, Contribution = 10000, JoinFee = 0, FinePaid = 0, Savings = 0 },
            },
            TotalPaid = 80000,
            TotalContribution = 70000,
            TotalJoinFee = 0,
            TotalFinePaid = 10000,
            TotalSavings = 0,
            IsBusinessTruth = true
        };
    }
}
