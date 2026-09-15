using System.Text;
using System.Threading.RateLimiting;
using ChamaLink.Application.Interfaces;
using ChamaLink.Infrastructure.Services;
using Microsoft.Extensions.Hosting;
using ChamaLink.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GroupService>();
builder.Services.AddScoped<IMKobaParserService, MkobaParserService>();
builder.Services.AddScoped<LedgerService>();

// FIX: AccountResolverService is the one shared place that decides what
// AccountId to use for a LedgerEntry. Every service/controller that writes
// to the ledger needs this registered so it can be injected.
builder.Services.AddScoped<AccountResolverService>();

// FIX: IEventService existed but was never registered before, so
// EventController (also new) could not be created and the Event/Tukio
// feature was completely unreachable.
builder.Services.AddScoped<IEventService, EventService>();

// NEW (Sprint 1 + Sprint 2 gaps): Fine/Debt entities, the financial
// intelligence layer (Collection Rate / Defaulters / Group Balance /
// Group Financial Summary), and the Withdrawal approval workflow.
builder.Services.AddScoped<FineService>();
builder.Services.AddScoped<DebtService>();
builder.Services.AddScoped<ComplianceSnapshotService>();
builder.Services.AddScoped<AnalyticsService>();
builder.Services.AddScoped<WithdrawalService>();

// BUG FIX: LoanService/LoanController already existed (Loan entity, DTOs,
// EF model config were all in place), but LoanService was never
// registered here - the exact same gap AccountResolverService and
// IEventService had before. Without this, every LoanController endpoint
// would throw an InvalidOperationException at request time even though
// the whole feature builds cleanly.
builder.Services.AddScoped<LoanService>();

// SECURITY FIX (audit Stage 2: centralized authorization policy). See
// GroupAuthorizationService.cs - every controller that needs to check
// "is this caller a member/leader of this group" now goes through here.
builder.Services.AddScoped<GroupAuthorizationService>();

// SECURITY FIX (audit Stage 2: "CORS haipo"): with no CORS policy at
// all, a browser blocks the React/TS frontend from calling this API
// from any origin other than the API's own (its default, same-origin-
// only behaviour) - so every cross-origin call from the actual app
// (dev server on a different port, or a separate production domain)
// would fail in the browser before ever reaching a controller. Origins
// come from configuration (Cors:AllowedOrigins in appsettings), never
// hardcoded and never AllowAnyOrigin - only the frontend's own known
// origins are ever allowed to call this API directly from client JS.
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (corsOrigins.Length > 0)
        {
            policy.WithOrigins(corsOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
        // No origins configured -> the policy allows nothing. Safer
        // default than silently falling back to wide-open.
    });
});

// SECURITY FIX (audit Stage 2: "Rate limiting haipo"): nothing in front
// of this API stopped a single client from hammering any endpoint as
// fast as the network allowed - most importantly POST /api/Auth/login
// and /api/Auth/register, which carry no [Authorize] at all and are the
// textbook brute-force / credential-stuffing / fake-account-spam
// targets. Two tiers: a generous global limit so normal use is never
// affected, and a much tighter "auth" policy applied only to those two
// endpoints (see AuthController). Both are partitioned per client IP so
// one abusive caller can't burn through the limit that's meant to cover
// everyone else sharing this process.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    options.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
});

builder.Services.AddControllers();
builder.Services.AddHostedService<WelfarePenaltyBackgroundService>();

// BUG FIX: ContributionComplianceBackgroundService (automatic Fine/Debt
// generation for overdue Monthly Contributions - Sprint 1 gap #5) was
// fully implemented but never registered as a hosted service, so it
// never actually ran despite the class existing.
builder.Services.AddHostedService<ContributionComplianceBackgroundService>();

// LOAN ENGINE V2 (item 3/3): LoanSettings.LatePenaltyAmount was a
// field-only setting until now - LoanPenaltyBackgroundService is what
// actually reads it and turns an overdue loan into a Fine.
builder.Services.AddHostedService<LoanPenaltyBackgroundService>();
builder.Services.AddEndpointsApiExplorer();

// Swagger with Authorization Support
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "ChamaLink API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Ingiza JWT Token hivi: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// SECURITY FIX (audit 2.3/2.4): registered first so it wraps every other
// middleware/controller below it - it is the last line of defence for
// anything that isn't already handled by a controller's own try/catch.
app.UseMiddleware<ChamaLink.API.Middleware.GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication(); // Must be before UseAuthorization
app.UseAuthorization();
app.MapControllers();

app.Run();