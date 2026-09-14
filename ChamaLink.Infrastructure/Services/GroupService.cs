using ChamaLink.Application.DTOs;
using ChamaLink.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.Infrastructure.Services;

public class GroupService
{
    private readonly ApplicationDbContext _context;

    public GroupService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<GroupResponseDto> CreateGroupAsync(Guid adminUserId, CreateGroupDto dto)
    {
        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            Description = dto.Description,
            // BUG FIX: this used to be omitted entirely, so Type always
            // stayed at its default (MonthlySavings), even for groups the
            // leader intended to be EventBased/Hybrid.
            Type = dto.Type,
            Code = GenerateGroupCode()
        };

        var settings = new GroupSettings
        {
            GroupId = group.Id,
            Contribution = new ContributionSettings
            {
                MonthlyContribution = dto.MonthlyContribution,
                LateFine = dto.LateFine,
                // NEW (ChamaLink v1 scope): these previously existed on
                // GroupSettings but were never actually assigned here, so
                // they silently stayed at 0/default for every group.
                GracePeriodDays = dto.GracePeriodDays,
                MinimumShortfallForFine = dto.MinimumShortfallForFine
            },
            Loan = new LoanSettings
            {
                InterestRate = dto.LoanInterestRate
            },
            Financial = new FinancialSettings
            {
                JoiningFee = dto.JoiningFee,
                MinimumReserveBalance = dto.MinimumReserveBalance
            },
            Event = new EventSettings
            {
                WelfareMode = dto.WelfareMode
            },
            Governance = new GovernanceSettings
            {
                WithdrawalApproval = new ApprovalPolicy
                {
                    Mode = dto.WithdrawalApprovalMode,
                    CustomRoles = dto.CustomApprovalRoles,
                    CustomRequiredApprovals = dto.CustomRequiredApprovals
                }
            }
        };

        var adminMember = new GroupMember
        {
            GroupId = group.Id,
            UserId = adminUserId,
            Role = ChamaLink.Domain.GroupRole.Chairperson,
            MemberNumber = "M001"
        };

        _context.Groups.Add(group);
        _context.GroupSettings.Add(settings);
        _context.GroupMembers.Add(adminMember);

        await _context.SaveChangesAsync();

        return new GroupResponseDto(group.Id, group.Name, group.Description, group.Code, group.CreatedAt);
    }

    // NEW: previously there was no way to change a group's settings after
    // creation - GracePeriodDays, JoiningFee, MinimumReserveBalance and
    // the Withdrawal Governance rule were all permanently frozen at
    // whatever CreateGroupAsync set. Every parameter is optional so a
    // caller only has to send the fields that actually changed.
    public async Task<GroupSettingsResponseDto> UpdateSettingsAsync(Guid groupId, UpdateGroupSettingsDto dto)
    {
        var settings = await _context.GroupSettings.FirstOrDefaultAsync(s => s.GroupId == groupId)
            ?? throw new Exception("Mipangilio ya kikundi haikupatikana.");

        if (dto.MonthlyContribution.HasValue) settings.Contribution.MonthlyContribution = dto.MonthlyContribution.Value;
        if (dto.LateFine.HasValue) settings.Contribution.LateFine = dto.LateFine.Value;
        if (dto.LoanInterestRate.HasValue) settings.Loan.InterestRate = dto.LoanInterestRate.Value;
        if (dto.DueDateDay.HasValue) settings.Contribution.DueDateDay = dto.DueDateDay.Value;
        if (dto.GracePeriodDays.HasValue) settings.Contribution.GracePeriodDays = dto.GracePeriodDays.Value;
        if (dto.JoiningFee.HasValue) settings.Financial.JoiningFee = dto.JoiningFee.Value;
        if (dto.MinimumReserveBalance.HasValue) settings.Financial.MinimumReserveBalance = dto.MinimumReserveBalance.Value;
        if (dto.WithdrawalApprovalMode.HasValue) settings.Governance.WithdrawalApproval.Mode = dto.WithdrawalApprovalMode.Value;
        // CustomApprovalRoles/CustomRequiredApprovals are only meaningful
        // together with CustomApproval mode, but we still just store
        // whatever is sent - WithdrawalService.ResolveApprovalRule is the
        // one place that decides how to interpret them.
        if (dto.CustomApprovalRoles != null) settings.Governance.WithdrawalApproval.CustomRoles = dto.CustomApprovalRoles;
        if (dto.CustomRequiredApprovals.HasValue) settings.Governance.WithdrawalApproval.CustomRequiredApprovals = dto.CustomRequiredApprovals.Value;
        if (dto.MinimumShortfallForFine.HasValue) settings.Contribution.MinimumShortfallForFine = dto.MinimumShortfallForFine.Value;
        if (dto.WelfareMode.HasValue) settings.Event.WelfareMode = dto.WelfareMode.Value;

        await _context.SaveChangesAsync();
        return ToSettingsDto(settings);
    }

    public async Task<GroupSettingsResponseDto> GetSettingsAsync(Guid groupId)
    {
        var settings = await _context.GroupSettings.FirstOrDefaultAsync(s => s.GroupId == groupId)
            ?? throw new Exception("Mipangilio ya kikundi haikupatikana.");
        return ToSettingsDto(settings);
    }

    private static GroupSettingsResponseDto ToSettingsDto(GroupSettings s) => new(
        s.GroupId, s.Contribution.MonthlyContribution, s.Contribution.LateFine, s.Loan.InterestRate, s.Contribution.DueDateDay,
        s.Contribution.GracePeriodDays, s.Financial.JoiningFee, s.Financial.MinimumReserveBalance,
        s.Governance.WithdrawalApproval.Mode.ToString(), s.Governance.WithdrawalApproval.CustomRoles, s.Governance.WithdrawalApproval.CustomRequiredApprovals,
        s.Contribution.MinimumShortfallForFine, s.Event.WelfareMode.ToString());

    public async Task<bool> AddMemberAsync(Guid groupId, AddMemberDto dto)
    {
        var roleParsed = Enum.Parse<ChamaLink.Domain.GroupRole>(dto.Role, true);

        // BUG FIX: previously any number of members could be given the
        // same leadership role (e.g. 5 Chairpersons at once). Leadership
        // seats (Chairperson, Treasurer, Secretary, Member Representative)
        // are limited to exactly one holder per group - plain "Member" has
        // no such limit.
        if (roleParsed != ChamaLink.Domain.GroupRole.Member)
        {
            bool seatTaken = await _context.GroupMembers
                .AnyAsync(m => m.GroupId == groupId && m.Role == roleParsed);

            if (seatTaken)
                throw new Exception($"Nafasi ya {roleParsed} tayari ina mwanachama kwenye kikundi hiki.");
        }

        var member = new GroupMember
        {
            GroupId = groupId,
            UserId = dto.UserId,
            MemberNumber = dto.MemberNumber,
            Role = roleParsed
        };

        _context.GroupMembers.Add(member);
        await _context.SaveChangesAsync();
        return true;
    }

    // NEW (frontend foundation gap): powers the post-login "choose your
    // group" screen - every group this user belongs to, with their role
    // and status in each, since one person can be a member of several
    // chamas at once.
    public async Task<List<MyGroupSummaryDto>> GetMyGroupsAsync(Guid userId)
    {
        return await _context.GroupMembers
            .Include(m => m.Group)
            .Where(m => m.UserId == userId)
            .Select(m => new MyGroupSummaryDto(
                m.GroupId,
                m.Group!.Name,
                m.Group.Code,
                m.Role.ToString(),
                m.Group.Type.ToString(),
                m.Status.ToString()))
            .ToListAsync();
    }

    private string GenerateGroupCode()
    {
        return "CHM-" + new Random().Next(100000, 999999).ToString();
    }
}