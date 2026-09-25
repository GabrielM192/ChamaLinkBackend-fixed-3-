<<<<<<< HEAD
using System.Globalization;
using System.Text.RegularExpressions;
using ChamaLink.Application.DTOs;
using ChamaLink.Domain.Exceptions;
=======
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using ChamaLink.Application.DTOs;
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
using ChamaLink.Application.Interfaces;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

<<<<<<< HEAD
namespace ChamaLink.Infrastructure.Services;

/// <summary>
/// Parses M-Koba PDF statements into transaction rows.
/// Each PDF row is a block of 2-3 physical lines with columns at different heights.
/// We use date tokens as anchors and X positions of headers to sort words into columns.
/// </summary>
public class MkobaParserService : IMKobaParserService
{
    private const double MaxRowExtent = 15.0;

    private static readonly Regex DateWordPattern = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);
    private static readonly Regex TimeWordPattern = new(@"^\d{2}:\d{2}:\d{2}(?:\.\d+)?$", RegexOptions.Compiled);
    private static readonly Regex PhoneWordPattern = new(@"^(255\d{9}|0[67]\d{8})$", RegexOptions.Compiled);
    private static readonly Regex MoneyWordPattern = new(@"([\d,]+.\d{2})\s*TZS", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public async Task<List<MKobaTransactionItemDto>> ParseStatementAsync(Stream stream)
    {
        var transactions = new List<MKobaTransactionItemDto>();

        PdfDocument openedPdf;
        try
        {
            openedPdf = PdfDocument.Open(stream);
        }
        catch (Exception ex) when (ex is not ValidationException)
        {
            throw new ValidationException("File is not a valid PDF. Please upload M-Koba PDF statement.");
        }

        using (var pdfDocument = openedPdf)
        {
            foreach (var page in pdfDocument.GetPages())
            {
                var words = page.GetWords().ToList();
                var columns = FindColumnBoundaries(words);
                if (columns == null) continue; // cover page or no headers

                transactions.AddRange(ParseRowsFromWords(words, columns));
            }
        }

        await Task.CompletedTask;
        return transactions;
    }

    private class ColumnBoundaries
    {
        public double DateX = 0;
        public double ReferenceX = 0;
        public double MemberX = 0;
        public double DescriptionX = 0;
    }

    private static ColumnBoundaries? FindColumnBoundaries(List<Word> words)
    {
        Word? Find(string text) => words.FirstOrDefault(w => string.Equals(w.Text, text, StringComparison.OrdinalIgnoreCase));

        var dateHeader = Find("Date");
        var refHeader = Find("Refference") ?? Find("Reference");
        var memberHeader = Find("Member");
        var descHeader = Find("Description");

        if (dateHeader == null || refHeader == null || memberHeader == null || descHeader == null)
            return null;

        return new ColumnBoundaries
        {
            DateX = dateHeader.BoundingBox.Left,
            ReferenceX = refHeader.BoundingBox.Left,
            MemberX = memberHeader.BoundingBox.Left,
            DescriptionX = descHeader.BoundingBox.Left
        };
    }

    private static List<MKobaTransactionItemDto> ParseRowsFromWords(List<Word> words, ColumnBoundaries columns)
    {
        var results = new List<MKobaTransactionItemDto>();

        var anchors = words
            .Where(w => DateWordPattern.IsMatch(w.Text) && w.BoundingBox.Left < columns.ReferenceX)
            .OrderByDescending(w => w.BoundingBox.Top)
            .ToList();

        for (int i = 0; i < anchors.Count; i++)
        {
            double anchorTop = anchors[i].BoundingBox.Top;
            double upperBound = i > 0 ? (anchors[i - 1].BoundingBox.Top + anchorTop) / 2 : anchorTop + MaxRowExtent;
            double lowerBound = i < anchors.Count - 1 ? (anchorTop + anchors[i + 1].BoundingBox.Top) / 2 : anchorTop - MaxRowExtent;

            var rowWords = words.Where(w => w.BoundingBox.Top >= lowerBound && w.BoundingBox.Top <= upperBound).ToList();
            var item = BuildTransactionFromRowWords(rowWords, columns);
            if (item != null) results.Add(item);
        }

        return results;
    }

    private static MKobaTransactionItemDto? BuildTransactionFromRowWords(List<Word> rowWords, ColumnBoundaries columns)
    {
        var moneyWords = rowWords.Where(w => MoneyWordPattern.IsMatch(w.Text)).OrderBy(w => w.BoundingBox.Left).ToList();
        if (moneyWords.Count == 0) return null;

        var amountMatch = MoneyWordPattern.Match(moneyWords[0].Text);
        string amountDigits = amountMatch.Groups[1].Value.Replace(",", "");
        if (!decimal.TryParse(amountDigits, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount) || amount <= 0)
            return null;

        var textWords = rowWords.Except(moneyWords).ToList();

        var dateWords = new List<Word>();
        var refWords = new List<Word>();
        var memberWords = new List<Word>();
        var descriptionWords = new List<Word>();

        foreach (var word in textWords)
        {
            double x = word.BoundingBox.Left;
            if (x >= columns.DescriptionX - 1) descriptionWords.Add(word);
            else if (x >= columns.MemberX - 1) memberWords.Add(word);
            else if (x >= columns.ReferenceX - 1) refWords.Add(word);
            else dateWords.Add(word);
        }

        string dateText = dateWords.FirstOrDefault(w => DateWordPattern.IsMatch(w.Text))?.Text ?? string.Empty;
        string timeText = dateWords.FirstOrDefault(w => TimeWordPattern.IsMatch(w.Text))?.Text ?? string.Empty;
        string referenceNo = string.Join(" ", refWords.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text));

        if (string.IsNullOrEmpty(dateText) || string.IsNullOrEmpty(referenceNo)) return null;

        var parsedDate = ParseTransactionDate(dateText, timeText);
        if (parsedDate == null) return null; // Skip rows with unreadable dates instead of using today

        var phoneWord = memberWords.FirstOrDefault(w => PhoneWordPattern.IsMatch(w.Text));
        string phoneNumber = phoneWord != null ? CleanPhoneNumber(phoneWord.Text) : string.Empty;
        string memberName = string.Join(" ",
            memberWords.Except(phoneWord != null ? new[] { phoneWord } : Array.Empty<Word>())
                .OrderByDescending(w => w.BoundingBox.Top)
                .ThenBy(w => w.BoundingBox.Left)
                .Select(w => w.Text));

        string descriptionText = string.Join(" ", descriptionWords.Select(w => w.Text));
        bool isWithdrawal = descriptionText.Contains("Withdraw", StringComparison.OrdinalIgnoreCase);

        return new MKobaTransactionItemDto
        {
            ReferenceNumber = referenceNo,
            TransactionDate = parsedDate.Value,
            PhoneNumber = phoneNumber,
            MemberName = ToDisplayName(memberName),
            Amount = amount,
            IsWithdrawal = isWithdrawal
        };
    }

    private static DateTime? ParseTransactionDate(string datePart, string timePart)
    {
        string combined = string.IsNullOrEmpty(timePart) ? datePart : $"{datePart} {timePart}";
        if (DateTime.TryParse(combined, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);

        // Date unreadable - caller will skip this row instead of using UtcNow
        return null;
    }

    private static string CleanPhoneNumber(string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
        string digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("0")) digits = "255" + digits.Substring(1);
        return digits;
    }

    private static string ToDisplayName(string rawName)
    {
        if (string.IsNullOrWhiteSpace(rawName)) return rawName;
        var words = rawName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Length > 1 ? char.ToUpperInvariant(w[0]) + w.Substring(1).ToLowerInvariant() : w.ToUpperInvariant());
        return string.Join(" ", words);
=======
namespace ChamaLink.Infrastructure.Services
{
    // HOW THIS PARSER WORKS (rewritten from scratch, validated against a
    // real M-Koba statement before being written here):
    //
    // Each row in the statement is not one plain text line. It is a small
    // BLOCK of 2-3 physical lines, and different columns sit at different
    // heights inside that block:
    //   - Date/Time/Reference and the Amount/Balance numbers are vertically
    //     centred, so they land on the MIDDLE physical line of the block.
    //   - Member (name, then phone) is top-aligned, spread across the
    //     TOP and BOTTOM physical lines.
    //   - Description ("Deposit"/"Contribution" or "Withdraw"/"Transfer
    //     fund") does the same - one word per line when it wraps, or a
    //     single word sitting on the middle line when it does not.
    //
    // Because of this, treating the page as a simple list of text lines
    // (the old approach) mixes columns together and misreads names. This
    // version instead:
    //   1. Reads every word together with its exact X/Y position.
    //   2. Uses the words "2026-01-24" style date tokens as row anchors -
    //      one per transaction row.
    //   3. Builds a vertical "band" around each anchor (roughly half-way
    //      to the row above and the row below) that captures every word
    //      belonging to that row, regardless of which of the 2-3 physical
    //      lines it happens to sit on.
    //   4. Sorts words inside a row's band into columns using the X
    //      position of the column headers on that page ("Date",
    //      "Refference", "Member", "Description"), so it adapts to the
    //      real table layout instead of guessing fixed positions.
    //   5. Handles Amount/Balance separately by looking for the "...TZS"
    //      suffix anywhere in the band, because those two columns are
    //      right-aligned and don't line up neatly with the other columns'
    //      left-based boundaries.
    public class MkobaParserService : IMKobaParserService
    {
        // How far above/below a row's anchor we are willing to look for
        // words belonging to that row, when there is no neighbouring row
        // close enough to define a tighter boundary (e.g. first/last row
        // on a page). A row block in this statement is about 3 short
        // lines tall, so this comfortably covers it without reaching into
        // the header or the next/previous row.
        private const double MaxRowExtent = 15.0;

        private static readonly Regex DateWordPattern = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);
        private static readonly Regex TimeWordPattern = new(@"^\d{2}:\d{2}:\d{2}(?:\.\d+)?$", RegexOptions.Compiled);
        private static readonly Regex PhoneWordPattern = new(@"^(255\d{9}|0[67]\d{8})$", RegexOptions.Compiled);
        private static readonly Regex MoneyWordPattern = new(@"([\d,]+\.\d{2})\s*TZS", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public async Task<List<MKobaTransactionItemDto>> ParseStatementAsync(Stream stream)
        {
            var transactions = new List<MKobaTransactionItemDto>();

            using (var pdfDocument = PdfDocument.Open(stream))
            {
                foreach (var page in pdfDocument.GetPages())
                {
                    var words = page.GetWords().ToList();
                    var columns = FindColumnBoundaries(words);
                    if (columns == null)
                    {
                        // This page doesn't have the column headers we
                        // expect (e.g. a cover page) - nothing to parse here.
                        continue;
                    }

                    transactions.AddRange(ParseRowsFromWords(words, columns));
                }
            }

            await Task.CompletedTask;
            return transactions;
        }

        private class ColumnBoundaries
        {
            public double DateX = 0;
            public double ReferenceX = 0;
            public double MemberX = 0;
            public double DescriptionX = 0;
        }

        // Finds the real X position of each column header on this page,
        // so row-parsing adapts to the actual PDF layout instead of using
        // guessed/fixed numbers.
        private static ColumnBoundaries? FindColumnBoundaries(List<Word> words)
        {
            Word? Find(string text) => words.FirstOrDefault(w => string.Equals(w.Text, text, StringComparison.OrdinalIgnoreCase));

            var dateHeader = Find("Date");
            var refHeader = Find("Refference") ?? Find("Reference");
            var memberHeader = Find("Member");
            var descHeader = Find("Description");

            if (dateHeader == null || refHeader == null || memberHeader == null || descHeader == null)
                return null;

            return new ColumnBoundaries
            {
                DateX = dateHeader.BoundingBox.Left,
                ReferenceX = refHeader.BoundingBox.Left,
                MemberX = memberHeader.BoundingBox.Left,
                DescriptionX = descHeader.BoundingBox.Left
            };
        }

        private static List<MKobaTransactionItemDto> ParseRowsFromWords(List<Word> words, ColumnBoundaries columns)
        {
            var results = new List<MKobaTransactionItemDto>();

            // A row "anchor" is the date token (e.g. "2026-01-24") sitting
            // in the Date column - exactly one per transaction row.
            var anchors = words
                .Where(w => DateWordPattern.IsMatch(w.Text) && w.BoundingBox.Left < columns.ReferenceX)
                .OrderByDescending(w => w.BoundingBox.Top) // top of the page first
                .ToList();

            for (int i = 0; i < anchors.Count; i++)
            {
                double anchorTop = anchors[i].BoundingBox.Top;

                double upperBound = i > 0
                    ? (anchors[i - 1].BoundingBox.Top + anchorTop) / 2
                    : anchorTop + MaxRowExtent;

                double lowerBound = i < anchors.Count - 1
                    ? (anchorTop + anchors[i + 1].BoundingBox.Top) / 2
                    : anchorTop - MaxRowExtent;

                var rowWords = words
                    .Where(w => w.BoundingBox.Top >= lowerBound && w.BoundingBox.Top <= upperBound)
                    .ToList();

                var item = BuildTransactionFromRowWords(rowWords, columns);
                if (item != null)
                    results.Add(item);
            }

            return results;
        }

        private static MKobaTransactionItemDto? BuildTransactionFromRowWords(List<Word> rowWords, ColumnBoundaries columns)
        {
            // Amount and Balance are right-aligned, so their X position
            // doesn't line up reliably with the other columns' left edges.
            // Find them by content ("...TZS") instead, left-to-right:
            // the first one is the transaction Amount, the second is the
            // running Balance (which we don't need).
            var moneyWords = rowWords
                .Where(w => MoneyWordPattern.IsMatch(w.Text))
                .OrderBy(w => w.BoundingBox.Left)
                .ToList();

            if (moneyWords.Count == 0)
                return null; // no amount found for this row - skip rather than guess

            var amountMatch = MoneyWordPattern.Match(moneyWords[0].Text);
            string amountDigits = amountMatch.Groups[1].Value.Replace(",", "");
            if (!decimal.TryParse(amountDigits, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount) || amount <= 0)
                return null;

            var textWords = rowWords.Except(moneyWords).ToList();

            // Every remaining word gets sorted into whichever column its
            // left edge falls under (the largest column boundary that is
            // still to the left of the word).
            var dateWords = new List<Word>();
            var refWords = new List<Word>();
            var memberWords = new List<Word>();
            var descriptionWords = new List<Word>();

            foreach (var word in textWords)
            {
                double x = word.BoundingBox.Left;
                if (x >= columns.DescriptionX - 1) descriptionWords.Add(word);
                else if (x >= columns.MemberX - 1) memberWords.Add(word);
                else if (x >= columns.ReferenceX - 1) refWords.Add(word);
                else dateWords.Add(word);
            }

            string dateText = dateWords.FirstOrDefault(w => DateWordPattern.IsMatch(w.Text))?.Text ?? string.Empty;
            string timeText = dateWords.FirstOrDefault(w => TimeWordPattern.IsMatch(w.Text))?.Text ?? string.Empty;
            string referenceNo = string.Join(" ", refWords.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text));

            if (string.IsNullOrEmpty(dateText) || string.IsNullOrEmpty(referenceNo))
                return null; // couldn't find the basics for this row - skip it

            var phoneWord = memberWords.FirstOrDefault(w => PhoneWordPattern.IsMatch(w.Text));
            string phoneNumber = phoneWord != null ? CleanPhoneNumber(phoneWord.Text) : string.Empty;
            string memberName = string.Join(" ",
                memberWords.Except(phoneWord != null ? new[] { phoneWord } : Array.Empty<Word>())
                    .OrderByDescending(w => w.BoundingBox.Top)
                    .ThenBy(w => w.BoundingBox.Left)
                    .Select(w => w.Text));

            string descriptionText = string.Join(" ", descriptionWords.Select(w => w.Text));
            bool isWithdrawal = descriptionText.Contains("Withdraw", StringComparison.OrdinalIgnoreCase);

            return new MKobaTransactionItemDto
            {
                ReferenceNumber = referenceNo,
                TransactionDate = ParseTransactionDate(dateText, timeText),
                PhoneNumber = phoneNumber,
                MemberName = ToDisplayName(memberName),
                Amount = amount,
                IsWithdrawal = isWithdrawal
            };
        }

        private static DateTime ParseTransactionDate(string datePart, string timePart)
        {
            string combined = string.IsNullOrEmpty(timePart) ? datePart : $"{datePart} {timePart}";
            if (DateTime.TryParse(combined, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);

            return DateTime.UtcNow;
        }

        private static string CleanPhoneNumber(string phone)
        {
            if (string.IsNullOrWhiteSpace(phone))
                return string.Empty;

            string digits = new string(phone.Where(char.IsDigit).ToArray());

            if (digits.StartsWith("0"))
            {
                digits = "255" + digits.Substring(1);
            }

            return digits;
        }

        // Statement names come through in ALL CAPS (e.g. "LUPYANA WILILO").
        // This turns that into a normal-looking name ("Lupyana Wililo") for
        // display and reports. Matching members is always done by phone
        // number, never by name, so this has no effect on data correctness.
        private static string ToDisplayName(string rawName)
        {
            if (string.IsNullOrWhiteSpace(rawName))
                return rawName;

            var words = rawName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(w => w.Length > 1
                    ? char.ToUpperInvariant(w[0]) + w.Substring(1).ToLowerInvariant()
                    : w.ToUpperInvariant());

            return string.Join(" ", words);
        }
>>>>>>> 771aceb8b48df4de2571e2f935c2a839897c5065
    }
}
