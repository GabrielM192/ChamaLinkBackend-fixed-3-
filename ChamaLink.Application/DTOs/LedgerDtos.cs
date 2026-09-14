using System.ComponentModel.DataAnnotations;

namespace ChamaLink.Application.DTOs;

public record RecordContributionDto(
    Guid GroupId,
    Guid MemberId,

    [Range(0.01, double.MaxValue, ErrorMessage = "Kiasi cha mchango lazima kiwe zaidi ya sifuri.")]
    decimal Amount,

    string? ReferenceNo,
    string? Description
);

// NOTE: the old IssueLoanDto/RepayLoanDto that used to live here were
// removed. They were a second, incomplete way to issue/repay a loan
// (raw LedgerEntry only - no interest, no due date, no status, no
// Loan Portfolio Report visibility) that duplicated the proper Loan
// feature (see LoanDtos.cs, LoanService, LoanController). Having both
// meant a loan issued through this old path would never show up in loan
// reports. Use LoanController's /issue and /{loanId}/repay instead.

public record LedgerResponseDto(
    Guid Id,
    Guid GroupId,
    Guid AccountId,
    decimal Amount,
    string Type,
    string? ReferenceNo,
    DateTime CreatedAt
);