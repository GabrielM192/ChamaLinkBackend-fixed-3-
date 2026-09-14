using System.Globalization;
using System.Text.Json;
using ChamaLink.Application.DTOs;
using ChamaLink.Application.Interfaces;
using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

// Imports a treasurer's monthly-grid Excel ledger into a group's ledger.
//
// WHY A SEPARATE IMPORTER (not the M-Koba upload-statement path):
// The M-Koba importer runs a deposit waterfall that REQUIRES a real
// transaction date + reference and AUTO-ISSUES late fines based on the
// day of the month. The Excel has no daily dates and no references - it
// is a monthly summary. Feeding it through the waterfall would fabricate
// fine history and split each monthly lump sum across fine/event/joining
// fee/advance even though the Excel already separates KIANZIO/MSIBA/
// SHEREHE into their own columns. It also matches members by phone and
// auto-creates users - which, with half the Excel's members missing a
// phone and the rest having name spelling variations (BOAZ vs BOAZI),
// would create duplicates. This importer posts clean back-dated
// LedgerEntries directly (no live waterfall), matches by NAME with a
// confirmation step, and uses synthetic TREAS- references so the real
// M-Koba import's per-reference dedup can never collide.
//
// v1.1 - CELL SPLITTING (Option B = "import is a record"):
// The treasurer's Excel BUNDLES a late fine into a monthly cell, e.g.
// 15,000 = 10,000 mchango + 5,000 faini (member was late). 12,000 =
// 10,000 mchango + 2,000 akiba (on time, extra to savings). So each
// paid cell is un-bundled into up to three structured entries:
//   Contribution = min(cell, MonthlyContribution)
//   Fine         = LateFine, ONLY when excess == LateFine  -> Fine entity (issued+paid)
//   Savings      = any other excess                         -> AdvanceBalance (akiba)
// This RECORDS the treasurer's manual allocation; it does NOT run the
// live waterfall (no auto-fine by date, no savings-auto-deduct for
// unpaid months). Unpaid (*) months get no entry. Live rules belong to
// the Rules Engine / M-Koba import going forward (Option A).
public class TreasuryImportService
{
    private readonly ApplicationDbContext _context;
    private readonly AccountResolverService _accountResolver;
    private readonly ITreasuryExcelParserService _parser;

    public TreasuryImportService(
        ApplicationDbContext context,
        AccountResolverService accountResolver,
        ITreasuryExcelParserService parser)
    {
        _context = context;
        _accountResolver = accountResolver;
        _parser = parser;
    }

    // ---------------------------------------------------------------------
    // PREVIEW (dry-run): parse + match + plan the per-cell split, but
    // write NOTHING. Returns the full mapping (Excel name -> matched
    // member + candidates + planned splits) so the treasurer can
    // confirm/adjust before committing.
    // ---------------------------------------------------------------------
    public async Task<TreasuryImportPreviewDto> GetPreviewAsync(Guid groupId, Stream stream)
    {
        var excelRows = await _parser.ParseAsync(stream);

        var (group, members) = await LoadGroupAndMembersAsync(groupId);
        var candidates = members.Select(m => (m, m.User)).ToList();

        decimal monthlyTarget = group.Settings?.Contribution.MonthlyContribution ?? 0m;
        decimal lateFine = group.Settings?.Contribution.LateFine ?? 0m;

        var dto = new TreasuryImportPreviewDto
        {
            GroupId = groupId,
            TotalRows = excelRows.Count
        };

        foreach (var row in excelRows)
        {
            var previewRow = new TreasuryImportPreviewRowDto
            {
                RowNumber = row.RowNumber,
                ExcelName = row.ExcelName,
                MonthlyAmounts = row.MonthlyAmounts,
                JoiningFee = row.JoiningFee,
                Msiba = row.Msiba,
                Sherehe = row.Sherehe,
                IsNonActive = row.IsNonActive
            };

            var best = MemberNameMatcher.Match(row.ExcelName, candidates, out var alts);
            if (best is { IsExact: true } exact)
            {
                previewRow.MatchedMemberId = exact.MemberId;
                previewRow.MatchedMemberName = exact.MemberName;
                previewRow.MatchConfidence = 100;
                previewRow.IsExactMatch = true;
                dto.ExactMatchedRows++;
            }
            else if (best is { } fuzzy)
            {
                previewRow.MatchedMemberName = fuzzy.MemberName;
                previewRow.MatchConfidence = fuzzy.Confidence;
                previewRow.Candidates = alts
                    .Select(a => new TreasuryMatchCandidateDto
                    {
                        MemberId = a.MemberId,
                        MemberName = a.MemberName,
                        Confidence = a.Confidence
                    }).ToList();
                dto.FuzzyMatchedRows++;

                previewRow.Warnings.Add(
                    "Jina halilingani kikamilifu - linahitaji uthibitisho. Wategemewa bora: " +
                    $"'{fuzzy.MemberName}' ({fuzzy.Confidence}%).");
            }
            else
            {
                previewRow.MatchConfidence = 0;
                dto.UnmatchedRows++;
                previewRow.Warnings.Add("Jina halipatikani kati ya wanachama - litasimamishwa (skip).");
            }

            // Plan the per-cell split so the treasurer can verify the
            // un-bundling (e.g. confirm 15,000 = mchango + faini).
            for (int m = 0; m < 12; m++)
            {
                var amt = row.MonthlyAmounts[m];
                var (contribution, fine, savings) = ComputeSplit(amt ?? 0m, monthlyTarget, lateFine);

                var split = new TreasuryPlannedSplitDto
                {
                    Month = m + 1,
                    MonthName = new DateTime(2000, m + 1, 1)
                        .ToString("MMM", CultureInfo.InvariantCulture).ToUpperInvariant(),
                    TotalAmount = amt
                };

                if (!amt.HasValue || amt.Value <= 0)
                {
                    split.SplitNote = "hajachangia (*)";
                }
                else
                {
                    split.Contribution = contribution;
                    split.Fine = fine;
                    split.Savings = savings;

                    if (fine > 0)
                        split.SplitNote = $"mchango {contribution:N0} + faini {fine:N0} (alichelewa)";
                    else if (savings > 0)
                        split.SplitNote = $"mchango {contribution:N0} + akiba {savings:N0}";
                    else if (monthlyTarget > 0 && contribution < monthlyTarget)
                        split.SplitNote = $"mchango wa kiasi {contribution:N0} (lengo {monthlyTarget:N0})";
                    else
                        split.SplitNote = $"mchango {contribution:N0}";
                }

                previewRow.PlannedSplits.Add(split);
            }

            if (row.Msiba.HasValue || row.Sherehe.HasValue)
                previewRow.Warnings.Add(
                    "MSIBA/SHEREHE ni malipo ya ustawi (payouts), sio michango - " +
                    "yataahirishwa kwenye v2 (yanahitaji model ya tukio + katiba).");

            dto.Rows.Add(previewRow);
        }

        if (dto.UnmatchedRows > 0)
            dto.Warnings.Add($"{dto.UnmatchedRows} safu hazipatikani - zitahitaji ku-resolve kwa 'memberOverrides' kabla ya commit.");

        return dto;
    }

    // ---------------------------------------------------------------------
    // COMMIT: parse + match + post. Each paid cell is un-bundled into
    // Contribution / Fine / Savings entries with synthetic TREAS-
    // references (idempotent via per-reference + per-Fine dedup). Unpaid
    // (*) months get no entry (Option B). NON ACTIVE members -> Inactive;
    // MSIBA/SHEREHE deferred with warnings.
    // ---------------------------------------------------------------------
    public async Task<TreasuryImportResultDto> CommitAsync(
        Guid groupId, Stream stream, int year,
        Dictionary<string, Guid>? memberOverrides)
    {
        var excelRows = await _parser.ParseAsync(stream);

        var (group, members) = await LoadGroupAndMembersAsync(groupId);
        var candidates = members.Select(m => (m, m.User)).ToList();
        var memberById = members.ToDictionary(m => m.Id);

        int dueDateDay = group.Settings?.Contribution.DueDateDay ?? 5;
        if (dueDateDay < 1) dueDateDay = 5;
        decimal monthlyTarget = group.Settings?.Contribution.MonthlyContribution ?? 0m;
        decimal lateFine = group.Settings?.Contribution.LateFine ?? 0m;

        var result = new TreasuryImportResultDto { TotalRows = excelRows.Count };

        // Normalise override keys so the caller can pass the Excel name
        // however it appears in the preview, case/space-insensitively.
        var overrides = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        if (memberOverrides != null)
        {
            foreach (var kv in memberOverrides)
            {
                overrides[MemberNameMatcher.Normalize(kv.Key)] = kv.Value;
            }
        }

        using var tx = await _context.Database.BeginTransactionAsync();

        foreach (var row in excelRows)
        {
            // ---- resolve member: exact-name auto-match, else explicit override ----
            Guid? resolvedMemberId = null;

            var best = MemberNameMatcher.Match(row.ExcelName, candidates, out _);
            if (best is { IsExact: true } exact)
            {
                resolvedMemberId = exact.MemberId;
            }
            else if (overrides.TryGetValue(MemberNameMatcher.Normalize(row.ExcelName), out var overrideId))
            {
                resolvedMemberId = overrideId;
            }

            if (!resolvedMemberId.HasValue || !memberById.TryGetValue(resolvedMemberId.Value, out var member))
            {
                result.UnmatchedRowsSkipped++;
                result.SkippedUnmatched.Add(
                    $"Safu {row.RowNumber}: '{row.ExcelName}' - haijaanganiwa, imeachwa.");
                continue;
            }

            var savingsAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.Savings);
            string memberRef = !string.IsNullOrWhiteSpace(member.MemberNumber)
                ? member.MemberNumber
                : row.RowNumber.ToString("000", CultureInfo.InvariantCulture);
            string code = string.IsNullOrWhiteSpace(group.Code)
                ? "GROUP" : group.Code.ToUpperInvariant().Trim();

            // ---- monthly cells: un-bundle each into mchango + faini + akiba ----
            for (int m = 0; m < 12; m++)
            {
                var amount = row.MonthlyAmounts[m];
                if (!amount.HasValue || amount.Value <= 0)
                    continue; // unpaid (*) - Option B: record nothing

                string monthAbbr = new DateTime(year, m + 1, 1)
                    .ToString("MMM", CultureInfo.InvariantCulture).ToUpperInvariant();
                int day = Math.Min(dueDateDay, DateTime.DaysInMonth(year, m + 1));
                var date = new DateTime(year, m + 1, day, 0, 0, 0, DateTimeKind.Utc);
                var monthStart = new DateTime(year, m + 1, 1, 0, 0, 0, DateTimeKind.Utc);
                string monthName = date.ToString("MMMM yyyy", CultureInfo.InvariantCulture);

                var (contribution, fine, savings) = ComputeSplit(amount.Value, monthlyTarget, lateFine);

                // --- (1) Contribution portion ---
                if (contribution > 0)
                {
                    string refNo = $"TREAS-{code}-{year:0000}-{monthAbbr}-{memberRef}";

                    bool exists = await _context.LedgerEntries
                        .AnyAsync(l => l.GroupId == groupId &&
                                       l.UserId == member.UserId &&
                                       l.ReferenceNo == refNo);
                    if (exists)
                    {
                        result.EntriesSkippedDuplicate++;
                    }
                    else
                    {
                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = groupId,
                            UserId = member.UserId,
                            AccountId = savingsAccount.Id,
                            Amount = contribution,
                            Type = TransactionType.Contribution,
                            ReferenceNo = refNo,
                            Description = $"Mchango wa {monthName} (kutoka Excel ya mtunza-hazina)",
                            CreatedAt = date
                        });

                        result.ContributionsPosted++;
                        result.TotalContributionsAmount += contribution;
                        member.TotalContributionsCount++;
                    }
                }

                // --- (2) Fine portion: bundled late fine, recorded as
                //        issued AND paid (it was collected in the cell) ---
                if (fine > 0)
                {
                    string refNo = $"TREAS-{code}-{year:0000}-{monthAbbr}-{memberRef}-FINE";

                    bool fineExists = await _context.Fines
                        .AnyAsync(f => f.GroupMemberId == member.Id &&
                                       f.Period == monthStart &&
                                       f.ReasonType == FineReasonType.LateMonthlyContribution);
                    bool ledgerExists = await _context.LedgerEntries
                        .AnyAsync(l => l.GroupId == groupId &&
                                       l.UserId == member.UserId &&
                                       l.ReferenceNo == refNo);

                    if (fineExists || ledgerExists)
                    {
                        result.EntriesSkippedDuplicate++;
                    }
                    else
                    {
                        var fineAccount = await _accountResolver
                            .GetOrCreateAccountAsync(member.Id, AccountType.Fine);
                        string reason = $"Faini ya kuchelewa mchango wa {monthName} (kutoka Excel ya mtunza-hazina)";

                        // Record the fine exactly as the treasurer's book
                        // had it: levied AND settled that same month. This
                        // is digitising an existing record, not generating
                        // a new fine (Option B).
                        var fineEntity = new Fine
                        {
                            Id = Guid.NewGuid(),
                            GroupId = groupId,
                            GroupMemberId = member.Id,
                            UserId = member.UserId,
                            Amount = fine,
                            ReasonType = FineReasonType.LateMonthlyContribution,
                            Reason = reason,
                            Period = monthStart,
                            IssuedAt = date,
                            AmountPaid = fine,
                            Status = FineStatus.Paid,
                            PaidAt = date
                        };
                        _context.Fines.Add(fineEntity);

                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = groupId,
                            UserId = member.UserId,
                            AccountId = fineAccount.Id,
                            Amount = fine,
                            Type = TransactionType.FineIssue,
                            ReferenceNo = refNo,
                            Description = reason,
                            CreatedAt = date
                        });

                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = groupId,
                            UserId = member.UserId,
                            AccountId = fineAccount.Id,
                            Amount = fine,
                            Type = TransactionType.FinePayment,
                            ReferenceNo = refNo,
                            Description = $"Malipo ya faini ya {monthName} (kutoka Excel ya mtunza-hazina)",
                            CreatedAt = date
                        });

                        result.FinesPosted++;
                        result.TotalFinesAmount += fine;
                    }
                }

                // --- (3) Savings / akiba portion (excess beyond mchango
                //        that is not the late fine) -> AdvanceBalance ---
                if (savings > 0)
                {
                    string refNo = $"TREAS-{code}-{year:0000}-{monthAbbr}-{memberRef}-AKIBA";

                    bool exists = await _context.LedgerEntries
                        .AnyAsync(l => l.GroupId == groupId &&
                                       l.UserId == member.UserId &&
                                       l.ReferenceNo == refNo);
                    if (exists)
                    {
                        result.EntriesSkippedDuplicate++;
                    }
                    else
                    {
                        member.AdvanceBalance += savings;

                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = groupId,
                            UserId = member.UserId,
                            AccountId = savingsAccount.Id,
                            Amount = savings,
                            Type = TransactionType.Contribution,
                            ReferenceNo = refNo,
                            Description = $"Mchango wa ziada (akiba) - {monthName} (kutoka Excel ya mtunza-hazina)",
                            CreatedAt = date
                        });

                        result.SavingsPosted++;
                        result.TotalSavingsAmount += savings;
                    }
                }
            }

            // ---- KIANZIO (joining fee) - separate column, its own entry ----
            if (row.JoiningFee.HasValue && row.JoiningFee.Value > 0)
            {
                string refNo = $"TREAS-{code}-{year:0000}-KIANZIO-{memberRef}";

                bool exists = await _context.LedgerEntries
                    .AnyAsync(l => l.GroupId == groupId &&
                                   l.UserId == member.UserId &&
                                   l.ReferenceNo == refNo);
                if (exists)
                {
                    result.EntriesSkippedDuplicate++;
                }
                else
                {
                    int day = Math.Min(dueDateDay, DateTime.DaysInMonth(year, 1));
                    var date = new DateTime(year, 1, day, 0, 0, 0, DateTimeKind.Utc);

                    _context.LedgerEntries.Add(new LedgerEntry
                    {
                        Id = Guid.NewGuid(),
                        GroupId = groupId,
                        UserId = member.UserId,
                        AccountId = savingsAccount.Id,
                        Amount = row.JoiningFee.Value,
                        Type = TransactionType.JoiningFee,
                        ReferenceNo = refNo,
                        Description = $"Malipo ya Kianzio {year} (kutoka Excel ya mtunza-hazina)",
                        CreatedAt = date
                    });

                    result.JoiningFeesPosted++;
                    result.TotalJoiningFeesAmount += row.JoiningFee.Value;
                }
            }

            // ---- NON ACTIVE -> Inactive (terminal, retained for records) ----
            if (row.IsNonActive && member.Status != MemberStatus.Inactive &&
                member.Status != MemberStatus.Exited)
            {
                member.Status = MemberStatus.Inactive;
                result.MembersMarkedInactive++;
            }

            // ---- MSIBA / SHEREHE: deferred (welfare payouts, need v2) ----
            if (row.Msiba.HasValue && row.Msiba.Value > 0)
            {
                result.MsibaShereheDeferred.Add(
                    $"{row.ExcelName} (safu {row.RowNumber}): MSIBA = TSH {row.Msiba.Value:N0} - imeahirishwa (v2).");
            }
            if (row.Sherehe.HasValue && row.Sherehe.Value > 0)
            {
                result.MsibaShereheDeferred.Add(
                    $"{row.ExcelName} (safu {row.RowNumber}): SHEREHE = TSH {row.Sherehe.Value:N0} - imeahirishwa (v2).");
            }
        }

        await _context.SaveChangesAsync();
        await tx.CommitAsync();

        if (result.MsibaShereheDeferred.Count > 0)
            result.Warnings.Add(
                $"MSIBA/SHEREHE {result.MsibaShereheDeferred.Count} yameahirishwa - ni malipo ya ustawi, sio michango. " +
                "Yatashughulikiwa kwenye v2 baada ya kupokea katiba.");

        if (result.EntriesSkippedDuplicate > 0)
            result.Warnings.Add(
                $"{result.EntriesSkippedDuplicate} entry zimerudiwa (zilikuwa zimeshawekwa - import ni salama kurudia).");

        return result;
    }

    // ---------------------------------------------------------------------
    // Un-bundles a treasurer's monthly cell into its structured parts.
    // The Excel bundles a late fine into the cell (15,000 = 10,000
    // mchango + 5,000 faini), so: contribution = min(amount, monthly
    // target); if the remaining excess equals the group's LateFine it is
    // that month's late fine, otherwise it is akiba (savings/advance).
    // This RECORDS the treasurer's manual allocation - it does not run
    // the live waterfall.
    // ---------------------------------------------------------------------
    internal static (decimal contribution, decimal fine, decimal savings) ComputeSplit(
        decimal amount, decimal monthlyTarget, decimal lateFine)
    {
        decimal contribution = monthlyTarget > 0 ? Math.Min(amount, monthlyTarget) : 0m;
        decimal excess = amount - contribution;
        decimal fine = 0m;
        decimal savings = 0m;

        if (excess > 0 && lateFine > 0 && excess == lateFine)
            fine = lateFine;
        else
            savings = excess;

        return (contribution, fine, savings);
    }

    // ---------------------------------------------------------------------
    private async Task<(Group group, List<GroupMember> members)> LoadGroupAndMembersAsync(Guid groupId)
    {
        var group = await _context.Groups
            .Include(g => g.Settings)
            .FirstOrDefaultAsync(g => g.Id == groupId)
            ?? throw new InvalidOperationException("Kikundi hakikupatikana.");

        var members = await _context.GroupMembers
            .Include(m => m.User)
            .Where(m => m.GroupId == groupId)
            .ToListAsync();

        return (group, members);
    }

    // Helper for the controller: parse a memberOverrides JSON string into
    // a Dictionary<string, Guid>. Accepts {"Excel Name": "<memberId-guid>"}.
    public static Dictionary<string, Guid>? ParseOverrides(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        var doc = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
        if (doc == null) return null;

        var result = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in doc)
        {
            if (Guid.TryParse(kv.Value, out var id))
                result[kv.Key] = id;
        }
        return result.Count == 0 ? null : result;
    }
}
