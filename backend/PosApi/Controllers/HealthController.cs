using Microsoft.AspNetCore.Mvc;
using PosApi.Data;

namespace PosApi.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController(IDbConnectionFactory db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        try
        {
            using var conn = db.CreateConnection();
            await conn.OpenAsync();
            return Ok(new { status = "Connected", database = conn.Database });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { status = "Disconnected", error = ex.Message });
        }
    }
}
