using ChamaLink.API.Extensions;
using ChamaLink.Application.DTOs;
using ChamaLink.Application.Interfaces;
using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using ChamaLink.Infrastructure;
using ChamaLink.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class MkobaImportController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IMKobaParserService _parserService;
    private readonly AccountResolverService _accountResolver;
    private readonly FineService _fineService;
    private readonly DebtService _debtService;
    private readonly GroupAuthorizationService _groupAuth;

    public MkobaImportController(
        ApplicationDbContext context,
        IMKobaParserService parserService,
        AccountResolverService accountResolver,
        FineService fineService,
        DebtService debtService,
        GroupAuthorizationService groupAuth)
    {
        _context = context;
        _parserService = parserService;
        _accountResolver = accountResolver;
        _fineService = fineService;
        _debtService = debtService;
        _groupAuth = groupAuth;
    }

    // SECURITY FIX (audit 1.8: "M-Koba upload haina group-role control"):
    // an import can create ledger entries, users, members, pay off fines/
    // debts and record withdrawals for an ENTIRE group from one request -
    // this used to need nothing but a valid token and a groupId.
    // PHASE A.5 (Governance unification): who may do this is no longer
    // hardcoded - it reads GovernanceSettings.ImportApproval (defaults to
    // the exact same Treasurer/Chairperson pair as before).
    [HttpPost("upload-statement/{groupId}")]
    public async Task<ActionResult<MKobaImportResultDto>> UploadStatement(Guid groupId, IFormFile file)
    {
        try
        {
            await _groupAuth.RequireGovernanceApprovalAsync(User.GetUserId(), groupId, g => g.ImportApproval);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }

        if (file == null || file.Length == 0)
            return BadRequest("Tafadhali chagua faili la M-Koba.");

        // NEW (Sprint 1 gap #18: Duplicate Import Protection Sijaiona).
        // Per-transaction ReferenceNo duplicate checks already existed
        // further down, but there was no way to know up front "has this
        // exact statement already been uploaded for this group?" before
        // spending time parsing it again. Hashing the raw bytes catches a
        // re-uploaded copy even if it was re-saved/re-named.
        byte[] fileBytes;
        using (var memoryStream = new MemoryStream())
        {
            await file.CopyToAsync(memoryStream);
            fileBytes = memoryStream.ToArray();
        }

        string fileHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(fileBytes));

        bool alreadyImported = await _context.ImportedStatements
            .AnyAsync(s => s.GroupId == groupId && s.FileHash == fileHash);

        if (alreadyImported)
            return BadRequest("Taarifa hii (statement) tayari ilishapakiwa kwa kikundi hiki hapo awali.");

        List<MKobaTransactionItemDto> transactions;
        try
        {
            using var stream = new MemoryStream(fileBytes);
            transactions = await _parserService.ParseStatementAsync(stream);
        }
        catch (Exception ex)
        {
            return BadRequest($"Usomaji wa faili umeshindikana: {ex.Message}");
        }

        if (!transactions.Any())
            return BadRequest("Hakuna miamala iliyoweza kusomwa kutoka kwenye faili hili.");

        var request = new MKobaImportRequestDto
        {
            GroupId = groupId,
            Transactions = transactions
        };

        var response = await ProcessTransactionsInternal(request);

        // Only remember this statement once it has actually been
        // processed successfully - if something failed above, the person
        // should be able to try uploading the same file again.
        _context.ImportedStatements.Add(new ImportedStatement
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            FileHash = fileHash,
            FileName = file.FileName,
            TransactionCount = transactions.Count
        });
        await _context.SaveChangesAsync();

        return response;
    }

    private async Task<ActionResult<MKobaImportResultDto>> ProcessTransactionsInternal(MKobaImportRequestDto request)
    {
        var result = new MKobaImportResultDto
        {
            TotalSubmitted = request.Transactions.Count
        };

        // Fetch group details and active settings
        var group = await _context.Groups
            .Include(g => g.Settings)
            .FirstOrDefaultAsync(g => g.Id == request.GroupId);

        if (group == null)
            return BadRequest("Kikundi hakikupatikana.");

        // BUG FIX: this used to grab "the first Account row in the whole
        // database" and use it for EVERY member's transactions. That mixed
        // up money between different members (and even different groups),
        // because Accounts are supposed to be per-member. There is no more
        // single "defaultAccount" - each member now gets their own Savings,
        // Fine, and SocialFund accounts further down, resolved through
        // AccountResolverService.

        // Fetch active event if applicable
        GroupEvent? activeEvent = null;
        if (group.Type == GroupType.EventBased || group.Type == GroupType.Hybrid)
        {
            activeEvent = await _context.GroupEvents
                .FirstOrDefaultAsync(e => e.GroupId == request.GroupId && e.IsActive);
        }

        foreach (var item in request.Transactions)
        {
            // NEW: M-Koba statements also contain "Withdraw / Transfer fund"
            // rows - money leaving the group's mobile wallet (e.g. the
            // treasurer paying out a loan in cash). These are NOT a
            // member's deposit and must never be run through the deposit
            // waterfall below (fine -> event -> savings -> advance), or a
            // withdrawal would wrongly get counted as that member's
            // contribution. Instead, each one is saved to WalletWithdrawals
            // so it isn't lost once this import response closes - the
            // treasurer can view and reconcile them later via
            // GET/PATCH /api/MkobaImport/withdrawals/{groupId}.
            if (item.IsWithdrawal)
            {
                bool isDuplicateWithdrawal = await _context.WalletWithdrawals
                    .AnyAsync(w => w.GroupId == request.GroupId && w.ReferenceNo == item.ReferenceNumber);

                if (isDuplicateWithdrawal)
                {
                    result.IgnoredDuplicates++;
                    result.Warnings.Add($"Muamala Ref: {item.ReferenceNumber} (Withdraw) umeachwa kwa sababu tayari upo.");
                    continue;
                }

                _context.WalletWithdrawals.Add(new WalletWithdrawal
                {
                    Id = Guid.NewGuid(),
                    GroupId = request.GroupId,
                    ReferenceNo = item.ReferenceNumber,
                    MemberName = item.MemberName,
                    PhoneNumber = item.PhoneNumber,
                    Amount = item.Amount,
                    TransactionDate = item.TransactionDate
                });

                result.WithdrawalsSkipped++;
                result.Warnings.Add(
                    $"Muamala Ref: {item.ReferenceNumber} ni Withdraw/Transfer fund ya {item.Amount:N0} TZS - " +
                    "imehifadhiwa kwenye kumbukumbu za withdrawal, haikuwekwa kama mchango wa mwanachama.");
                continue;
            }

            bool isDuplicate = await _context.LedgerEntries
                .AnyAsync(l => l.GroupId == request.GroupId && l.ReferenceNo == item.ReferenceNumber);

            if (isDuplicate)
            {
                result.IgnoredDuplicates++;
                result.Warnings.Add($"Muamala Ref: {item.ReferenceNumber} umeachwa kwa sababu tayari upo.");
                continue;
            }

            string cleanPhone = item.PhoneNumber.Replace(" ", "").Replace("+", "");
            if (cleanPhone.StartsWith("0"))
            {
                cleanPhone = "255" + cleanPhone.Substring(1);
            }

            var member = await _context.GroupMembers
                .Include(m => m.User)
                .FirstOrDefaultAsync(m => m.GroupId == request.GroupId && 
                                         m.User != null && 
                                         (m.User.PhoneNumber == cleanPhone || 
                                          m.User.PhoneNumber.EndsWith(cleanPhone.Substring(Math.Max(0, cleanPhone.Length - 9)))));

            if (member == null)
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.PhoneNumber == cleanPhone);
                if (user == null)
                {
                    // UPDATED: the parser now extracts the real name printed
                    // on the statement (e.g. "Lupyana Wililo") instead of a
                    // fixed placeholder, so we can use it directly. We only
                    // fall back to a phone-based name in the rare case the
                    // row's name field came through blank, so the member is
                    // still identifiable instead of getting an empty name.
                    string fullName = string.IsNullOrWhiteSpace(item.MemberName)
                        ? $"Mwanachama {cleanPhone}"
                        : item.MemberName;

                    user = new User
                    {
                        Id = Guid.NewGuid(),
                        PhoneNumber = cleanPhone,
                        FullName = fullName
                    };
                    _context.Users.Add(user);
                    await _context.SaveChangesAsync();
                }

                member = new GroupMember
                {
                    Id = Guid.NewGuid(),
                    GroupId = request.GroupId,
                    UserId = user.Id,
                    Status = MemberStatus.New,
                    TotalContributionsCount = 0,
                    JoinedAt = DateTime.UtcNow
                };
                _context.GroupMembers.Add(member);
                await _context.SaveChangesAsync();
            }

            // BUG FIX: each of these used to point at the single shared
            // "defaultAccount". Now every member gets their own real
            // Savings, Fine and SocialFund (welfare/event) accounts.
            var savingsAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.Savings);
            var eventAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.SocialFund);

            decimal remainingAmount = item.Amount;

            // -------------------------------------------------------------
            // STEP 0.5: Automatic Late-Contribution Fine (audit item:
            // "LateFine field exists but nothing ever issues one").
            //
            // A group's leader sets its own contribution window via
            // Settings (DueDateDay + GracePeriodDays - e.g. Ukonga's is
            // "pay by the 5th, no extra grace"). If this transaction is
            // the member's FIRST recorded contribution for its calendar
            // month, and it lands after that cutoff day, a Fine is issued
            // automatically - once per member per month - before Step 1
            // below runs, so it can be paid down immediately out of this
            // same deposit (e.g. 15,000 = 10,000 contribution + 5,000
            // fine, exactly as the group already tracks it by hand).
            // -------------------------------------------------------------
            if (group.Type == GroupType.MonthlySavings || group.Type == GroupType.Hybrid)
            {
                decimal lateFineAmount = group.Settings?.Contribution.LateFine ?? 0m;

                if (lateFineAmount > 0)
                {
                    DateTime finePeriodStart = new DateTime(item.TransactionDate.Year, item.TransactionDate.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                    DateTime finePeriodEnd = finePeriodStart.AddMonths(1);

                    bool alreadyContributedThisMonth = await _context.LedgerEntries
                        .AnyAsync(l => l.GroupId == request.GroupId &&
                                       l.UserId == member.UserId &&
                                       l.Type == TransactionType.Contribution &&
                                       l.CreatedAt >= finePeriodStart && l.CreatedAt < finePeriodEnd);

                    bool alreadyFinedThisMonth = await _context.Fines
                        .AnyAsync(f => f.GroupMemberId == member.Id &&
                                       f.ReasonType == FineReasonType.LateMonthlyContribution &&
                                       f.Period == finePeriodStart);

                    int dueDateDay = group.Settings?.Contribution.DueDateDay ?? 5;
                    int graceDays = group.Settings?.Contribution.GracePeriodDays ?? 0;
                    int cutoffDay = dueDateDay + graceDays;

                    bool isLate = item.TransactionDate.Day > cutoffDay;

                    if (!alreadyContributedThisMonth && !alreadyFinedThisMonth && isLate)
                    {
                        await _fineService.IssueFineAsync(
                            request.GroupId,
                            member.Id,
                            member.UserId,
                            lateFineAmount,
                            FineReasonType.LateMonthlyContribution,
                            $"Kuchelewa kuchangia mchango wa {finePeriodStart:MMMM yyyy} (baada ya tarehe {cutoffDay})",
                            period: finePeriodStart);

                        result.Warnings.Add(
                            $"{member.User?.FullName ?? item.MemberName}: fine ya TSH {lateFineAmount:N0} imetozwa " +
                            $"kwa kuchelewa kuchangia mwezi wa {finePeriodStart:MMMM yyyy}.");
                    }
                }
            }

            // -------------------------------------------------------------
            // STEP 1: Fine Payment (Priority 1 - kwa Mwanachama Binafsi)
            //
            // BUG FIX: this used to net FineIssue/FinePayment ledger rows
            // by hand, scoped to "the fine account" - which, for fines
            // created by WelfarePenaltyBackgroundService, was actually the
            // SocialFund account, not the Fine account, so those fines were
            // invisible here. FineService is now the single source of
            // truth for both issuing and paying down fines, so this always
            // sees every fine regardless of who issued it.
            // -------------------------------------------------------------
            decimal pendingFine = await _fineService.GetPendingFineTotalAsync(member.Id);

            if (pendingFine > 0 && remainingAmount > 0)
            {
                decimal fineDeduction = await _fineService.ApplyPaymentAsync(
                    request.GroupId, member.Id, member.UserId, remainingAmount,
                    item.ReferenceNumber, item.TransactionDate);

                remainingAmount -= fineDeduction;
                result.TotalFinesDeducted += fineDeduction;
            }

            // -------------------------------------------------------------
            // STEP 2: Event Contribution (Priority 2 - Hybrid / EventBased)
            // -------------------------------------------------------------
            if (activeEvent != null && remainingAmount > 0)
            {
                // BUG FIX: this used to re-sum LedgerEntries filtered by a
                // Description string containing the event's Id - fragile,
                // and wholly dependent on TargetAmountPerMember (which was
                // always 0 before the EventService fix above). It now reads
                // the member's own EventContribution row directly.
                var eventContribution = await _context.EventContributions
                    .FirstOrDefaultAsync(ec => ec.GroupEventId == activeEvent.Id && ec.GroupMemberId == member.Id);

                if (eventContribution == null)
                {
                    // Member was discovered/added to the group during this
                    // same import, after the event was already triggered -
                    // give them the same expectation as everyone else.
                    eventContribution = new EventContribution
                    {
                        Id = Guid.NewGuid(),
                        GroupEventId = activeEvent.Id,
                        GroupMemberId = member.Id,
                        UserId = member.UserId,
                        ExpectedAmount = activeEvent.TargetAmountPerMember,
                        PaidAmount = 0m,
                        Status = EventContributionStatus.Pending
                    };
                    _context.EventContributions.Add(eventContribution);
                }

                decimal eventPending = Math.Max(0m, eventContribution.ExpectedAmount - eventContribution.PaidAmount);

                if (eventPending > 0)
                {
                    decimal amountToApply = Math.Min(remainingAmount, eventPending);

                    _context.LedgerEntries.Add(new LedgerEntry
                    {
                        Id = Guid.NewGuid(),
                        GroupId = request.GroupId,
                        UserId = member.UserId,
                        AccountId = eventAccount.Id,
                        Amount = amountToApply,
                        Type = TransactionType.EventContribution,
                        ReferenceNo = item.ReferenceNumber,
                        Description = $"Mchango wa Event [{activeEvent.Title}] (Ref: {activeEvent.Id}) via Ref: {item.ReferenceNumber}",
                        CreatedAt = item.TransactionDate
                    });

                    eventContribution.PaidAmount += amountToApply;
                    eventContribution.LastPaidAt = item.TransactionDate;
                    eventContribution.Status = eventContribution.PaidAmount >= eventContribution.ExpectedAmount
                        ? EventContributionStatus.Paid
                        : EventContributionStatus.PartiallyPaid;

                    remainingAmount -= amountToApply;
                }
            }

            // -------------------------------------------------------------
            // STEP 3: Monthly Savings (Priority 3 - Hybrid / MonthlySavings)
            // -------------------------------------------------------------
            if ((group.Type == GroupType.MonthlySavings || group.Type == GroupType.Hybrid) && remainingAmount > 0)
            {
                // BUG FIX: was reading MonthlyContributionAmount, a field that
                // GroupService never actually set when a group was created
                // (it always stayed 0). Now reads MonthlyContribution, the
                // one field that is actually kept up to date.
                decimal monthlyTarget = group.Settings?.Contribution.MonthlyContribution ?? 0m;

                if (monthlyTarget > 0)
                {
                    DateTime monthStart = new DateTime(item.TransactionDate.Year, item.TransactionDate.Month, 1, 0, 0, 0, DateTimeKind.Utc);

                    var monthlyPaid = await _context.LedgerEntries
                        .Where(l => l.GroupId == request.GroupId && 
                                    l.UserId == member.UserId && 
                                    l.AccountId == savingsAccount.Id && 
                                    l.Type == TransactionType.Contribution && 
                                    l.CreatedAt >= monthStart)
                        .SumAsync(l => (decimal?)l.Amount) ?? 0m;

                    decimal monthlyPending = Math.Max(0m, monthlyTarget - monthlyPaid);

                    if (monthlyPending > 0)
                    {
                        decimal contributionToApply = Math.Min(remainingAmount, monthlyPending);

                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = request.GroupId,
                            UserId = member.UserId,
                            AccountId = savingsAccount.Id,
                            Amount = contributionToApply,
                            Type = TransactionType.Contribution,
                            ReferenceNo = item.ReferenceNumber,
                            Description = $"Akiba ya Mwezi kutoka M-Koba (Ref: {item.ReferenceNumber})",
                            CreatedAt = item.TransactionDate
                        });

                        remainingAmount -= contributionToApply;

                        // A1 (updated per Ukonga Rules Specification v1.2,
                        // sehemu 4 — NonActiveHandling = ManualReview):
                        // status is derived from activity, but recovery from
                        // NonActive is deliberately NOT automatic. This now
                        // handles only two transitions:
                        //   New → Active        (first-ever contribution)
                        //   Warning → Active    (caught up after a shortfall,
                        //                        matches the same
                        //                        ConsecutiveMissedMonths=0
                        //                        recovery rule the background
                        //                        service applies - sehemu 4)
                        // Inactive (= "NonActive" in the spec) is NOT
                        // auto-cleared by a contribution anymore: "ENGINE
                        // INASIMAMA HAPO... Haifanyi automatic reactivation" -
                        // a single M-Koba payment does not, by itself, prove
                        // the member has caught up on everything leadership
                        // needs to review. Reactivating an Inactive member is
                        // a manual leadership decision (Reactivate / Keep
                        // NonActive / Remove) - not yet exposed as an
                        // endpoint; that is separate follow-up work, not part
                        // of this Phase 2 status-engine change. Suspended and
                        // Exited remain administrative statuses that only
                        // leadership can set/clear either way.
                        member.TotalContributionsCount += 1;

                        if (member.Status == MemberStatus.New ||
                            member.Status == MemberStatus.Warning)
                        {
                            member.Status = MemberStatus.Active;
                        }
                    }
                }
            }

            // -------------------------------------------------------------
            // STEP 3.4: JoiningFee (audit item: "unenforced JoiningFee" -
            // FinancialSettings.JoiningFee was a target amount that nothing
            // ever tracked or collected against).
            //
            // Any money left after this month's own contribution target is
            // met goes toward the member's outstanding KIANZIO balance
            // before it is treated as personal Advance Balance - matching
            // how the group already runs this by hand ("akiweka kuzidi
            // kama sio fine basi ikatwe kwenye joinfee").
            // -------------------------------------------------------------
            if (remainingAmount > 0)
            {
                decimal joiningFeeTarget = group.Settings?.Financial.JoiningFee ?? 0m;

                if (joiningFeeTarget > 0)
                {
                    decimal joiningFeePaid = await _context.LedgerEntries
                        .Where(l => l.GroupId == request.GroupId &&
                                    l.UserId == member.UserId &&
                                    l.Type == TransactionType.JoiningFee)
                        .SumAsync(l => (decimal?)l.Amount) ?? 0m;

                    decimal joiningFeePending = Math.Max(0m, joiningFeeTarget - joiningFeePaid);

                    if (joiningFeePending > 0)
                    {
                        decimal joiningFeeToApply = Math.Min(remainingAmount, joiningFeePending);

                        _context.LedgerEntries.Add(new LedgerEntry
                        {
                            Id = Guid.NewGuid(),
                            GroupId = request.GroupId,
                            UserId = member.UserId,
                            AccountId = savingsAccount.Id,
                            Amount = joiningFeeToApply,
                            Type = TransactionType.JoiningFee,
                            ReferenceNo = item.ReferenceNumber,
                            Description = $"Malipo ya Kianzio (Ref: {item.ReferenceNumber})",
                            CreatedAt = item.TransactionDate
                        });

                        remainingAmount -= joiningFeeToApply;
                    }
                }
            }

            // -------------------------------------------------------------
            // STEP 3.5: Old Debt Clearance (Sprint 1 gap: Debt Table Haipo)
            //
            // Any money left after this month's own target is met should
            // first clear the member's oldest outstanding Debt (a shortfall
            // from a previous month), before falling through to Advance
            // Balance. Debt clearance itself is not a new LedgerEntry - it
            // is tracked on the Debt row - but it must still count as this
            // member's money being used up, otherwise it would be counted
            // twice (once as Debt clearance, once as Advance Balance).
            // -------------------------------------------------------------
            if (remainingAmount > 0)
            {
                decimal debtCleared = await _debtService.ClearWithPaymentAsync(member.Id, remainingAmount);

                if (debtCleared > 0)
                {
                    _context.LedgerEntries.Add(new LedgerEntry
                    {
                        Id = Guid.NewGuid(),
                        GroupId = request.GroupId,
                        UserId = member.UserId,
                        AccountId = savingsAccount.Id,
                        Amount = debtCleared,
                        Type = TransactionType.Contribution,
                        ReferenceNo = item.ReferenceNumber,
                        Description = $"Kulipa deni la mchango uliopita (Ref: {item.ReferenceNumber})",
                        CreatedAt = item.TransactionDate
                    });

                    remainingAmount -= debtCleared;
                }
            }

            // -------------------------------------------------------------
            // STEP 4: Advance Balance (Priority 4 - Salio la Ziada)
            // -------------------------------------------------------------
            if (remainingAmount > 0)
            {
                member.AdvanceBalance += remainingAmount;

                _context.LedgerEntries.Add(new LedgerEntry
                {
                    Id = Guid.NewGuid(),
                    GroupId = request.GroupId,
                    UserId = member.UserId,
                    AccountId = savingsAccount.Id,
                    Amount = remainingAmount,
                    Type = TransactionType.Contribution,
                    ReferenceNo = item.ReferenceNumber,
                    Description = $"Mchango wa ziada (Advance Balance) kutoka M-Koba (Ref: {item.ReferenceNumber})",
                    CreatedAt = item.TransactionDate
                });

                result.TotalWelfareAdded += remainingAmount;
            }

            result.SuccessfullyProcessed++;
        }

        await _context.SaveChangesAsync();
        return Ok(result);
    }

    // NEW: lets the treasurer see every withdrawal that has been imported
    // from M-Koba statements for this group, newest first.
    //
    // SECURITY FIX (audit Stage 1 #8): the comment above always said
    // "the treasurer", but the check used was plain RequireMembershipAsync
    // - so any ordinary member could pull the raw M-Koba wallet withdrawal
    // history (phone numbers, member names, amounts).
    // PHASE A.5 (Governance unification): now reads GovernanceSettings.ImportApproval.
    [HttpGet("withdrawals/{groupId}")]
    public async Task<ActionResult<List<WalletWithdrawalDto>>> GetWithdrawals(Guid groupId)
    {
        try
        {
            await _groupAuth.RequireGovernanceApprovalAsync(User.GetUserId(), groupId, g => g.ImportApproval);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }

        var withdrawals = await _context.WalletWithdrawals
            .Where(w => w.GroupId == groupId)
            .OrderByDescending(w => w.TransactionDate)
            .Select(w => new WalletWithdrawalDto(
                w.Id, w.GroupId, w.ReferenceNo, w.MemberName, w.PhoneNumber,
                w.Amount, w.TransactionDate, w.IsReconciled, w.ReconciliationNote))
            .ToListAsync();

        return Ok(withdrawals);
    }

    // NEW: lets the treasurer record what a withdrawal was actually for
    // (e.g. "loan payout to Juma"), once they have checked it manually.
    //
    // SECURITY FIX: reconciling touches the group's financial records
    // (confirms what real money leaving the wallet was for) - restricted
    // to the same policy trusted to upload the statement in the first
    // place (PHASE A.5: GovernanceSettings.ImportApproval).
    [HttpPatch("withdrawals/{withdrawalId}/reconcile")]
    public async Task<IActionResult> ReconcileWithdrawal(Guid withdrawalId, [FromBody] ReconcileWithdrawalDto dto)
    {
        var withdrawal = await _context.WalletWithdrawals.FindAsync(withdrawalId);
        if (withdrawal == null)
            return NotFound(new { message = "Withdrawal haikupatikana." });

        try
        {
            await _groupAuth.RequireGovernanceApprovalAsync(User.GetUserId(), withdrawal.GroupId, g => g.ImportApproval);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }

        withdrawal.IsReconciled = true;
        withdrawal.ReconciliationNote = dto.Note;
        await _context.SaveChangesAsync();

        return Ok(new { message = "Withdrawal imehakikiwa kikamilifu." });
    }
}