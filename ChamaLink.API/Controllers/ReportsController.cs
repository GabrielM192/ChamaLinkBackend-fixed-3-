 using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ChamaLink.API.Extensions;
using ChamaLink.Infrastructure;
using ChamaLink.Infrastructure.Services;
using ChamaLink.Domain.Entities;
using ChamaLink.Domain;
using ChamaLink.Application.DTOs;
using ChamaLink.Domain.DTOs;

namespace ChamaLink.API.Controllers
{
    // SECURITY FIX (audit 1.2 / 11.8: "ReportsController haina [Authorize]"
    // - flagged as CRITICAL DATA LEAKAGE): every endpoint below used to be
    // reachable by anyone with no token at all, and returned names, phone
    // numbers, debts, fines, loans and balances for any groupId a caller
    // guessed. The controller now requires a valid token, and every
    // endpoint additionally confirms the caller is a member of the group
    // whose data they're asking for via GroupAuthorizationService - a
    // member of Group A can no longer read Group B's reports.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly AccountResolverService _accountResolver;
        private readonly AnalyticsService _analyticsService;
        private readonly FineService _fineService;
        private readonly DebtService _debtService;
        private readonly WithdrawalService _withdrawalService;
        private readonly LoanService _loanService;
        private readonly GroupAuthorizationService _groupAuth;
        private readonly ComplianceReportService _complianceReportService;

        public ReportsController(
            ApplicationDbContext context,
            AccountResolverService accountResolver,
            AnalyticsService analyticsService,
            FineService fineService,
            DebtService debtService,
            WithdrawalService withdrawalService,
            LoanService loanService,
            GroupAuthorizationService groupAuth,
            ComplianceReportService complianceReportService)
        {
            _context = context;
            _accountResolver = accountResolver;
            _analyticsService = analyticsService;
            _fineService = fineService;
            _debtService = debtService;
            _withdrawalService = withdrawalService;
            _loanService = loanService;
            _groupAuth = groupAuth;
            _complianceReportService = complianceReportService;
        }

        [HttpGet("whatsapp-summary/{groupId}")]
        public async Task<ActionResult<WhatsAppReportDto>> GetWhatsAppSummary(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var group = await _context.Groups
                .Include(g => g.Settings)
                .FirstOrDefaultAsync(g => g.Id == groupId);

            if (group == null)
            {
                return NotFound(new { message = "Kikundi hakikupatikana." });
            }

            var members = await _context.GroupMembers
                .Include(m => m.User)
                .Where(m => m.GroupId == groupId)
                .ToListAsync();

            var sb = new StringBuilder();
            sb.AppendLine($"📊 *RIPOTI YA KIKUNDI: {group.Name.ToUpper()}*");
            sb.AppendLine($"📅 Tarehe: {DateTime.UtcNow:dd/MM/yyyy}");
            sb.AppendLine("------------------------------------");
            sb.AppendLine();

            int newCount = 0;
            int activeCount = 0;
            int warningCount = 0;
            int expulsionCount = 0;

            foreach (var member in members)
            {
                string statusEmoji = member.Status switch
                {
                    MemberStatus.New => "🆕",
                    MemberStatus.Active => "✅",
                    MemberStatus.Warning => "⚠️",
                    MemberStatus.EligibleForExpulsion => "🚨",
                    _ => "⚪"
                };

                string statusName = member.Status switch
                {
                    MemberStatus.New => "Mgeni (Probation)",
                    MemberStatus.Active => "Hai (Active)",
                    MemberStatus.Warning => "Onyo (Warning)",
                    MemberStatus.EligibleForExpulsion => "Hatarini Kufukuzwa",
                    _ => "Uhai Haujulikani"
                };

                switch (member.Status)
                {
                    case MemberStatus.New: newCount++; break;
                    case MemberStatus.Active: activeCount++; break;
                    case MemberStatus.Warning: warningCount++; break;
                    case MemberStatus.EligibleForExpulsion: expulsionCount++; break;
                }

     string fullName = member.User?.FullName ?? "Mwanachama";
     string phoneNumber = member.User?.PhoneNumber ?? "Namba Haipo";

    sb.AppendLine($"{statusEmoji} *{fullName}* ({phoneNumber})");
    sb.AppendLine($"   • Status: {statusName}");
                sb.AppendLine($"   • Michango: Mara {member.TotalContributionsCount}");
                sb.AppendLine();
            }

            sb.AppendLine("------------------------------------");
            sb.AppendLine("📈 *MUHTASARI WA WANACHAMA:*");
            sb.AppendLine($"✅ Active: {activeCount}");
            sb.AppendLine($"🆕 Wapya (Probation): {newCount}");
            sb.AppendLine($"⚠️ Onyo (Warning): {warningCount}");
            sb.AppendLine($"🚨 Hatarini Kufukuzwa: {expulsionCount}");
            sb.AppendLine($"👥 *Jumla ya Wanachama:* {members.Count}");
            sb.AppendLine();
            sb.AppendLine("_Ripoti hii imezalishwa kiotomatiki na Mfumo wa ChamaLink._");

            var result = new WhatsAppReportDto
            {
                GroupId = groupId,
                GroupName = group.Name,
                GeneratedAt = DateTime.UtcNow,
                FormattedMessage = sb.ToString()
            };

            return Ok(result);
        }

        // Endpoint to fetch full financial status breakdown for all members
        [HttpGet("group-members-summary/{groupId}")]
        public async Task<ActionResult<List<MemberStatusDto>>> GetGroupMembersSummary(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var group = await _context.Groups
                .Include(g => g.Settings)
                .FirstOrDefaultAsync(g => g.Id == groupId);

            if (group == null)
            {
                return NotFound("Kikundi hakikupatikana.");
            }

            var members = await _context.GroupMembers
                .Include(m => m.User)
                .Where(m => m.GroupId == groupId)
                .ToListAsync();

            // BUG FIX: this used to grab "the first Account row in the whole
            // database" and use it for EVERY member below, so every member
            // in every group showed the same monthly-paid and pending-fine
            // numbers. Now each member's own Savings and Fine accounts are
            // looked up inside the loop.

            var result = new List<MemberStatusDto>();
            DateTime currentMonthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            foreach (var member in members)
            {
                var savingsAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.Savings);
                var fineAccount = await _accountResolver.GetOrCreateAccountAsync(member.Id, AccountType.Fine);

                // Calculate monthly contributions paid this month
                decimal monthlyPaid = await _context.LedgerEntries
                    .Where(l => l.GroupId == groupId && l.AccountId == savingsAccount.Id &&
                                l.Type == TransactionType.Contribution &&
                                l.CreatedAt >= currentMonthStart)
                    .SumAsync(l => (decimal?)l.Amount) ?? 0m;

                // Calculate pending fine amount
                var totalFinesIssued = await _context.LedgerEntries
                    .Where(l => l.GroupId == groupId && l.AccountId == fineAccount.Id && l.Type == TransactionType.FineIssue)
                    .SumAsync(l => (decimal?)l.Amount) ?? 0m;

                var totalFinesPaid = await _context.LedgerEntries
                    .Where(l => l.GroupId == groupId && l.AccountId == fineAccount.Id && l.Type == TransactionType.FinePayment)
                    .SumAsync(l => (decimal?)l.Amount) ?? 0m;

                decimal pendingFine = totalFinesIssued - totalFinesPaid;

                // BUG FIX: was reading MonthlyContributionAmount, which was
                // never actually set when the group was created. Now reads
                // MonthlyContribution, the field GroupService really fills in.
                decimal targetAmount = group.Settings?.Contribution.MonthlyContribution ?? 0m;

                result.Add(new MemberStatusDto
                {
                    UserId = member.UserId,
                    MemberName = member.User?.FullName ?? "Mwanachama",
                    PhoneNumber = member.User?.PhoneNumber ?? string.Empty,
                    MonthlyContributionTarget = targetAmount,
                    TotalMonthlyPaidThisMonth = monthlyPaid,
                    HasPaidCurrentMonth = monthlyPaid >= targetAmount,
                    PendingFineAmount = pendingFine,
                    AdvanceBalance = member.AdvanceBalance
                });
            }

            return Ok(result);
        }

        // ---------------------------------------------------------------
        // NEW ENDPOINTS BELOW (Sprint 1 + Sprint 2 gaps)
        // ---------------------------------------------------------------

        // Sprint 1 gap #19: Group Financial Summary Endpoint Haipo.
        // The single "open the app, see everything" endpoint the vision
        // doc's Dashboard ya Viongozi section calls for.
        [HttpGet("group-financial-summary/{groupId}")]
        public async Task<ActionResult<GroupFinancialSummaryDto>> GetGroupFinancialSummary(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
                return Ok(await _analyticsService.GetGroupFinancialSummaryAsync(groupId));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // Sprint 1 gap #11: Collection Rate Engine Haipo.
        [HttpGet("collection-rate/{groupId}")]
        public async Task<ActionResult<CollectionRateDto>> GetCollectionRate(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
                return Ok(await _analyticsService.GetCollectionRateAsync(groupId));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // Sprint 1 gap #12: Defaulter Engine Haipo.
        [HttpGet("defaulters/{groupId}")]
        public async Task<ActionResult<List<DefaulterDto>>> GetDefaulters(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _analyticsService.GetDefaultersAsync(groupId));
        }

        // Ukonga Rules Specification v1.2, sehemu 5/7/8 (Phase 5). One row
        // per member from their latest ComplianceSnapshot (Phase 4):
        // Missed(Total)/Consecutive/Fines Owed/Contribution Debt/Status -
        // exactly the sehemu 7 table. This single endpoint is the source
        // for "Defaulters" (filter ConsecutiveMissedMonths >= 1),
        // "Warnings" (Status == "Warning") and "NonActive list" (Status ==
        // "Inactive") from sehemu 8 - they are views over this data, not
        // separate business logic, so the frontend filters what it needs
        // rather than making three calls that would each recompute the
        // same numbers.
        [HttpGet("compliance-summary/{groupId}")]
        public async Task<ActionResult<List<ComplianceSummaryRowDto>>> GetComplianceSummary(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _complianceReportService.GetComplianceSummaryAsync(groupId));
        }

        // Ukonga Rules Specification v1.2, sehemu 6/8 (Phase 5): "Compliance
        // Trends - mwenendo wa mwezi kwa mwezi" for one member, oldest
        // month first, straight off their ComplianceSnapshot history.
        [HttpGet("compliance-trend/{groupId}/{groupMemberId}")]
        public async Task<ActionResult<ComplianceTrendDto>> GetComplianceTrend(Guid groupId, Guid groupMemberId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var trend = await _complianceReportService.GetComplianceTrendAsync(groupId, groupMemberId);
            if (trend == null)
            {
                return NotFound(new { message = "Mwanachama hakupatikana kwenye kikundi hiki." });
            }

            return Ok(trend);
        }

        // Sprint 1 gap #13: Group Balance Engine Haipo.
        [HttpGet("group-balance/{groupId}")]
        public async Task<ActionResult<GroupBalanceDto>> GetGroupBalance(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _analyticsService.GetGroupBalanceAsync(groupId));
        }

        // Reports Engine gap: Members Report - one table, every member's
        // standing (status/savings/debt/fine/loan) at once.
        [HttpGet("members/{groupId}")]
        public async Task<ActionResult<List<MemberReportRowDto>>> GetMembersReport(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _analyticsService.GetMembersReportAsync(groupId));
        }

        // Reports Engine gap: Loan Portfolio Report - group-wide lending
        // health (issued/recovered/outstanding, and how many loans stand
        // where today).
        [HttpGet("loan-portfolio/{groupId}")]
        public async Task<ActionResult<LoanPortfolioDto>> GetLoanPortfolio(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _loanService.GetPortfolioAsync(groupId, User.GetUserId()));
        }

        // Sprint 1 gap #4: Fine Report.
        [HttpGet("fines/{groupId}")]
        public async Task<IActionResult> GetFineReport(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _fineService.GetFinesForGroupAsync(groupId));
        }

        // Sprint 1 gap #3: Debt Report.
        [HttpGet("debts/{groupId}")]
        public async Task<IActionResult> GetDebtReport(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            return Ok(await _debtService.GetDebtsForGroupAsync(groupId));
        }

        // Sprint 2 gap #10: Withdrawal Report (approved/paid expenditure
        // history - distinct from the raw M-Koba wallet withdrawals
        // reported by MkobaImportController.GetWithdrawals).
        [HttpGet("withdrawals/{groupId}")]
        public async Task<IActionResult> GetWithdrawalReport(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var withdrawals = await _withdrawalService.GetByGroupAsync(groupId);
            var rule = await _withdrawalService.GetApprovalRuleAsync(groupId);
            return Ok(withdrawals.Select(w => new WithdrawalResponseDto(
                w.Id, w.GroupId, w.Amount, w.Purpose, w.BeneficiaryName, w.BeneficiaryGroupMemberId, w.GroupEventId, w.Status.ToString(),
                w.ApprovedByGroupMemberId, w.RecordedByGroupMemberId, w.ReferenceNo, w.Notes,
                w.RejectionReason, w.Date, w.DecisionAt,
                rule.RequiredApprovals,
                w.Approvals.Count(a => a.Approved),
                rule.AllowedRoles.Select(r => r.ToString()).ToList(),
                w.Approvals
                    .OrderBy(a => a.DecidedAt)
                    .Select(a => new WithdrawalApprovalDto(a.GroupMemberId, a.RoleAtDecision.ToString(), a.Approved, a.Reason, a.DecidedAt))
                    .ToList())));
        }

        // Sprint 2 gap #9: Event Report, including per-member contribution
        // tracking (Expected/Paid/Pending) via EventContribution.
        [HttpGet("events/{groupId}")]
        public async Task<IActionResult> GetEventReport(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var events = await _context.GroupEvents
                .Where(e => e.GroupId == groupId)
                .OrderByDescending(e => e.EventDate)
                .ToListAsync();

            var result = new List<object>();
            foreach (var evt in events)
            {
                var contributions = await _context.EventContributions
                    .Where(ec => ec.GroupEventId == evt.Id)
                    .ToListAsync();

                result.Add(new
                {
                    evt.Id,
                    evt.Title,
                    evt.Description,
                    evt.BeneficiaryName,
                    evt.TargetAmountPerMember,
                    evt.AmountDeducted,
                    evt.EventDate,
                    evt.DeadlineDate,
                    evt.IsActive,
                    evt.IsResolved,
                    TotalExpected = contributions.Sum(c => c.ExpectedAmount),
                    TotalCollected = contributions.Sum(c => c.PaidAmount),
                    PaidCount = contributions.Count(c => c.Status == EventContributionStatus.Paid),
                    PendingCount = contributions.Count(c => c.Status != EventContributionStatus.Paid)
                });
            }

            return Ok(result);
        }

        // Member Registry Report - full member list per the vision doc's
        // Reporting Engine section.
        [HttpGet("member-registry/{groupId}")]
        public async Task<IActionResult> GetMemberRegistry(Guid groupId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }

            var members = await _context.GroupMembers
                .Include(m => m.User)
                .Where(m => m.GroupId == groupId)
                .OrderBy(m => m.MemberNumber)
                .Select(m => new
                {
                    m.Id,
                    m.UserId,
                    Name = m.User != null ? m.User.FullName : "Mwanachama",
                    Phone = m.User != null ? m.User.PhoneNumber : string.Empty,
                    m.MemberNumber,
                    Role = m.Role.ToString(),
                    Status = m.Status.ToString(),
                    m.JoinedAt,
                    m.TotalContributionsCount
                })
                .ToListAsync();

            return Ok(members);
        }

        // Reports Engine gap: Member Financial Profile - the member's
        // "financial passport". Replaces the old anonymous-object version
        // (savings/debt/fine/benefits only) with group/role context, real
        // contribution compliance, actual Loans (Loan entity, not just a
        // ledger balance), event contribution history, and a Financial
        // Score - see AnalyticsService.GetMemberFinancialProfileAsync.
        [HttpGet("member-profile/{groupId}/{userId}")]
        public async Task<ActionResult<MemberFinancialProfileDto>> GetMemberFinancialProfile(Guid groupId, Guid userId)
        {
            try
            {
                await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
                return Ok(await _analyticsService.GetMemberFinancialProfileAsync(groupId, userId));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }
    }
}