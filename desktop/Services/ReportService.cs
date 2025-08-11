using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Models.Entities;

namespace WarehouseManagement.Desktop.Services
{
    public interface IReportService
    {
        Task<InventoryReport> GenerateInventoryReportAsync(int? warehouseId = null, int? zoneId = null);
        Task<MovementReport> GenerateMovementReportAsync(DateTime startDate, DateTime endDate, int? warehouseId = null);
        Task<PerformanceReport> GeneratePerformanceReportAsync(DateTime startDate, DateTime endDate, int? warehouseId = null);
        Task<BinUtilizationReport> GenerateBinUtilizationReportAsync(int? warehouseId = null);
        Task<ProductAnalysisReport> GenerateProductAnalysisReportAsync(DateTime startDate, DateTime endDate);
        Task<UserActivityReport> GenerateUserActivityReportAsync(DateTime startDate, DateTime endDate);
        Task<AlertsReport> GenerateAlertsReportAsync(int? warehouseId = null);
        Task<List<DashboardKPI>> GetDashboardKPIsAsync(int? warehouseId = null);
    }

    public class ReportService : IReportService
    {
        private readonly WarehouseDbContext _context;
        private readonly ILogger<ReportService> _logger;

        public ReportService(WarehouseDbContext context, ILogger<ReportService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<InventoryReport> GenerateInventoryReportAsync(int? warehouseId = null, int? zoneId = null)
        {
            try
            {
                var query = _context.BinContents
                    .Include(bc => bc.Product)
                    .Include(bc => bc.Bin)
                        .ThenInclude(b => b.Rack)
                            .ThenInclude(r => r.Warehouse)
                    .Include(bc => bc.Bin)
                        .ThenInclude(b => b.Rack)
                            .ThenInclude(r => r.Zone)
                    .AsQueryable();

                if (warehouseId.HasValue)
                    query = query.Where(bc => bc.Bin.Rack.WarehouseId == warehouseId.Value);

                if (zoneId.HasValue)
                    query = query.Where(bc => bc.Bin.Rack.ZoneId == zoneId.Value);

                var inventoryData = await query.ToListAsync();

                var report = new InventoryReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    WarehouseId = warehouseId,
                    ZoneId = zoneId,
                    TotalItems = inventoryData.Sum(i => i.Quantity),
                    TotalValue = inventoryData.Sum(i => i.Quantity * i.UnitCost),
                    TotalProducts = inventoryData.Select(i => i.ProductId).Distinct().Count(),
                    Items = inventoryData.Select(bc => new InventoryItem
                    {
                        ProductSKU = bc.Product.SKU,
                        ProductName = bc.Product.Name,
                        WarehouseName = bc.Bin.Rack.Warehouse.Name,
                        ZoneName = bc.Bin.Rack.Zone?.Name ?? "No Zone",
                        RackCode = bc.Bin.Rack.Code,
                        BinPosition = bc.Bin.Position,
                        Quantity = bc.Quantity,
                        UnitCost = bc.UnitCost,
                        TotalValue = bc.Quantity * bc.UnitCost,
                        ExpiryDate = bc.ExpiryDate,
                        LastUpdated = bc.ModifiedDate ?? bc.CreatedDate
                    }).ToList()
                };

                // Calculate additional metrics
                report.LowStockItems = report.Items.Where(i => i.Quantity < 10).Count(); // Configurable threshold
                report.ExpiringItems = report.Items.Where(i => i.ExpiryDate.HasValue && i.ExpiryDate.Value <= DateTime.UtcNow.AddDays(30)).Count();
                
                // Group by category
                report.CategoryBreakdown = inventoryData
                    .GroupBy(bc => bc.Product.Category)
                    .Select(g => new CategoryInventory
                    {
                        Category = g.Key,
                        TotalQuantity = g.Sum(i => i.Quantity),
                        TotalValue = g.Sum(i => i.Quantity * i.UnitCost),
                        ProductCount = g.Select(i => i.ProductId).Distinct().Count()
                    }).ToList();

                _logger.LogInformation("Inventory report generated for warehouse {WarehouseId}, zone {ZoneId}: {ItemCount} items", 
                    warehouseId, zoneId, report.Items.Count);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating inventory report");
                throw;
            }
        }

        public async Task<MovementReport> GenerateMovementReportAsync(DateTime startDate, DateTime endDate, int? warehouseId = null)
        {
            try
            {
                var query = _context.StockMovements
                    .Include(sm => sm.Product)
                    .Include(sm => sm.FromBin)
                        .ThenInclude(b => b.Rack)
                    .Include(sm => sm.ToBin)
                        .ThenInclude(b => b.Rack)
                    .Include(sm => sm.User)
                    .Where(sm => sm.MovementDate >= startDate && sm.MovementDate <= endDate);

                if (warehouseId.HasValue)
                {
                    query = query.Where(sm => 
                        (sm.FromBin != null && sm.FromBin.Rack.WarehouseId == warehouseId.Value) ||
                        (sm.ToBin != null && sm.ToBin.Rack.WarehouseId == warehouseId.Value));
                }

                var movements = await query.ToListAsync();

                var report = new MovementReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    StartDate = startDate,
                    EndDate = endDate,
                    WarehouseId = warehouseId,
                    TotalMovements = movements.Count,
                    TotalQuantityMoved = movements.Sum(m => m.Quantity),
                    Movements = movements.Select(sm => new MovementItem
                    {
                        Date = sm.MovementDate,
                        Type = sm.MovementType,
                        ProductSKU = sm.Product.SKU,
                        ProductName = sm.Product.Name,
                        Quantity = sm.Quantity,
                        FromLocation = sm.FromBin != null ? $"{sm.FromBin.Rack.Code}-{sm.FromBin.Position}" : "",
                        ToLocation = sm.ToBin != null ? $"{sm.ToBin.Rack.Code}-{sm.ToBin.Position}" : "",
                        Reason = sm.Reason,
                        UserName = sm.User?.Username ?? "",
                        Reference = sm.Reference
                    }).ToList()
                };

                // Calculate movement type breakdown
                report.MovementTypeBreakdown = movements
                    .GroupBy(m => m.MovementType)
                    .Select(g => new MovementTypeBreakdown
                    {
                        MovementType = g.Key,
                        Count = g.Count(),
                        TotalQuantity = g.Sum(m => m.Quantity)
                    }).ToList();

                // Calculate daily activity
                report.DailyActivity = movements
                    .GroupBy(m => m.MovementDate.Date)
                    .Select(g => new DailyMovementActivity
                    {
                        Date = g.Key,
                        MovementCount = g.Count(),
                        TotalQuantity = g.Sum(m => m.Quantity)
                    })
                    .OrderBy(d => d.Date)
                    .ToList();

                _logger.LogInformation("Movement report generated for period {StartDate} to {EndDate}: {MovementCount} movements", 
                    startDate, endDate, report.TotalMovements);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating movement report");
                throw;
            }
        }

        public async Task<PerformanceReport> GeneratePerformanceReportAsync(DateTime startDate, DateTime endDate, int? warehouseId = null)
        {
            try
            {
                var tasksQuery = _context.WarehouseTasks
                    .Include(t => t.AssignedUser)
                    .Include(t => t.Bin)
                        .ThenInclude(b => b.Rack)
                            .ThenInclude(r => r.Warehouse)
                    .Where(t => t.CreatedDate >= startDate && t.CreatedDate <= endDate);

                if (warehouseId.HasValue)
                    tasksQuery = tasksQuery.Where(t => t.Bin.Rack.WarehouseId == warehouseId.Value);

                var tasks = await tasksQuery.ToListAsync();

                var completedTasks = tasks.Where(t => t.Status == TaskStatus.Completed).ToList();

                var report = new PerformanceReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    StartDate = startDate,
                    EndDate = endDate,
                    WarehouseId = warehouseId,
                    TotalTasks = tasks.Count,
                    CompletedTasks = completedTasks.Count,
                    PendingTasks = tasks.Count(t => t.Status == TaskStatus.Pending),
                    InProgressTasks = tasks.Count(t => t.Status == TaskStatus.InProgress),
                    CompletionRate = tasks.Count > 0 ? (double)completedTasks.Count / tasks.Count * 100 : 0
                };

                // Calculate average completion time
                var tasksWithCompletionTime = completedTasks.Where(t => t.CompletedDate.HasValue).ToList();
                if (tasksWithCompletionTime.Any())
                {
                    var totalMinutes = tasksWithCompletionTime.Sum(t => (t.CompletedDate!.Value - t.CreatedDate).TotalMinutes);
                    report.AverageCompletionTimeMinutes = totalMinutes / tasksWithCompletionTime.Count;
                }

                // Task type performance
                report.TaskTypePerformance = tasks
                    .GroupBy(t => t.TaskType)
                    .Select(g => new TaskTypePerformance
                    {
                        TaskType = g.Key,
                        TotalTasks = g.Count(),
                        CompletedTasks = g.Count(t => t.Status == TaskStatus.Completed),
                        CompletionRate = g.Count() > 0 ? (double)g.Count(t => t.Status == TaskStatus.Completed) / g.Count() * 100 : 0,
                        AverageCompletionTimeMinutes = g.Where(t => t.Status == TaskStatus.Completed && t.CompletedDate.HasValue)
                            .Average(t => (t.CompletedDate!.Value - t.CreatedDate).TotalMinutes)
                    }).ToList();

                // User performance
                report.UserPerformance = tasks
                    .Where(t => t.AssignedUserId.HasValue)
                    .GroupBy(t => new { t.AssignedUserId, UserName = t.AssignedUser!.Username })
                    .Select(g => new UserPerformance
                    {
                        UserId = g.Key.AssignedUserId!.Value,
                        UserName = g.Key.UserName,
                        TotalTasks = g.Count(),
                        CompletedTasks = g.Count(t => t.Status == TaskStatus.Completed),
                        CompletionRate = g.Count() > 0 ? (double)g.Count(t => t.Status == TaskStatus.Completed) / g.Count() * 100 : 0,
                        AverageCompletionTimeMinutes = g.Where(t => t.Status == TaskStatus.Completed && t.CompletedDate.HasValue)
                            .DefaultIfEmpty()
                            .Average(t => t != null ? (t.CompletedDate!.Value - t.CreatedDate).TotalMinutes : 0)
                    }).ToList();

                _logger.LogInformation("Performance report generated for period {StartDate} to {EndDate}: {TaskCount} tasks analyzed", 
                    startDate, endDate, report.TotalTasks);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating performance report");
                throw;
            }
        }

        public async Task<BinUtilizationReport> GenerateBinUtilizationReportAsync(int? warehouseId = null)
        {
            try
            {
                var binsQuery = _context.Bins
                    .Include(b => b.Rack)
                        .ThenInclude(r => r.Warehouse)
                    .Include(b => b.Rack)
                        .ThenInclude(r => r.Zone)
                    .Include(b => b.BinContents)
                    .AsQueryable();

                if (warehouseId.HasValue)
                    binsQuery = binsQuery.Where(b => b.Rack.WarehouseId == warehouseId.Value);

                var bins = await binsQuery.ToListAsync();

                var report = new BinUtilizationReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    WarehouseId = warehouseId,
                    TotalBins = bins.Count,
                    OccupiedBins = bins.Count(b => b.BinContents.Any()),
                    EmptyBins = bins.Count(b => !b.BinContents.Any()),
                    UtilizationRate = bins.Count > 0 ? (double)bins.Count(b => b.BinContents.Any()) / bins.Count * 100 : 0
                };

                // Calculate weight and volume utilization
                var occupiedBins = bins.Where(b => b.BinContents.Any()).ToList();
                if (occupiedBins.Any())
                {
                    report.AverageWeightUtilization = occupiedBins.Average(b => (double)b.CurrentWeight / b.MaxWeight * 100);
                    report.AverageVolumeUtilization = occupiedBins.Average(b => (double)b.CurrentVolume / b.MaxVolume * 100);
                }

                // Bin status breakdown
                report.StatusBreakdown = bins
                    .GroupBy(b => b.Status)
                    .Select(g => new BinStatusBreakdown
                    {
                        Status = g.Key,
                        Count = g.Count(),
                        Percentage = bins.Count > 0 ? (double)g.Count() / bins.Count * 100 : 0
                    }).ToList();

                // Zone utilization
                report.ZoneUtilization = bins
                    .GroupBy(b => new { b.Rack.ZoneId, ZoneName = b.Rack.Zone != null ? b.Rack.Zone.Name : "No Zone" })
                    .Select(g => new ZoneUtilization
                    {
                        ZoneId = g.Key.ZoneId,
                        ZoneName = g.Key.ZoneName,
                        TotalBins = g.Count(),
                        OccupiedBins = g.Count(b => b.BinContents.Any()),
                        UtilizationRate = g.Count() > 0 ? (double)g.Count(b => b.BinContents.Any()) / g.Count() * 100 : 0
                    }).ToList();

                _logger.LogInformation("Bin utilization report generated for warehouse {WarehouseId}: {BinCount} bins analyzed", 
                    warehouseId, report.TotalBins);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating bin utilization report");
                throw;
            }
        }

        public async Task<ProductAnalysisReport> GenerateProductAnalysisReportAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                var movements = await _context.StockMovements
                    .Include(sm => sm.Product)
                    .Where(sm => sm.MovementDate >= startDate && sm.MovementDate <= endDate)
                    .ToListAsync();

                var inventory = await _context.BinContents
                    .Include(bc => bc.Product)
                    .ToListAsync();

                var report = new ProductAnalysisReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    StartDate = startDate,
                    EndDate = endDate
                };

                // Most moved products
                report.MostMovedProducts = movements
                    .GroupBy(m => new { m.ProductId, m.Product.SKU, m.Product.Name })
                    .Select(g => new ProductMovementSummary
                    {
                        ProductId = g.Key.ProductId,
                        ProductSKU = g.Key.SKU,
                        ProductName = g.Key.Name,
                        TotalMovements = g.Count(),
                        TotalQuantityMoved = g.Sum(m => m.Quantity)
                    })
                    .OrderByDescending(p => p.TotalMovements)
                    .Take(20)
                    .ToList();

                // Slow moving products
                var allProducts = await _context.Products.ToListAsync();
                var productMovements = movements.GroupBy(m => m.ProductId).ToDictionary(g => g.Key, g => g.Count());
                
                report.SlowMovingProducts = allProducts
                    .Where(p => !productMovements.ContainsKey(p.Id) || productMovements[p.Id] <= 2)
                    .Select(p => new ProductMovementSummary
                    {
                        ProductId = p.Id,
                        ProductSKU = p.SKU,
                        ProductName = p.Name,
                        TotalMovements = productMovements.GetValueOrDefault(p.Id, 0),
                        TotalQuantityMoved = 0
                    })
                    .Take(20)
                    .ToList();

                // Category analysis
                report.CategoryAnalysis = inventory
                    .GroupBy(bc => bc.Product.Category)
                    .Select(g => new CategoryAnalysis
                    {
                        Category = g.Key,
                        ProductCount = g.Select(bc => bc.ProductId).Distinct().Count(),
                        TotalQuantity = g.Sum(bc => bc.Quantity),
                        TotalValue = g.Sum(bc => bc.Quantity * bc.UnitCost),
                        AverageUnitCost = g.Average(bc => bc.UnitCost)
                    }).ToList();

                _logger.LogInformation("Product analysis report generated for period {StartDate} to {EndDate}", startDate, endDate);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating product analysis report");
                throw;
            }
        }

        public async Task<UserActivityReport> GenerateUserActivityReportAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                var auditLogs = await _context.AuditLogs
                    .Include(al => al.User)
                    .Where(al => al.Timestamp >= startDate && al.Timestamp <= endDate)
                    .ToListAsync();

                var tasks = await _context.WarehouseTasks
                    .Include(wt => wt.AssignedUser)
                    .Where(wt => wt.CreatedDate >= startDate && wt.CreatedDate <= endDate)
                    .ToListAsync();

                var report = new UserActivityReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    StartDate = startDate,
                    EndDate = endDate,
                    TotalActivities = auditLogs.Count,
                    TotalTasks = tasks.Count
                };

                // User activity summary
                report.UserActivities = auditLogs
                    .GroupBy(al => new { al.UserId, UserName = al.User != null ? al.User.Username : "System" })
                    .Select(g => new UserActivitySummary
                    {
                        UserId = g.Key.UserId,
                        UserName = g.Key.UserName,
                        TotalActivities = g.Count(),
                        TasksAssigned = tasks.Count(t => t.AssignedUserId == g.Key.UserId),
                        TasksCompleted = tasks.Count(t => t.AssignedUserId == g.Key.UserId && t.Status == TaskStatus.Completed),
                        LastActivity = g.Max(al => al.Timestamp)
                    }).ToList();

                // Activity type breakdown
                report.ActivityTypeBreakdown = auditLogs
                    .GroupBy(al => al.Action)
                    .Select(g => new ActivityTypeBreakdown
                    {
                        ActivityType = g.Key,
                        Count = g.Count(),
                        Percentage = auditLogs.Count > 0 ? (double)g.Count() / auditLogs.Count * 100 : 0
                    }).ToList();

                _logger.LogInformation("User activity report generated for period {StartDate} to {EndDate}: {ActivityCount} activities", 
                    startDate, endDate, report.TotalActivities);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating user activity report");
                throw;
            }
        }

        public async Task<AlertsReport> GenerateAlertsReportAsync(int? warehouseId = null)
        {
            try
            {
                var inventoryQuery = _context.BinContents
                    .Include(bc => bc.Product)
                    .Include(bc => bc.Bin)
                        .ThenInclude(b => b.Rack)
                            .ThenInclude(r => r.Warehouse)
                    .AsQueryable();

                if (warehouseId.HasValue)
                    inventoryQuery = inventoryQuery.Where(bc => bc.Bin.Rack.WarehouseId == warehouseId.Value);

                var inventory = await inventoryQuery.ToListAsync();

                var binsQuery = _context.Bins
                    .Include(b => b.Rack)
                        .ThenInclude(r => r.Warehouse)
                    .AsQueryable();

                if (warehouseId.HasValue)
                    binsQuery = binsQuery.Where(b => b.Rack.WarehouseId == warehouseId.Value);

                var bins = await binsQuery.ToListAsync();

                var report = new AlertsReport
                {
                    GeneratedDate = DateTime.UtcNow,
                    WarehouseId = warehouseId,
                    Alerts = new List<Alert>()
                };

                // Low stock alerts
                var lowStockThreshold = 10; // Configurable
                var lowStockItems = inventory.Where(bc => bc.Quantity <= lowStockThreshold).ToList();
                foreach (var item in lowStockItems)
                {
                    report.Alerts.Add(new Alert
                    {
                        Type = AlertType.LowStock,
                        Severity = item.Quantity == 0 ? AlertSeverity.Critical : AlertSeverity.Warning,
                        Message = $"Low stock: {item.Product.SKU} ({item.Product.Name}) - Quantity: {item.Quantity}",
                        Location = $"{item.Bin.Rack.Warehouse.Name} - {item.Bin.Rack.Code}-{item.Bin.Position}",
                        CreatedDate = DateTime.UtcNow
                    });
                }

                // Expiring items alerts
                var expiringItems = inventory.Where(bc => bc.ExpiryDate.HasValue && bc.ExpiryDate.Value <= DateTime.UtcNow.AddDays(30)).ToList();
                foreach (var item in expiringItems)
                {
                    var daysToExpiry = (item.ExpiryDate!.Value - DateTime.UtcNow).Days;
                    report.Alerts.Add(new Alert
                    {
                        Type = AlertType.ExpiringProduct,
                        Severity = daysToExpiry <= 7 ? AlertSeverity.Critical : AlertSeverity.Warning,
                        Message = $"Product expiring in {daysToExpiry} days: {item.Product.SKU} ({item.Product.Name})",
                        Location = $"{item.Bin.Rack.Warehouse.Name} - {item.Bin.Rack.Code}-{item.Bin.Position}",
                        CreatedDate = DateTime.UtcNow
                    });
                }

                // Overweight bins
                var overweightBins = bins.Where(b => b.CurrentWeight > b.MaxWeight).ToList();
                foreach (var bin in overweightBins)
                {
                    report.Alerts.Add(new Alert
                    {
                        Type = AlertType.OverweightBin,
                        Severity = AlertSeverity.Warning,
                        Message = $"Bin over weight limit: {bin.Rack.Code}-{bin.Position} ({bin.CurrentWeight}/{bin.MaxWeight})",
                        Location = $"{bin.Rack.Warehouse.Name} - {bin.Rack.Code}-{bin.Position}",
                        CreatedDate = DateTime.UtcNow
                    });
                }

                // Calculate alert summary
                report.TotalAlerts = report.Alerts.Count;
                report.CriticalAlerts = report.Alerts.Count(a => a.Severity == AlertSeverity.Critical);
                report.WarningAlerts = report.Alerts.Count(a => a.Severity == AlertSeverity.Warning);
                report.InfoAlerts = report.Alerts.Count(a => a.Severity == AlertSeverity.Info);

                _logger.LogInformation("Alerts report generated for warehouse {WarehouseId}: {AlertCount} alerts found", 
                    warehouseId, report.TotalAlerts);

                return report;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating alerts report");
                throw;
            }
        }

        public async Task<List<DashboardKPI>> GetDashboardKPIsAsync(int? warehouseId = null)
        {
            try
            {
                var kpis = new List<DashboardKPI>();

                // Total bins
                var binsQuery = _context.Bins.AsQueryable();
                if (warehouseId.HasValue)
                    binsQuery = binsQuery.Where(b => b.Rack.WarehouseId == warehouseId.Value);
                
                var totalBins = await binsQuery.CountAsync();
                var occupiedBins = await binsQuery.CountAsync(b => b.BinContents.Any());

                kpis.Add(new DashboardKPI
                {
                    Name = "Total Bins",
                    Value = totalBins.ToString(),
                    Description = "Total number of bins",
                    Type = KPIType.Count
                });

                kpis.Add(new DashboardKPI
                {
                    Name = "Bin Utilization",
                    Value = totalBins > 0 ? $"{(double)occupiedBins / totalBins * 100:F1}%" : "0%",
                    Description = "Percentage of bins currently occupied",
                    Type = KPIType.Percentage
                });

                // Total inventory value
                var inventoryQuery = _context.BinContents.AsQueryable();
                if (warehouseId.HasValue)
                    inventoryQuery = inventoryQuery.Where(bc => bc.Bin.Rack.WarehouseId == warehouseId.Value);

                var totalValue = await inventoryQuery.SumAsync(bc => bc.Quantity * bc.UnitCost);
                kpis.Add(new DashboardKPI
                {
                    Name = "Inventory Value",
                    Value = $"${totalValue:N2}",
                    Description = "Total value of current inventory",
                    Type = KPIType.Currency
                });

                // Today's movements
                var today = DateTime.Today;
                var todayMovements = await _context.StockMovements
                    .CountAsync(sm => sm.MovementDate >= today);

                kpis.Add(new DashboardKPI
                {
                    Name = "Today's Movements",
                    Value = todayMovements.ToString(),
                    Description = "Number of stock movements today",
                    Type = KPIType.Count
                });

                // Pending tasks
                var pendingTasks = await _context.WarehouseTasks
                    .CountAsync(t => t.Status == TaskStatus.Pending);

                kpis.Add(new DashboardKPI
                {
                    Name = "Pending Tasks",
                    Value = pendingTasks.ToString(),
                    Description = "Number of pending warehouse tasks",
                    Type = KPIType.Count
                });

                return kpis;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating dashboard KPIs");
                return new List<DashboardKPI>();
            }
        }
    }
}
