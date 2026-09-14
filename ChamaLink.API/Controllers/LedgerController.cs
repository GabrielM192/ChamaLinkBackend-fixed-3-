using Microsoft.AspNetCore.Authorization;
using ChamaLink.API.Extensions;
using ChamaLink.Application.DTOs;
using ChamaLink.Domain;
using ChamaLink.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;

namespace ChamaLink.API.Controllers;

// NOTE: issue-loan / repay-loan used to live here. Removed - they were a
// second, incomplete way to issue/repay a loan that duplicated the
// proper Loan feature (interest, due date, status, portfolio report).
// Use LoanController instead: POST /api/Loan/{groupId}/issue and
// POST /api/Loan/{loanId}/repay.
[Authorize]
[ApiController]
[Route("api/[controller]")]
public class LedgerController : ControllerBase
{
    private readonly LedgerService _ledgerService;
    private readonly GroupAuthorizationService _groupAuth;

    public LedgerController(LedgerService ledgerService, GroupAuthorizationService groupAuth)
    {
        _ledgerService = ledgerService;
        _groupAuth = groupAuth;
    }

    // SECURITY FIX (audit 3.7: "Contribution endpoint haina actor
    // separation"): recording a contribution changes another member's
    // financial record - restricted to the group's own Treasurer or
    // Secretary, the people actually trusted to collect/record money.
    [HttpPost("contribution")]
    public async Task<IActionResult> RecordContribution([FromBody] RecordContributionDto dto)
    {
        try
        {
            await _groupAuth.RequireRoleAsync(User.GetUserId(), dto.GroupId, GroupRole.Treasurer, GroupRole.Secretary, GroupRole.Chairperson);

            var result = await _ledgerService.RecordContributionAsync(dto);
            return Ok(result);
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

    [HttpGet("summary/{groupId}")]
    public async Task<IActionResult> GetGroupSummary(Guid groupId)
    {
        try
        {
            await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);

            var result = await _ledgerService.GetGroupSummaryAsync(groupId);
            return Ok(result);
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

    // SECURITY FIX (audit Stage 1 #7): RequireMembershipAsync only proved
    // the caller belongs to *a* group - it never checked that the {userId}
    // whose statement was being requested was the caller themselves. Any
    // ordinary member could read any other member's full financial
    // statement just by changing the userId in the URL. Now it's either
    // your own statement, or you hold one of the group's financial
    // leadership roles.
    [HttpGet("statement/{groupId}/{userId}")]
    public async Task<IActionResult> GetMemberStatement(Guid groupId, Guid userId)
    {
        try
        {
            var caller = await _groupAuth.RequireMembershipAsync(User.GetUserId(), groupId);

            bool isOwnStatement = caller.UserId == userId;
            bool isLeader = caller.Role is GroupRole.Treasurer or GroupRole.Chairperson or GroupRole.Secretary;

            if (!isOwnStatement && !isLeader)
                throw new UnauthorizedAccessException("Unaweza kuona statement yako mwenyewe pekee, isipokuwa kama wewe ni kiongozi wa kikundi.");

            var result = await _ledgerService.GetMemberStatementAsync(groupId, userId);
            return Ok(result);
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
}
