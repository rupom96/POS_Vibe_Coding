using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using PosApi.Configuration;
using PosApi.Data;
using PosApi.Endpoints;
using PosApi.Hubs;
using PosApi.Logging;
using PosApi.Services;

var builder = WebApplication.CreateBuilder(args);

// JWT auth (token issued by /api/auth/token and /api/auth/br2-session)
var jwt = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwt["Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwt["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured."))),
            ValidateLifetime = true,
        };
    });
builder.Services.AddAuthorization();

builder.Services.Configure<PosSettings>(builder.Configuration.GetSection("PosSettings"));
builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<ILookupService, LookupService>();
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IPosService, PosService>();
builder.Services.AddSingleton<IAppActivityLogger, AppActivityLogger>();
builder.Services.AddSingleton<SqlUserFriendlyError>();
builder.Services.AddScoped<ActivityLogActionFilter>();

builder.Services.AddControllers(options =>
{
    options.Filters.Add<ActivityLogActionFilter>();
});
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 512 * 1024;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "DataBiz API",
        Version = "v1",
        Description = "DataBiz business application API — POS and future modules.",
    });
});

var corsSection = builder.Configuration.GetSection("Cors");
var allowedOrigins = corsSection.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];
var allowAnyOrigin = corsSection.GetValue<bool>("AllowAnyOrigin");

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (allowAnyOrigin)
        {
            policy.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
            return;
        }

        policy.SetIsOriginAllowed(origin =>
            {
                if (allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                    return true;

                if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
                    return false;

                return originUri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                    || originUri.Host.Equals("127.0.0.1");
            })
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseMiddleware<UnhandledExceptionMiddleware>();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "DataBiz API v1");
    options.RoutePrefix = "swagger";
});

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/", () => Results.Redirect("/swagger"));
app.MapControllers();
app.MapAuthEndpoints();
app.MapHub<ScanRelayHub>("/hubs/scan-relay");

app.Run();
