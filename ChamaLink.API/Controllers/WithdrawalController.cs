using ChamaLink.API.Extensions;
using ChamaLink.Application.DTOs;
using ChamaLink.Domain;
using ChamaLink.Domain.Entities;
using ChamaLink.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.API.Controllers;

// Withdrawal Governance gap: approval is no longer a single hardcoded
// "Treasurer approves" call. /approval-rule tells a client what this
// group's own rule currently is, and /decide records one leader's vote
// (approve or reject) toward that rule - see WithdrawalService.
//
// SECURITY FIX (audit 1.6/1.7): Create/Decide/MarkPaid no longer accept
// "who is doing this" from the request - the actor is always
// User.GetUserId() from the caller's own JWT.
[Authorize]
[ApiController]
[Route("api/[controller]")]
public class WithdrawalController : ControllerBase
{
    private readonly WithdrawalService _withdrawalService;
    private readonly GroupAuthorizationService _groupAuth;

    public WithdrawalController(WithdrawalService withdrawalService, GroupAuthorizationService groupAuth)
    {
        _withdrawalService = withdrawalService;
        _groupAuth = groupAuth;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWithdrawalDto dto)
    {
<<<<<<< HEAD

        var withdrawal = await _withdrawalService.CreateAsync(dto, User.GetUserId());
        return Ok(await ToDtoAsync(withdrawal));

=======
        try
        {
            var withdrawal = await _withdrawalService.CreateAsync(dto, User.GetUserId());
            return Ok(await ToDtoAsync(withdrawal));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
    }

    // SECURITY FIX (audit Stage 1 #6): had no membership check at all
    // before - any authenticated user could list every withdrawal (who
    // requested what, for how much, beneficiary names) of any group just
    // by guessing a groupId. Same pattern ReportsController already uses
    // for its own group-scoped report endpoints.
    [HttpGet("group/{groupId}")]
    public async Task<IActionResult> GetByGroup(Guid groupId)
    {
<<<<<<< HEAD

        await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
=======
        try
        {
            await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065

        var withdrawals = await _withdrawalService.GetByGroupAsync(groupId);
        var rule = await _withdrawalService.GetApprovalRuleAsync(groupId);
        return Ok(withdrawals.Select(w => ToDto(w, rule)));
    }

    // Lets a "new withdrawal" screen show the group's governance rule
    // (who must approve, how many signatures) before anyone has voted.
    //
    // SECURITY FIX (audit Stage 1 #6): same gap as GetByGroup above -
    // this leaked a group's approval governance (which roles, how many
    // signatures) to anyone with a valid token, not just its members.
    [HttpGet("group/{groupId}/approval-rule")]
    public async Task<IActionResult> GetApprovalRule(Guid groupId)
    {
<<<<<<< HEAD

        await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
=======
        try
        {
            await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065

        var rule = await _withdrawalService.GetApprovalRuleAsync(groupId);
        return Ok(new WithdrawalApprovalRuleDto(
            rule.AllowedRoles.Select(r => r.ToString()).ToList(),
            rule.RequiredApprovals));
    }

    // Single endpoint for both approving and rejecting - dto.Approve
    // decides which. This matches how the vote is actually recorded: one
    // leader, one decision, checked against the group's own rule.
    [HttpPost("{id}/decide")]
    public async Task<IActionResult> Decide(Guid id, [FromBody] DecideWithdrawalDto dto)
    {
<<<<<<< HEAD

        var withdrawal = await _withdrawalService.DecideAsync(id, User.GetUserId(), dto.Approve, dto.Reason);
        return Ok(await ToDtoAsync(withdrawal));

=======
        try
        {
            var withdrawal = await _withdrawalService.DecideAsync(id, User.GetUserId(), dto.Approve, dto.Reason);
            return Ok(await ToDtoAsync(withdrawal));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
        // CONCURRENCY FIX: two leaders can approve/reject the same
        // withdrawal at almost the same instant, both reading the same
        // Status/Approvals snapshot before either one saves. Withdrawal
        // now carries an xmin concurrency token, so whichever request's
        // SaveChangesAsync loses the race gets this instead of silently
        // computing the wrong PartiallyApproved/Approved transition from
        // stale data.
<<<<<<< HEAD

=======
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Uamuzi mwingine ulishatolewa kwenye withdrawal hii wakati huo huo. Tafadhali pakia upya kisha jaribu tena." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
    }

    [HttpPost("{id}/mark-paid")]
    public async Task<IActionResult> MarkPaid(Guid id)
    {
<<<<<<< HEAD

        var withdrawal = await _withdrawalService.MarkPaidAsync(id, User.GetUserId());
        return Ok(await ToDtoAsync(withdrawal));

=======
        try
        {
            var withdrawal = await _withdrawalService.MarkPaidAsync(id, User.GetUserId());
            return Ok(await ToDtoAsync(withdrawal));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Withdrawal hii imebadilishwa na ombi lingine wakati huo huo. Tafadhali pakia upya kisha jaribu tena." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
    }

    private async Task<WithdrawalResponseDto> ToDtoAsync(Withdrawal w)
    {
        var rule = await _withdrawalService.GetApprovalRuleAsync(w.GroupId);
        return ToDto(w, rule);
    }

    private static WithdrawalResponseDto ToDto(Withdrawal w, (List<GroupRole> AllowedRoles, int RequiredApprovals) rule) => new(
        w.Id, w.GroupId, w.Amount, w.Purpose, w.BeneficiaryName, w.BeneficiaryGroupMemberId, w.GroupEventId, w.Status.ToString(),
        w.ApprovedByGroupMemberId, w.RecordedByGroupMemberId, w.ReferenceNo, w.Notes,
        w.RejectionReason, w.Date, w.DecisionAt,
        rule.RequiredApprovals,
        w.Approvals.Count(a => a.Approved),
        rule.AllowedRoles.Select(r => r.ToString()).ToList(),
        w.Approvals
            .OrderBy(a => a.DecidedAt)
            .Select(a => new WithdrawalApprovalDto(a.GroupMemberId, a.RoleAtDecision.ToString(), a.Approved, a.Reason, a.DecidedAt))
            .ToList());
}
