using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Text.Json;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Models.Entities;

namespace WarehouseManagement.Desktop.Services;

public interface IWarehouseOperationsService
{
    // High-performance bin operations
    Task<PagedResult<BinDto>> GetBinsAsync(Guid warehouseId, BinSearchCriteria criteria, CancellationToken cancellationToken = default);
    Task<BinDto?> GetBinAsync(Guid warehouseId, Guid binId, CancellationToken cancellationToken = default);
    Task<BinDto?> GetBinByCodeAsync(Guid warehouseId, string binCode, CancellationToken cancellationToken = default);
    Task<BinDto> CreateBinAsync(CreateBinDto createBinDto, string userId, CancellationToken cancellationToken = default);
    Task<BinDto> UpdateBinAsync(Guid binId, UpdateBinDto updateBinDto, string userId, CancellationToken cancellationToken = default);

    // Smart allocation algorithms
    Task<AllocationResultDto> FindOptimalBinsAsync(Guid warehouseId, string sku, int quantity, AllocationPreferences preferences, CancellationToken cancellationToken = default);
    Task<AllocationResultDto> AutoAllocateQuantityAsync(Guid warehouseId, string sku, int quantity, AllocationPreferences preferences, CancellationToken cancellationToken = default);

    // FIFO picking operations
    Task<PickPlanDto> FindProductsForPickingAsync(Guid warehouseId, string sku, int requiredQuantity, CancellationToken cancellationToken = default);
    Task<PickPlanDto> OptimizePickRouteAsync(Guid warehouseId, List<PickRequestDto> items, CancellationToken cancellationToken = default);

    // Task management
    Task<PutAwayTaskDto> CreatePutAwayTaskAsync(CreatePutAwayTaskDto createTaskDto, string userId, CancellationToken cancellationToken = default);
    Task<PickTaskDto> CreatePickTaskAsync(CreatePickTaskDto createTaskDto, string userId, CancellationToken cancellationToken = default);
    Task<PutAwayTaskDto> ExecutePutAwayAsync(Guid taskId, Guid actualBinId, int actualQuantity, string userId, CancellationToken cancellationToken = default);
    Task<PickTaskDto> ExecutePickAsync(Guid taskId, List<PickExecutionDto> pickedItems, string userId, CancellationToken cancellationToken = default);

    // Bin locking for concurrent operations
    Task LockBinsForPickingAsync(Guid warehouseId, List<Guid> binIds, string operationId, CancellationToken cancellationToken = default);
    Task ReleaseBinsFromPickingAsync(Guid warehouseId, List<Guid> binIds, string operationId, CancellationToken cancellationToken = default);
    Task<bool> AreBinsLockedAsync(Guid warehouseId, List<Guid> binIds, CancellationToken cancellationToken = default);

    // Bulk operations for high-load scenarios
    Task<BulkOperationResultDto> BulkCreateBinsAsync(List<CreateBinDto> bins, string userId, CancellationToken cancellationToken = default);
    Task<BulkOperationResultDto> BulkUpdateBinsAsync(List<BulkBinUpdateDto> updates, string userId, CancellationToken cancellationToken = default);
    Task<BulkOperationResultDto> BulkExecutePutAwayAsync(List<BulkPutAwayDto> putAways, string userId, CancellationToken cancellationToken = default);

    // Analytics and reporting
    Task<DashboardStatsDto> GetDashboardStatsAsync(Guid warehouseId, CancellationToken cancellationToken = default);
    Task<List<StockMovementDto>> GetStockMovementHistoryAsync(Guid warehouseId, StockMovementFilter filter, CancellationToken cancellationToken = default);
}

public class WarehouseOperationsService : IWarehouseOperationsService
{
    private readonly WarehouseDbContext _context;
    private readonly IMemoryCache _cache;
    private readonly ILogger<WarehouseOperationsService> _logger;
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, BinLockInfo>> _activeBinLocks = new();
    private readonly SemaphoreSlim _lockSemaphore = new(1, 1);

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public WarehouseOperationsService(
        WarehouseDbContext context,
        IMemoryCache cache,
        ILogger<WarehouseOperationsService> logger)
    {
        _context = context;
        _cache = cache;
        _logger = logger;
    }

    public async Task<PagedResult<BinDto>> GetBinsAsync(Guid warehouseId, BinSearchCriteria criteria, CancellationToken cancellationToken = default)
    {
        var cacheKey = $"bins:{warehouseId}:{criteria.GetHashCode()}:{criteria.Page}:{criteria.PageSize}";
        
        if (_cache.TryGetValue(cacheKey, out PagedResult<BinDto>? cachedResult))
        {
            return cachedResult!;
        }

        var query = _context.Bins
            .Where(b => b.WarehouseId == warehouseId)
            .Include(b => b.Zone)
            .Include(b => b.Rack)
            .AsNoTracking();

        // Apply filters
        query = ApplyBinFilters(query, criteria);

        // Apply sorting
        query = ApplySorting(query, criteria.SortBy, criteria.SortDescending);

        // Get total count
        var totalCount = await query.CountAsync(cancellationToken);

        // Apply pagination
        var bins = await query
            .Skip((criteria.Page - 1) * criteria.PageSize)
            .Take(criteria.PageSize)
            .ToListAsync(cancellationToken);

        var binDtos = bins.Select(MapToBinDto).ToList();

        var result = new PagedResult<BinDto>(
            binDtos,
            totalCount,
            criteria.Page,
            criteria.PageSize,
            (int)Math.Ceiling((double)totalCount / criteria.PageSize),
            criteria.Page * criteria.PageSize < totalCount,
            criteria.Page > 1
        );

        // Cache for 1 minute
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(1));

        return result;
    }

    public async Task<BinDto?> GetBinAsync(Guid warehouseId, Guid binId, CancellationToken cancellationToken = default)
    {
        var cacheKey = $"bin:{warehouseId}:{binId}";
        
        if (_cache.TryGetValue(cacheKey, out BinDto? cachedBin))
        {
            return cachedBin;
        }

        var bin = await _context.Bins
            .Include(b => b.Zone)
            .Include(b => b.Rack)
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.WarehouseId == warehouseId && b.Id == binId, cancellationToken);

        if (bin == null) return null;

        var binDto = MapToBinDto(bin);
        _cache.Set(cacheKey, binDto, TimeSpan.FromMinutes(5));

        return binDto;
    }

    public async Task<BinDto?> GetBinByCodeAsync(Guid warehouseId, string binCode, CancellationToken cancellationToken = default)
    {
        var bin = await _context.Bins
            .Include(b => b.Zone)
            .Include(b => b.Rack)
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.WarehouseId == warehouseId && b.Code == binCode, cancellationToken);

        return bin != null ? MapToBinDto(bin) : null;
    }

    public async Task<AllocationResultDto> FindOptimalBinsAsync(Guid warehouseId, string sku, int quantity, AllocationPreferences preferences, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        _logger.LogInformation("Finding optimal bins for {Sku}, quantity {Quantity} in warehouse {WarehouseId}", sku, quantity, warehouseId);

        // Get all available bins with sufficient capacity
        var availableBins = await _context.Bins
            .Where(b => b.WarehouseId == warehouseId)
            .Where(b => b.Status == "available" || b.Status == "occupied")
            .Where(b => b.Capacity - b.CurrentQty >= quantity || (preferences.AllowPartialAllocation && b.Capacity - b.CurrentQty > 0))
            .Include(b => b.Zone)
            .Include(b => b.Rack)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        // Apply zone filter if specified
        if (preferences.PreferredZoneId.HasValue)
        {
            availableBins = availableBins.Where(b => b.ZoneId == preferences.PreferredZoneId.Value).ToList();
        }

        // Score and rank bins using intelligent allocation algorithm
        var scoredBins = availableBins
            .Select(bin => new ScoredBin
            {
                Bin = bin,
                Score = CalculateBinAllocationScore(bin, sku, quantity, preferences),
                AvailableCapacity = bin.Capacity - bin.CurrentQty
            })
            .Where(sb => sb.AvailableCapacity > 0)
            .OrderByDescending(sb => sb.Score)
            .ToList();

        // Create allocation plan
        var allocationPlan = new List<BinAllocationDto>();
        var remainingQuantity = quantity;

        foreach (var scoredBin in scoredBins)
        {
            if (remainingQuantity <= 0) break;

            var allocateQuantity = Math.Min(remainingQuantity, scoredBin.AvailableCapacity);
            var utilizationAfter = (int)((scoredBin.Bin.CurrentQty + allocateQuantity) / (double)scoredBin.Bin.Capacity * 100);

            var allocationType = DetermineAllocationType(scoredBin.Bin, sku);
            var reason = GetAllocationReason(scoredBin.Bin, sku, allocateQuantity, allocationType);

            allocationPlan.Add(new BinAllocationDto(
                MapToBinDto(scoredBin.Bin),
                allocateQuantity,
                utilizationAfter,
                allocationType,
                reason,
                scoredBin.Score
            ));

            remainingQuantity -= allocateQuantity;
        }

        var totalAllocated = quantity - remainingQuantity;
        var result = new AllocationResultDto(
            allocationPlan,
            totalAllocated,
            remainingQuantity,
            remainingQuantity == 0,
            "SmartAllocation"
        );

        var processingTime = DateTime.UtcNow - startTime;
        _logger.LogInformation("Found {BinCount} bins for allocation in {ProcessingTime}ms", allocationPlan.Count, processingTime.TotalMilliseconds);

        return result;
    }

    public async Task<PickPlanDto> FindProductsForPickingAsync(Guid warehouseId, string sku, int requiredQuantity, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        _logger.LogInformation("Finding products for picking: {Sku}, quantity {Quantity} in warehouse {WarehouseId}", sku, requiredQuantity, warehouseId);

        // Get bins containing the SKU (including mixed bins)
        var productBins = await _context.Bins
            .Where(b => b.WarehouseId == warehouseId)
            .Where(b => b.Status == "occupied")
            .Where(b => b.Sku == sku || (b.MixedContents != null && b.MixedContents.Contains(sku)))
            .Include(b => b.Zone)
            .Include(b => b.Rack)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var availableBins = new List<AvailableBin>();

        foreach (var bin in productBins)
        {
            var availableQuantity = 0;
            var skuInfo = new SkuInfo { Sku = sku, IsMixed = false };

            // Check if this is a mixed bin
            if (!string.IsNullOrEmpty(bin.MixedContents))
            {
                var mixedContents = JsonSerializer.Deserialize<List<MixedContentDto>>(bin.MixedContents, _jsonOptions);
                var matchingContent = mixedContents?.FirstOrDefault(c => c.Sku == sku);
                
                if (matchingContent != null)
                {
                    availableQuantity = matchingContent.Quantity;
                    skuInfo = new SkuInfo
                    {
                        Sku = sku,
                        LotNumber = matchingContent.LotNumber,
                        ExpiryDate = matchingContent.ExpiryDate,
                        IsMixed = true,
                        OriginalBinSku = bin.Sku
                    };
                }
            }
            else if (bin.Sku == sku)
            {
                availableQuantity = bin.CurrentQty;
                skuInfo = new SkuInfo
                {
                    Sku = sku,
                    LotNumber = bin.LotNumber,
                    ExpiryDate = bin.ExpiryDate,
                    IsMixed = false
                };
            }

            if (availableQuantity > 0)
            {
                availableBins.Add(new AvailableBin
                {
                    Bin = bin,
                    AvailableQuantity = availableQuantity,
                    SkuInfo = skuInfo,
                    ParsedExpiryDate = skuInfo.ExpiryDate,
                    ParsedCreatedAt = bin.CreatedAt
                });
            }
        }

        // Sort by FIFO logic
        var sortedBins = availableBins
            .OrderBy(b => b.ParsedExpiryDate ?? DateTime.MaxValue) // Earliest expiry first
            .ThenBy(b => b.ParsedCreatedAt) // Then by creation date
            .ThenBy(b => b.Bin.ShelfLevel) // Then by shelf level (ground level first)
            .ThenBy(b => b.Bin.Level) // Then by level (A, B, C...)
            .ThenBy(b => b.Bin.Code) // Finally by bin code for consistency
            .ToList();

        // Create pick plan
        var pickPlan = new List<PickPlanItemDto>();
        var remainingQuantity = requiredQuantity;
        var totalPicked = 0;

        foreach (var availableBin in sortedBins)
        {
            if (remainingQuantity <= 0) break;

            var pickQuantity = Math.Min(availableBin.AvailableQuantity, remainingQuantity);
            if (pickQuantity > 0)
            {
                var fifoReason = GetFifoReason(availableBin.SkuInfo);
                
                pickPlan.Add(new PickPlanItemDto(
                    MapToBinDto(availableBin.Bin),
                    pickQuantity,
                    availableBin.AvailableQuantity - pickQuantity,
                    fifoReason,
                    pickPlan.Count + 1,
                    availableBin.SkuInfo.IsMixed,
                    availableBin.SkuInfo.OriginalBinSku
                ));

                remainingQuantity -= pickQuantity;
                totalPicked += pickQuantity;
            }
        }

        var totalAvailable = availableBins.Sum(b => b.AvailableQuantity);
        var shortfall = Math.Max(0, remainingQuantity);
        var mixedBins = pickPlan.Count(p => p.IsMixed);

        var result = new PickPlanDto(
            pickPlan,
            totalAvailable,
            totalPicked,
            shortfall,
            shortfall == 0,
            true, // FIFO compliant by design
            pickPlan.Count,
            mixedBins
        );

        var processingTime = DateTime.UtcNow - startTime;
        _logger.LogInformation("Created pick plan with {BinCount} bins in {ProcessingTime}ms", pickPlan.Count, processingTime.TotalMilliseconds);

        return result;
    }

    public async Task LockBinsForPickingAsync(Guid warehouseId, List<Guid> binIds, string operationId, CancellationToken cancellationToken = default)
    {
        await _lockSemaphore.WaitAsync(cancellationToken);
        try
        {
            _logger.LogInformation("Locking {BinCount} bins for operation {OperationId}", binIds.Count, operationId);

            var warehouseLocks = _activeBinLocks.GetOrAdd(warehouseId, _ => new ConcurrentDictionary<Guid, BinLockInfo>());

            // Check for existing locks
            var alreadyLocked = binIds.Where(binId => warehouseLocks.ContainsKey(binId) && warehouseLocks[binId].OperationId != operationId).ToList();
            
            if (alreadyLocked.Any())
            {
                throw new InvalidOperationException($"Bins already locked: {string.Join(", ", alreadyLocked)}");
            }

            // Create database locks
            var binLocks = binIds.Select(binId => new BinLock
            {
                BinId = binId,
                OperationId = operationId,
                OperationType = "Pick",
                LockedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddMinutes(10),
                IsActive = true
            }).ToList();

            _context.BinLocks.AddRange(binLocks);
            await _context.SaveChangesAsync(cancellationToken);

            // Create in-memory locks
            var lockInfo = new BinLockInfo(operationId, DateTime.UtcNow);
            foreach (var binId in binIds)
            {
                warehouseLocks[binId] = lockInfo;
            }

            // Set cleanup timer
            _ = Task.Delay(TimeSpan.FromMinutes(10), cancellationToken).ContinueWith(async _ =>
            {
                await ReleaseBinsFromPickingAsync(warehouseId, binIds, operationId, CancellationToken.None);
            }, TaskScheduler.Default);
        }
        finally
        {
            _lockSemaphore.Release();
        }
    }

    public async Task ReleaseBinsFromPickingAsync(Guid warehouseId, List<Guid> binIds, string operationId, CancellationToken cancellationToken = default)
    {
        await _lockSemaphore.WaitAsync(cancellationToken);
        try
        {
            _logger.LogInformation("Releasing {BinCount} bins for operation {OperationId}", binIds.Count, operationId);

            // Remove database locks
            var locksToRemove = await _context.BinLocks
                .Where(bl => binIds.Contains(bl.BinId) && bl.OperationId == operationId && bl.IsActive)
                .ToListAsync(cancellationToken);

            foreach (var lockEntity in locksToRemove)
            {
                lockEntity.IsActive = false;
            }

            await _context.SaveChangesAsync(cancellationToken);

            // Remove in-memory locks
            if (_activeBinLocks.TryGetValue(warehouseId, out var warehouseLocks))
            {
                foreach (var binId in binIds)
                {
                    warehouseLocks.TryRemove(binId, out _);
                }
            }
        }
        finally
        {
            _lockSemaphore.Release();
        }
    }

    public async Task<bool> AreBinsLockedAsync(Guid warehouseId, List<Guid> binIds, CancellationToken cancellationToken = default)
    {
        // Check in-memory locks first (faster)
        if (_activeBinLocks.TryGetValue(warehouseId, out var warehouseLocks))
        {
            if (binIds.Any(binId => warehouseLocks.ContainsKey(binId)))
            {
                return true;
            }
        }

        // Check database locks (fallback)
        var hasLocks = await _context.BinLocks
            .AnyAsync(bl => binIds.Contains(bl.BinId) && bl.IsActive && bl.ExpiresAt > DateTime.UtcNow, cancellationToken);

        return hasLocks;
    }

    // Helper methods and private implementations continue...
    
    private static BinDto MapToBinDto(Bin bin)
    {
        List<MixedContentDto>? mixedContents = null;
        if (!string.IsNullOrEmpty(bin.MixedContents))
        {
            mixedContents = JsonSerializer.Deserialize<List<MixedContentDto>>(bin.MixedContents);
        }

        return new BinDto(
            bin.Id,
            bin.WarehouseId,
            bin.ZoneId,
            bin.RackId,
            bin.Code,
            bin.Level,
            bin.Position,
            bin.ShelfLevel,
            bin.Capacity,
            bin.CurrentQty,
            bin.Sku,
            bin.LotNumber,
            bin.ExpiryDate,
            bin.Status,
            mixedContents,
            bin.LastPutAwayAt,
            bin.LastPickedAt,
            bin.CreatedAt,
            bin.UpdatedAt,
            bin.AvailableCapacity,
            bin.UtilizationPercentage,
            bin.IsEmpty,
            bin.IsFull,
            bin.FullCode,
            bin.Zone?.Name,
            bin.Rack?.Name
        );
    }

    // Additional implementation methods would continue here...
    // This is a foundational structure for the high-performance service layer
}

// Supporting classes and records
public record AllocationPreferences(
    Guid? PreferredZoneId = null,
    bool PreferExistingSku = true,
    bool PreferGroundLevel = true,
    bool AllowMixedStorage = true,
    bool AllowPartialAllocation = false,
    int MaxBinsToUse = 10
);

public record PickRequestDto(string Sku, int Quantity, string? LotNumber = null, DateTime? ExpiryDate = null);

public record PickExecutionDto(Guid BinId, string Sku, int Quantity, string? LotNumber = null, DateTime? ExpiryDate = null);

public record BulkBinUpdateDto(Guid BinId, UpdateBinDto UpdateData);

public record BulkPutAwayDto(string Sku, int Quantity, string? LotNumber = null, DateTime? ExpiryDate = null);

public record StockMovementFilter(
    string? Sku = null,
    string? MovementType = null,
    DateTime? FromDate = null,
    DateTime? ToDate = null,
    int Page = 1,
    int PageSize = 100
);

internal class ScoredBin
{
    public Bin Bin { get; set; } = null!;
    public int Score { get; set; }
    public int AvailableCapacity { get; set; }
}

internal class AvailableBin
{
    public Bin Bin { get; set; } = null!;
    public int AvailableQuantity { get; set; }
    public SkuInfo SkuInfo { get; set; } = null!;
    public DateTime? ParsedExpiryDate { get; set; }
    public DateTime ParsedCreatedAt { get; set; }
}

internal class SkuInfo
{
    public string Sku { get; set; } = string.Empty;
    public string? LotNumber { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public bool IsMixed { get; set; }
    public string? OriginalBinSku { get; set; }
}

internal record BinLockInfo(string OperationId, DateTime LockedAt);
