namespace ChamaLink.Application.DTOs;

public class MKobaTransactionItemDto
{
    public string ReferenceNumber { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string MemberName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime TransactionDate { get; set; }

    // NEW: M-Koba statements also list "Withdraw / Transfer fund" rows -
    // money leaving the group wallet (e.g. treasurer paying out a loan in
    // cash). These are NOT a member's deposit, so they must never be run
    // through the deposit waterfall (fine -> event -> savings -> advance).
    // The importer uses this flag to skip them from that logic and just
    // report them instead.
    public bool IsWithdrawal { get; set; }
}

public class MKobaImportRequestDto
{
    public Guid GroupId { get; set; }
    public List<MKobaTransactionItemDto> Transactions { get; set; } = new();
}