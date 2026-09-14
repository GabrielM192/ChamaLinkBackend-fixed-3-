using ChamaLink.API.Extensions;
using ChamaLink.Application.DTOs;
using ChamaLink.Domain.Entities;
using ChamaLink.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChamaLink.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class LoanController : ControllerBase
{
    private readonly LoanService _loanService;

    public LoanController(LoanService loanService)
    {
        _loanService = loanService;
    }

    [HttpPost("group/{groupId}")]
    public async Task<IActionResult> Issue(Guid groupId, [FromBody] IssueLoanDto dto)
    {
        try
        {
            var loan = await _loanService.IssueLoanAsync(groupId, dto, User.GetUserId());
            return Ok(ToDto(loan));
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

    [HttpPost("{id}/repay")]
    public async Task<IActionResult> Repay(Guid id, [FromBody] RecordLoanRepaymentDto dto)
    {
        try
        {
            var loan = await _loanService.RecordRepaymentAsync(id, dto, User.GetUserId());
            return Ok(ToDto(loan));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        // CONCURRENCY FIX (audit 8.4: "Loan repayment ina concurrency
        // risk"): thrown by RecordRepaymentAsync's SaveChangesAsync when
        // another repayment (or mark-defaulted, etc.) already changed
        // this same Loan row between the time this request read it and
        // tried to save - now that Loan uses an xmin concurrency token.
        // Returning 409 tells the client "reload and try again", rather
        // than either silently overwriting the other request's change
        // (the old behaviour, which could overpay a loan) or surfacing a
        // confusing raw EF error message as a 400.
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Mkopo huu umebadilishwa na ombi lingine wakati huo huo. Tafadhali pakia upya taarifa za mkopo kisha jaribu tena." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id}/mark-defaulted")]
    public async Task<IActionResult> MarkDefaulted(Guid id)
    {
        try
        {
            var loan = await _loanService.MarkDefaultedAsync(id, User.GetUserId());
            return Ok(ToDto(loan));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { message = "Mkopo huu umebadilishwa na ombi lingine wakati huo huo (huenda malipo yameingizwa). Tafadhali pakia upya taarifa za mkopo kisha jaribu tena." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("group/{groupId}")]
    public async Task<IActionResult> GetByGroup(Guid groupId)
    {
        try
        {
            var loans = await _loanService.GetByGroupAsync(groupId, User.GetUserId());
            return Ok(loans.Select(ToDto));
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

    [HttpGet("member/{groupMemberId}")]
    public async Task<IActionResult> GetByMember(Guid groupMemberId)
    {
        try
        {
            var loans = await _loanService.GetByMemberAsync(groupMemberId, User.GetUserId());
            return Ok(loans.Select(ToDto));
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

    private static LoanResponseDto ToDto(Loan l) => new(
        l.Id, l.GroupId, l.GroupMemberId, l.UserId, l.GroupMember?.User?.FullName,
        l.PrincipalAmount, l.InterestRate, l.InterestAmount, l.TotalPayable,
        l.AmountRepaid, l.OutstandingBalance, l.Purpose, l.DisbursedAt, l.DueDate,
        l.RepaidAt, l.Status.ToString(), l.IsOverdue);
}
