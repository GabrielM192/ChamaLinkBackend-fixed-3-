using ChamaLink.Application.DTOs;
using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

// NEW (Reports Engine gap: Loan Portfolio Report / Member Financial
// Profile loan section). The only place that should create a Loan or
// record a repayment against one - always keeps the structured Loan row
// and the member's AccountType.Loan ledger rows in sync, the same
// pairing FineService keeps between Fine and the Fine account.
public class LoanService
{
    private readonly ApplicationDbContext _context;
    private readonly AccountResolverService _accountResolver;
    private readonly GroupAuthorizationService _authorization;

    public LoanService(
        ApplicationDbContext context,
        AccountResolverService accountResolver,
        GroupAuthorizationService authorization)
    {
        _context = context;
        _accountResolver = accountResolver;
        _authorization = authorization;
    }

    // SECURITY FIX (audit 1.5: "Loan issuing haina role authorization" +
    // "user anaweza kutuma IssuedByGroupMemberId ya Treasurer"): the
    // actor is now always the authenticated caller (actorUserId from
    // JWT), resolved to their own GroupMember row, and must hold a role
    // trusted to issue money out of the group - not whoever the request
    // claimed they were.
    // PHASE A.5 (Governance unification): which role(s) count as
    // "trusted" is no longer hardcoded here - it now reads the group's
    // own GovernanceSettings.LoanApproval (see GroupAuthorizationService.
    // RequireGovernanceApprovalAsync). A group that has never touched
    // this setting gets the exact same Treasurer/Chairperson gate as
    // before, since that is LoanApproval's default.
    public async Task<Loan> IssueLoanAsync(Guid groupId, IssueLoanDto dto, Guid actorUserId)
    {
        var member = await _context.GroupMembers
            .FirstOrDefaultAsync(m => m.Id == dto.GroupMemberId && m.GroupId == groupId)
            ?? throw new Exception("Anayekopeshwa si mwanachama wa kikundi hiki.");

        var issuedBy = await _authorization.RequireGovernanceApprovalAsync(
            actorUserId, groupId, g => g.LoanApproval);

        if (dto.PrincipalAmount <= 0)
            throw new Exception("Kiasi cha mkopo lazima kiwe zaidi ya sifuri.");

        var settings = await _context.GroupSettings.FirstOrDefaultAsync(s => s.GroupId == groupId);

        // LOAN ENGINE V2 (second audit round, item B continued):
        // RepaymentDays existed since the Owned Types refactor but
        // nothing read it either - IssueLoanDto.DueDate was required, so
        // every caller had to compute their own due date by hand instead
        // of the group's own default doing it for them. DueDate is now
        // optional; when omitted, RepaymentDays fills it in.
        DateTime dueDate = dto.DueDate ?? DateTime.UtcNow.AddDays(settings?.Loan.RepaymentDays ?? 30);

        if (dueDate <= DateTime.UtcNow)
            throw new Exception("Tarehe ya kurejesha mkopo lazima iwe siku zijazo.");

        // LOAN ENGINE V2 (second audit round, item B): LoanSettings.Enabled
        // and MaxLoanMultiplier existed in the database since the Owned
        // Types refactor but nothing in LoanService actually read them -
        // a group could set Enabled=false or a tight MaxLoanMultiplier and
        // it would have zero effect. Wired in now, at the same point
        // InterestRate is already being read from these same settings.
        if (settings != null && !settings.Loan.Enabled)
            throw new Exception("Mikopo haijaruhusiwa kwenye kikundi hiki kwa sasa.");

        decimal rate = dto.InterestRateOverride ?? settings?.Loan.InterestRate ?? 0m;
        decimal interest = Math.Round(dto.PrincipalAmount * rate / 100m, 2);

        // MaxLoanMultiplier is nullable - null/not-set means "no limit".
        // Only enforce when a group has actually set one. Checks total
        // exposure (existing outstanding loans + this new one), not just
        // this loan alone, so someone can't get around the cap by taking
        // several loans that are each individually small.
        if (settings?.Loan.MaxLoanMultiplier is decimal multiplier && multiplier > 0)
        {
            var savingsAccount = await _context.Accounts
                .FirstOrDefaultAsync(a => a.GroupMemberId == member.Id && a.Type == AccountType.Savings);

            decimal savingsBalance = savingsAccount == null ? 0m : await _context.LedgerEntries
                .Where(l => l.AccountId == savingsAccount.Id && l.Type == TransactionType.Contribution)
                .SumAsync(l => (decimal?)l.Amount) ?? 0m;

            // BUG CAUGHT BEFORE SHIPPING: Loan.OutstandingBalance is a
            // computed C# property (TotalPayable - AmountRepaid), not a
            // mapped column - EF Core cannot translate it inside
            // SumAsync(). Summing the underlying real columns instead
            // (PrincipalAmount + InterestAmount - AmountRepaid) is the
            // same value, but something the database can actually compute.
            decimal existingOutstanding = await _context.Loans
                .Where(l => l.GroupMemberId == member.Id &&
                            l.Status != LoanStatus.Repaid && l.Status != LoanStatus.Defaulted)
                .SumAsync(l => (decimal?)(l.PrincipalAmount + l.InterestAmount - l.AmountRepaid)) ?? 0m;

            decimal maxAllowed = savingsBalance * multiplier;
            decimal totalExposureAfterThisLoan = existingOutstanding + dto.PrincipalAmount;

            if (totalExposureAfterThisLoan > maxAllowed)
            {
                throw new Exception(
                    $"Mkopo unazidi kiwango kinachoruhusiwa. Akiba yako ni Tsh {savingsBalance:N2}, " +
                    $"kiwango cha juu cha mkopo ni mara {multiplier} ya akiba " +
                    $"(Tsh {maxAllowed:N2}). Una deni lililopo la Tsh {existingOutstanding:N2}.");
            }
        }

        var loan = new Loan
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            GroupMemberId = member.Id,
            UserId = member.UserId,
            PrincipalAmount = dto.PrincipalAmount,
            InterestRate = rate,
            InterestAmount = interest,
            Purpose = dto.Purpose,
            DueDate = dueDate,
            IssuedByGroupMemberId = issuedBy.Id,
            DisbursedAt = DateTime.UtcNow
        };

        _context.Loans.Add(loan);

        // TRANSACTION FIX (audit 3.3/6.3: "GetOrCreateAccountAsync inaita
        // SaveChangesAsync() yenyewe, jambo linalovunja transaction
        // boundary ya operation kubwa"): without an explicit transaction
        // here, GetOrCreateAccountAsync's own internal SaveChangesAsync
        // call below would commit a brand-new Account to the database on
        // its own, *before* the Loan and LedgerEntry are saved a few
        // lines later. If something then failed before the final
        // SaveChangesAsync, the member would be left with an orphaned
        // Loan-type Account and no actual loan or ledger record - a
        // partial write. Wrapping the whole method in one explicit
        // transaction means every SaveChangesAsync call on this
        // DbContext (including the one inside GetOrCreateAccountAsync)
        // now participates in the same transaction, so it is all-or-
        // nothing: either the account, the loan and the ledger entry are
        // all committed together, or none of them are.
        using var transaction = await _context.Database.BeginTransactionAsync();

        var loanAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.Loan);
        _context.LedgerEntries.Add(new LedgerEntry
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            AccountId = loanAccount.Id,
            UserId = member.UserId,
            Amount = dto.PrincipalAmount,
            Type = TransactionType.LoanDisbursement,
            Description = dto.Purpose ?? "Mkopo",
            CreatedAt = loan.DisbursedAt
        });

        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return loan;
    }

    // Applies a payment toward a single loan's TotalPayable (principal +
    // interest). Overpaying beyond what is owed is rejected rather than
    // silently accepted, so a treasurer notices the mistake immediately
    // instead of it showing up as a mystery credit later.
    // SECURITY FIX (audit Stage 1 #5-6 follow-up): this took no actor at
    // all before - any bearer token could record a repayment against any
    // loan in any group, with no membership or role check whatsoever.
    // Same trust boundary as IssueLoanAsync/MarkDefaultedAsync: only
    // whoever GovernanceSettings.LoanApproval names for this group (see
    // PHASE A.5 comment on IssueLoanAsync) may record money coming back in.
    public async Task<Loan> RecordRepaymentAsync(Guid loanId, RecordLoanRepaymentDto dto, Guid actorUserId)
    {
        var loan = await _context.Loans.FirstOrDefaultAsync(l => l.Id == loanId)
            ?? throw new Exception("Mkopo haukupatikana.");

        await _authorization.RequireGovernanceApprovalAsync(actorUserId, loan.GroupId, g => g.LoanApproval);

        if (loan.Status == LoanStatus.Repaid)
            throw new Exception("Mkopo huu tayari umeshalipwa kikamilifu.");

        if (dto.Amount <= 0)
            throw new Exception("Kiasi cha malipo lazima kiwe zaidi ya sifuri.");

        if (dto.Amount > loan.OutstandingBalance)
            throw new Exception($"Kiasi kimezidi deni lililobaki (Tsh {loan.OutstandingBalance:N2}).");

        var paidAt = DateTime.UtcNow;
        loan.AmountRepaid += dto.Amount;

        if (loan.AmountRepaid >= loan.TotalPayable)
        {
            loan.Status = LoanStatus.Repaid;
            loan.RepaidAt = paidAt;
        }

        // TRANSACTION FIX (audit 3.3/6.3) - same reasoning as
        // IssueLoanAsync above: keeps the loan/account/ledger writes
        // atomic instead of letting GetOrCreateAccountAsync's own
        // internal SaveChangesAsync commit independently.
        using var transaction = await _context.Database.BeginTransactionAsync();

        var loanAccount = await _accountResolver.GetOrCreateAccountAsync(loan.GroupMemberId, AccountType.Loan);
        _context.LedgerEntries.Add(new LedgerEntry
        {
            Id = Guid.NewGuid(),
            GroupId = loan.GroupId,
            AccountId = loanAccount.Id,
            UserId = loan.UserId,
            Amount = dto.Amount,
            Type = TransactionType.LoanRepayment,
            ReferenceNo = dto.ReferenceNo,
            Description = $"Malipo ya mkopo (Ref: {dto.ReferenceNo})",
            CreatedAt = paidAt
        });

        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return loan;
    }

    // A deliberate leader decision that a loan will not be recovered -
    // never automatic, the same reasoning as Fine/Debt.Waived.
    //
    // SECURITY FIX (audit 8.7: "MarkDefaulted haina proper approval"):
    // was callable by anyone with a token before. Same role requirement
    // as issuing the loan in the first place (PHASE A.5: GovernanceSettings.LoanApproval).
    public async Task<Loan> MarkDefaultedAsync(Guid loanId, Guid actorUserId)
    {
        var loan = await _context.Loans.FirstOrDefaultAsync(l => l.Id == loanId)
            ?? throw new Exception("Mkopo haukupatikana.");

        await _authorization.RequireGovernanceApprovalAsync(
            actorUserId, loan.GroupId, g => g.LoanApproval);

        if (loan.Status == LoanStatus.Repaid)
            throw new Exception("Mkopo huu tayari umeshalipwa - hauwezi kuwekwa kama umeshindikana.");

        loan.Status = LoanStatus.Defaulted;
        await _context.SaveChangesAsync();
        return loan;
    }

    // BUG FIX: this used to return Loans with no Include at all, so
    // LoanController.ToDto's `l.GroupMember?.User?.FullName` was always
    // null on every response - the name simply never loaded.
    //
    // SECURITY FIX (audit Stage 1 #5): this had no membership check at
    // all before - any authenticated user (of any group, or none) could
    // list every loan of any group just by guessing/enumerating a
    // groupId. Now the caller must actually belong to the group whose
    // loans they're asking for.
    public async Task<List<Loan>> GetByGroupAsync(Guid groupId, Guid actorUserId)
    {
        await _authorization.RequireMembershipAsync(actorUserId, groupId);

        return await _context.Loans
            .Include(l => l.GroupMember).ThenInclude(m => m!.User)
            .Where(l => l.GroupId == groupId)
            .OrderByDescending(l => l.DisbursedAt)
            .ToListAsync();
    }

    // SECURITY FIX (audit Stage 1 #6 follow-up): same gap as
    // GetByGroupAsync - no check that the caller belongs to the group
    // the target member's loans live in. We resolve the target member's
    // own group first (a GroupMemberId doesn't carry its GroupId on the
    // wire), then require the caller to be a member of that same group.
    public async Task<List<Loan>> GetByMemberAsync(Guid groupMemberId, Guid actorUserId)
    {
        var targetMember = await _context.GroupMembers.FirstOrDefaultAsync(m => m.Id == groupMemberId)
            ?? throw new Exception("Mwanachama haukupatikana.");

        await _authorization.RequireMembershipAsync(actorUserId, targetMember.GroupId);

        return await _context.Loans
            .Include(l => l.GroupMember).ThenInclude(m => m!.User)
            .Where(l => l.GroupMemberId == groupMemberId)
            .OrderByDescending(l => l.DisbursedAt)
            .ToListAsync();
    }

    public async Task<LoanPortfolioDto> GetPortfolioAsync(Guid groupId, Guid actorUserId)
    {
        var loans = await GetByGroupAsync(groupId, actorUserId);
        var now = DateTime.UtcNow;

        decimal totalIssued = loans.Sum(l => l.PrincipalAmount);
        decimal totalRecovered = loans.Sum(l => l.AmountRepaid);
        decimal totalOutstanding = loans.Sum(l => l.OutstandingBalance);

        var overdue = loans.Where(l => l.Status == LoanStatus.Active && l.DueDate < now).ToList();
        var active = loans.Where(l => l.Status == LoanStatus.Active && l.DueDate >= now).ToList();
        var repaid = loans.Where(l => l.Status == LoanStatus.Repaid).ToList();
        var defaulted = loans.Where(l => l.Status == LoanStatus.Defaulted).ToList();

        return new LoanPortfolioDto(
            groupId, totalIssued, totalRecovered, totalOutstanding,
            active.Count, overdue.Count, repaid.Count, defaulted.Count,
            overdue.Sum(l => l.OutstandingBalance),
            defaulted.Sum(l => l.OutstandingBalance));
    }
}
