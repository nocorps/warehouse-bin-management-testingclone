using System.ComponentModel.DataAnnotations;

namespace WarehouseManagement.Desktop.Models.DTOs;

public record WarehouseDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    string? Address,
    string? City,
    string? PostalCode,
    string? Country,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int TotalZones,
    int TotalRacks,
    int TotalBins,
    int OccupiedBins,
    double UtilizationPercentage
);

public record CreateWarehouseDto(
    [Required] string Name,
    [Required] string Code,
    string? Description,
    string? Address,
    string? City,
    string? PostalCode,
    string? Country
);

public record UpdateWarehouseDto(
    string? Name,
    string? Description,
    string? Address,
    string? City,
    string? PostalCode,
    string? Country,
    bool? IsActive
);

public record BinDto(
    Guid Id,
    Guid WarehouseId,
    Guid? ZoneId,
    Guid? RackId,
    string Code,
    string Level,
    int Position,
    int ShelfLevel,
    int Capacity,
    int CurrentQty,
    string? Sku,
    string? LotNumber,
    DateTime? ExpiryDate,
    string Status,
    List<MixedContentDto>? MixedContents,
    DateTime? LastPutAwayAt,
    DateTime? LastPickedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int AvailableCapacity,
    double UtilizationPercentage,
    bool IsEmpty,
    bool IsFull,
    string FullCode,
    string? ZoneName,
    string? RackName
);

public record CreateBinDto(
    [Required] Guid WarehouseId,
    Guid? ZoneId,
    Guid? RackId,
    [Required] string Code,
    [Required] string Level,
    [Range(1, 100)] int Position,
    [Range(1, 10)] int ShelfLevel,
    [Range(1, int.MaxValue)] int Capacity
);

public record UpdateBinDto(
    string? Code,
    string? Level,
    int? Position,
    int? ShelfLevel,
    int? Capacity,
    int? CurrentQty,
    string? Sku,
    string? LotNumber,
    DateTime? ExpiryDate,
    string? Status,
    List<MixedContentDto>? MixedContents
);

public record MixedContentDto(
    string Sku,
    int Quantity,
    string? LotNumber,
    DateTime? ExpiryDate
);

public record ZoneDto(
    Guid Id,
    Guid WarehouseId,
    string Code,
    string Name,
    string? Description,
    string ZoneType,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int TotalRacks,
    int TotalBins,
    int OccupiedBins,
    double UtilizationPercentage
);

public record CreateZoneDto(
    [Required] Guid WarehouseId,
    [Required] string Code,
    [Required] string Name,
    string? Description,
    string ZoneType = "General"
);

public record RackDto(
    Guid Id,
    Guid WarehouseId,
    Guid? ZoneId,
    string Code,
    string Name,
    int MaxLevels,
    int MaxPositions,
    int ShelfLevel,
    string? Description,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int TotalBins,
    int OccupiedBins,
    double UtilizationPercentage,
    string? ZoneName
);

public record CreateRackDto(
    [Required] Guid WarehouseId,
    Guid? ZoneId,
    [Required] string Code,
    [Required] string Name,
    [Range(1, 20)] int MaxLevels = 8,
    [Range(1, 50)] int MaxPositions = 10,
    [Range(1, 10)] int ShelfLevel = 1,
    string? Description
);

public record PutAwayTaskDto(
    Guid Id,
    Guid WarehouseId,
    string TaskNumber,
    string Sku,
    int Quantity,
    string? LotNumber,
    DateTime? ExpiryDate,
    Guid? SuggestedBinId,
    Guid? ActualBinId,
    int? ActualQuantity,
    string Status,
    string Priority,
    string? AssignedTo,
    DateTime? AssignedAt,
    DateTime? CompletedAt,
    string? Notes,
    string? AllocationType,
    string? AllocationReason,
    double? UtilizationAfter,
    bool IsOptimalPlacement,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    TimeSpan? ProcessingTime,
    bool IsOverdue,
    string? SuggestedBinCode,
    string? ActualBinCode
);

public record CreatePutAwayTaskDto(
    [Required] Guid WarehouseId,
    [Required] string Sku,
    [Range(1, int.MaxValue)] int Quantity,
    string? LotNumber,
    DateTime? ExpiryDate,
    string Priority = "normal",
    string? Notes
);

public record PickTaskDto(
    Guid Id,
    Guid WarehouseId,
    string TaskNumber,
    string? OrderNumber,
    string? CustomerCode,
    string Status,
    string Priority,
    string? AssignedTo,
    DateTime? AssignedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string? Notes,
    int TotalItems,
    int TotalQuantity,
    int CompletedItems,
    int CompletedQuantity,
    bool IsFifoCompliant,
    int BinsEmptied,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    double CompletionPercentage,
    TimeSpan? ProcessingTime,
    bool IsOverdue,
    List<PickTaskItemDto> Items
);

public record PickTaskItemDto(
    Guid Id,
    Guid PickTaskId,
    string Sku,
    int RequestedQuantity,
    int PickedQuantity,
    string? LotNumber,
    DateTime? ExpiryDate,
    Guid? BinId,
    string Status,
    bool IsFifoCompliant,
    string? FifoReason,
    bool BinEmptied,
    int PickOrder,
    DateTime? PickedAt,
    string? Notes,
    int ShortfallQuantity,
    bool IsFullyPicked,
    bool IsPartialPick,
    string? BinCode
);

public record CreatePickTaskDto(
    [Required] Guid WarehouseId,
    string? OrderNumber,
    string? CustomerCode,
    string Priority = "normal",
    string? Notes,
    [Required] List<CreatePickTaskItemDto> Items
);

public record CreatePickTaskItemDto(
    [Required] string Sku,
    [Range(1, int.MaxValue)] int RequestedQuantity,
    string? LotNumber,
    DateTime? ExpiryDate
);

public record StockMovementDto(
    Guid Id,
    Guid WarehouseId,
    string Sku,
    string MovementType,
    string? ReferenceNumber,
    Guid? FromBinId,
    Guid? ToBinId,
    int Quantity,
    string? LotNumber,
    DateTime? ExpiryDate,
    string? Reason,
    string? UserId,
    DateTime Timestamp,
    string? FromBinCode,
    string? ToBinCode,
    string? UserName
);

public record AllocationResultDto(
    List<BinAllocationDto> AllocationPlan,
    int TotalAllocated,
    int Shortfall,
    bool IsFullyAllocated,
    string Strategy
);

public record BinAllocationDto(
    BinDto Bin,
    int AllocatedQuantity,
    int UtilizationAfter,
    string AllocationType,
    string Reason,
    int Score
);

public record PickPlanDto(
    List<PickPlanItemDto> PickPlan,
    int TotalAvailable,
    int TotalPicked,
    int Shortfall,
    bool IsFullyAvailable,
    bool FifoCompliant,
    int BinsUsed,
    int MixedBins
);

public record PickPlanItemDto(
    BinDto Bin,
    int PickQuantity,
    int RemainingInBin,
    string FifoReason,
    int PickOrder,
    bool IsMixed,
    string? OriginalBinSku
);

public record BinSearchCriteria(
    string? Sku,
    string? Code,
    string? Status,
    Guid? ZoneId,
    Guid? RackId,
    int? MinCapacity,
    int? MaxCapacity,
    int? MinUtilization,
    int? MaxUtilization,
    bool? IsEmpty,
    bool? HasMixedContents,
    DateTime? CreatedAfter,
    DateTime? CreatedBefore,
    string? SortBy,
    bool SortDescending = false,
    int Page = 1,
    int PageSize = 50
);

public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages,
    bool HasNextPage,
    bool HasPreviousPage
);

public record DashboardStatsDto(
    int TotalWarehouses,
    int TotalBins,
    int OccupiedBins,
    int AvailableBins,
    double OverallUtilization,
    int PendingPutAwayTasks,
    int PendingPickTasks,
    int CompletedTasksToday,
    List<ZoneUtilizationDto> ZoneUtilizations,
    List<TopProductDto> TopProducts,
    List<RecentActivityDto> RecentActivities
);

public record ZoneUtilizationDto(
    string ZoneName,
    int TotalBins,
    int OccupiedBins,
    double UtilizationPercentage
);

public record TopProductDto(
    string Sku,
    string? ProductName,
    int TotalQuantity,
    int BinsOccupied
);

public record RecentActivityDto(
    string ActivityType,
    string Description,
    string? UserName,
    DateTime Timestamp
);

public record BulkOperationResultDto(
    int TotalItems,
    int SuccessfulItems,
    int FailedItems,
    List<string> Errors,
    TimeSpan ProcessingTime
);

public record ExcelImportResultDto(
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    List<string> ValidationErrors,
    List<object> ProcessedData
);

#region Report DTOs

public class InventoryReport
{
    public DateTime GeneratedDate { get; set; }
    public int? WarehouseId { get; set; }
    public int? ZoneId { get; set; }
    public int TotalItems { get; set; }
    public decimal TotalValue { get; set; }
    public int TotalProducts { get; set; }
    public int LowStockItems { get; set; }
    public int ExpiringItems { get; set; }
    public List<InventoryItem> Items { get; set; } = new();
    public List<CategoryInventory> CategoryBreakdown { get; set; } = new();
}

public class InventoryItem
{
    public string ProductSKU { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public string WarehouseName { get; set; } = string.Empty;
    public string ZoneName { get; set; } = string.Empty;
    public string RackCode { get; set; } = string.Empty;
    public string BinPosition { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
    public decimal TotalValue { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public DateTime LastUpdated { get; set; }
}

public class CategoryInventory
{
    public string Category { get; set; } = string.Empty;
    public int TotalQuantity { get; set; }
    public decimal TotalValue { get; set; }
    public int ProductCount { get; set; }
}

public class MovementReport
{
    public DateTime GeneratedDate { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? WarehouseId { get; set; }
    public int TotalMovements { get; set; }
    public int TotalQuantityMoved { get; set; }
    public List<MovementItem> Movements { get; set; } = new();
    public List<MovementTypeBreakdown> MovementTypeBreakdown { get; set; } = new();
    public List<DailyMovementActivity> DailyActivity { get; set; } = new();
}

public class MovementItem
{
    public DateTime Date { get; set; }
    public MovementType Type { get; set; }
    public string ProductSKU { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string FromLocation { get; set; } = string.Empty;
    public string ToLocation { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string Reference { get; set; } = string.Empty;
}

public class MovementTypeBreakdown
{
    public MovementType MovementType { get; set; }
    public int Count { get; set; }
    public int TotalQuantity { get; set; }
}

public class DailyMovementActivity
{
    public DateTime Date { get; set; }
    public int MovementCount { get; set; }
    public int TotalQuantity { get; set; }
}

public class PerformanceReport
{
    public DateTime GeneratedDate { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int? WarehouseId { get; set; }
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public int PendingTasks { get; set; }
    public int InProgressTasks { get; set; }
    public double CompletionRate { get; set; }
    public double AverageCompletionTimeMinutes { get; set; }
    public List<TaskTypePerformance> TaskTypePerformance { get; set; } = new();
    public List<UserPerformance> UserPerformance { get; set; } = new();
}

public class TaskTypePerformance
{
    public TaskType TaskType { get; set; }
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public double CompletionRate { get; set; }
    public double AverageCompletionTimeMinutes { get; set; }
}

public class UserPerformance
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int TotalTasks { get; set; }
    public int CompletedTasks { get; set; }
    public double CompletionRate { get; set; }
    public double AverageCompletionTimeMinutes { get; set; }
}

public class BinUtilizationReport
{
    public DateTime GeneratedDate { get; set; }
    public int? WarehouseId { get; set; }
    public int TotalBins { get; set; }
    public int OccupiedBins { get; set; }
    public int EmptyBins { get; set; }
    public double UtilizationRate { get; set; }
    public double AverageWeightUtilization { get; set; }
    public double AverageVolumeUtilization { get; set; }
    public List<BinStatusBreakdown> StatusBreakdown { get; set; } = new();
    public List<ZoneUtilization> ZoneUtilization { get; set; } = new();
}

public class BinStatusBreakdown
{
    public BinStatus Status { get; set; }
    public int Count { get; set; }
    public double Percentage { get; set; }
}

public class ZoneUtilization
{
    public int? ZoneId { get; set; }
    public string ZoneName { get; set; } = string.Empty;
    public int TotalBins { get; set; }
    public int OccupiedBins { get; set; }
    public double UtilizationRate { get; set; }
}

public class ProductAnalysisReport
{
    public DateTime GeneratedDate { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public List<ProductMovementSummary> MostMovedProducts { get; set; } = new();
    public List<ProductMovementSummary> SlowMovingProducts { get; set; } = new();
    public List<CategoryAnalysis> CategoryAnalysis { get; set; } = new();
}

public class ProductMovementSummary
{
    public int ProductId { get; set; }
    public string ProductSKU { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public int TotalMovements { get; set; }
    public int TotalQuantityMoved { get; set; }
}

public class CategoryAnalysis
{
    public string Category { get; set; } = string.Empty;
    public int ProductCount { get; set; }
    public int TotalQuantity { get; set; }
    public decimal TotalValue { get; set; }
    public decimal AverageUnitCost { get; set; }
}

public class UserActivityReport
{
    public DateTime GeneratedDate { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int TotalActivities { get; set; }
    public int TotalTasks { get; set; }
    public List<UserActivitySummary> UserActivities { get; set; } = new();
    public List<ActivityTypeBreakdown> ActivityTypeBreakdown { get; set; } = new();
}

public class UserActivitySummary
{
    public int? UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int TotalActivities { get; set; }
    public int TasksAssigned { get; set; }
    public int TasksCompleted { get; set; }
    public DateTime LastActivity { get; set; }
}

public class ActivityTypeBreakdown
{
    public string ActivityType { get; set; } = string.Empty;
    public int Count { get; set; }
    public double Percentage { get; set; }
}

public class AlertsReport
{
    public DateTime GeneratedDate { get; set; }
    public int? WarehouseId { get; set; }
    public int TotalAlerts { get; set; }
    public int CriticalAlerts { get; set; }
    public int WarningAlerts { get; set; }
    public int InfoAlerts { get; set; }
    public List<Alert> Alerts { get; set; } = new();
}

public class Alert
{
    public AlertType Type { get; set; }
    public AlertSeverity Severity { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
}

public class DashboardKPI
{
    public string Name { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public KPIType Type { get; set; }
}

#endregion

#region Enums

public enum AlertType
{
    LowStock,
    ExpiringProduct,
    OverweightBin,
    SystemError,
    MaintenanceRequired
}

public enum AlertSeverity
{
    Info,
    Warning,
    Critical
}

public enum KPIType
{
    Count,
    Percentage,
    Currency,
    Time,
    Weight,
    Volume
}

#endregion
