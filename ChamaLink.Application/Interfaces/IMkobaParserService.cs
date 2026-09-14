using ChamaLink.Application.DTOs;

namespace ChamaLink.Application.Interfaces;

public interface IMKobaParserService
{
    Task<List<MKobaTransactionItemDto>> ParseStatementAsync(Stream stream);
}