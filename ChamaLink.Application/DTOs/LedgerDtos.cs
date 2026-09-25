using System.ComponentModel.DataAnnotations;

namespace ChamaLink.Application.DTOs;

public record RecordContributionDto(
    Guid GroupId,
<<<<<<< HEAD

    // RENAMED (ukaguzi 2026-09-15, H-2): jina la zamani lilikuwa `MemberId`,
    // lakini LedgerService lilikuwa linapitisha thamani hii kama **userId**:
    //     _accountResolver.GetGroupMemberAsync(dto.GroupId, dto.MemberId)
    //     // signature halisi: GetGroupMemberAsync(Guid groupId, Guid userId)
    //
    // Niliithibitisha kwa kupiga endpoint halisi:
    //   memberId = <GroupMember.Id> -> 400 "Mwanachama hajapatikana kwenye kikundi hiki."
    //   memberId = <User.Id>        -> 200 OK
    //
    // Yaani jina lilikuwa linapotosha mtu yeyote anayetumia API. Frontend
    // bado haitumii endpoint hii (nilitafuta - hakuna `Ledger` kwenye
    // src/), kwa hiyo kubadilisha jina hapa halivunji kitu.
    Guid UserId,
=======
    Guid MemberId,
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065

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