using ChamaLink.Application.DTOs;
using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

public class LedgerService
{
    private readonly ApplicationDbContext _context;
    private readonly AccountResolverService _accountResolver;

    public LedgerService(ApplicationDbContext context, AccountResolverService accountResolver)
    {
        _context = context;
        _accountResolver = accountResolver;
    }

    public async Task<LedgerResponseDto> RecordContributionAsync(RecordContributionDto dto)
    {
        var groupMember = await _accountResolver.GetGroupMemberAsync(dto.GroupId, dto.MemberId);

        var account = await _accountResolver.GetOrCreateAccountAsync(groupMember.Id, AccountType.Savings);

        var entry = new LedgerEntry
        {
            Id = Guid.NewGuid(),
            GroupId = dto.GroupId,
            AccountId = account.Id,
            Amount = dto.Amount,
            Type = TransactionType.Contribution,
            ReferenceNo = dto.ReferenceNo,
            Description = dto.Description ?? "Monthly Savings Contribution"
        };

        _context.LedgerEntries.Add(entry);
        await _context.SaveChangesAsync();

        return new LedgerResponseDto(entry.Id, entry.GroupId, entry.AccountId, entry.Amount, entry.Type.ToString(), entry.ReferenceNo, entry.CreatedAt);
    }

    // NOTE: IssueLoanAsync/RepayLoanAsync used to live here. Removed in
    // favour of LoanService, which does the same LedgerEntry bookkeeping
    // (same AccountType.Loan account, same TransactionType values) AND
    // keeps a structured Loan row (interest, due date, status) in sync -
    // this method never did that, so a loan issued through it was
    // invisible to the Loan Portfolio Report. GetGroupSummaryAsync and
    // GetMemberStatementAsync below are unaffected - they read
    // LedgerEntries directly, which LoanService still writes to.

    // The old private GetOrCreateAccountAsync method was removed from here.
    // That logic now lives in one shared place: AccountResolverService.
    // All calls in this file now use _accountResolver.GetOrCreateAccountAsync(...) instead.

    public async Task<GroupSummaryDto> GetGroupSummaryAsync(Guid groupId)
{
    var totalSavings = await _context.LedgerEntries
        .Where(e => e.GroupId == groupId && e.Type == TransactionType.Contribution)
        .SumAsync(e => e.Amount);

    var totalLoans = await _context.LedgerEntries
        .Where(e => e.GroupId == groupId && e.Type == TransactionType.LoanDisbursement)
        .SumAsync(e => e.Amount);

    var totalMembers = await _context.GroupMembers
        .CountAsync(m => m.GroupId == groupId);

    return new GroupSummaryDto(groupId, totalSavings, totalLoans, totalMembers);
}

public async Task<MemberStatementDto> GetMemberStatementAsync(Guid groupId, Guid userId)
{
    var groupMember = await _context.GroupMembers
        .FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId)
        ?? throw new Exception("Mwanachama hajapatikana.");

    var accounts = await _context.Accounts
        .Where(a => a.GroupMemberId == groupMember.Id)
        .Select(a => a.Id)
        .ToListAsync();

    var entries = await _context.LedgerEntries
        .Where(e => accounts.Contains(e.AccountId))
        .OrderByDescending(e => e.CreatedAt)
        .Select(e => new LedgerResponseDto(
            e.Id,
            e.GroupId,
            e.AccountId,
            e.Amount,
            e.Type.ToString(),
            e.ReferenceNo,
            e.CreatedAt
        ))
        .ToListAsync();

    var totalSavings = entries.Where(e => e.Type == TransactionType.Contribution.ToString()).Sum(e => e.Amount);
    
    // Hesabu za Mkopo: Mikopo iliyochukuliwa kutoa iliyorejeshwa
    var totalDisbursed = entries.Where(e => e.Type == TransactionType.LoanDisbursement.ToString()).Sum(e => e.Amount);
    var totalRepaid = entries.Where(e => e.Type == TransactionType.LoanRepayment.ToString()).Sum(e => e.Amount);
    var outstandingLoan = totalDisbursed - totalRepaid;

    return new MemberStatementDto(userId, totalSavings, outstandingLoan, entries);
}
}