using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Threading.Channels;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Models.Entities;

namespace WarehouseManagement.Desktop.Services;

public interface IBulkOperationsService
{
    Task<BulkOperationResultDto> BulkCreateBinsAsync(List<CreateBinDto> bins, string userId, CancellationToken cancellationToken = default);
    Task<BulkOperationResultDto> BulkUpdateBinsAsync(List<BulkBinUpdateDto> updates, string userId, CancellationToken cancellationToken = default);
    Task<BulkOperationResultDto> BulkExecutePutAwayAsync(List<BulkPutAwayDto> putAways, string userId, CancellationToken cancellationToken = default);
    Task<BulkOperationResultDto> BulkExecutePickAsync(List<BulkPickDto> picks, string userId, CancellationToken cancellationToken = default);
}

public class BulkOperationsService : IBulkOperationsService
{
    private readonly WarehouseDbContext _context;
    private readonly ILogger<BulkOperationsService> _logger;
    private readonly SemaphoreSlim _bulkOperationSemaphore = new(Environment.ProcessorCount, Environment.ProcessorCount);
    
    private const int BatchSize = 1000;
    private const int MaxConcurrentBatches = 4;

    public BulkOperationsService(WarehouseDbContext context, ILogger<BulkOperationsService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<BulkOperationResultDto> BulkCreateBinsAsync(List<CreateBinDto> bins, string userId, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var errors = new ConcurrentBag<string>();
        var successCount = 0;
        
        _logger.LogInformation("Starting bulk bin creation for {BinCount} bins", bins.Count);

        try
        {
            await _bulkOperationSemaphore.WaitAsync(cancellationToken);

            // Process in batches for optimal performance
            var batches = bins.Chunk(BatchSize).ToList();
            var tasks = new List<Task>();

            var concurrencyLimiter = new SemaphoreSlim(MaxConcurrentBatches, MaxConcurrentBatches);

            foreach (var batch in batches)
            {
                tasks.Add(ProcessBinCreationBatch(batch.ToList(), userId, errors, cancellationToken, concurrencyLimiter));
            }

            await Task.WhenAll(tasks);
            
            // Count successful operations (total - errors)
            successCount = bins.Count - errors.Count;

            var processingTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("Bulk bin creation completed: {Success}/{Total} successful in {Time}ms", 
                successCount, bins.Count, processingTime.TotalMilliseconds);

            return new BulkOperationResultDto(
                bins.Count,
                successCount,
                errors.Count,
                errors.ToList(),
                processingTime
            );
        }
        finally
        {
            _bulkOperationSemaphore.Release();
        }
    }

    public async Task<BulkOperationResultDto> BulkUpdateBinsAsync(List<BulkBinUpdateDto> updates, string userId, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var errors = new ConcurrentBag<string>();
        var successCount = 0;

        _logger.LogInformation("Starting bulk bin update for {UpdateCount} bins", updates.Count);

        try
        {
            await _bulkOperationSemaphore.WaitAsync(cancellationToken);

            // Use parallel processing for better performance
            var partitioner = Partitioner.Create(updates, true);
            var parallelOptions = new ParallelOptions
            {
                CancellationToken = cancellationToken,
                MaxDegreeOfParallelism = Environment.ProcessorCount
            };

            await Parallel.ForEachAsync(partitioner, parallelOptions, async (update, ct) =>
            {
                try
                {
                    using var scope = _context.Database.BeginTransaction();
                    
                    var bin = await _context.Bins.FindAsync(new object[] { update.BinId }, ct);
                    if (bin == null)
                    {
                        errors.Add($"Bin {update.BinId} not found");
                        return;
                    }

                    // Apply updates
                    ApplyBinUpdates(bin, update.UpdateData, userId);

                    await _context.SaveChangesAsync(ct);
                    await scope.CommitAsync(ct);
                    
                    Interlocked.Increment(ref successCount);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error updating bin {BinId}", update.BinId);
                    errors.Add($"Bin {update.BinId}: {ex.Message}");
                }
            });

            var processingTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("Bulk bin update completed: {Success}/{Total} successful in {Time}ms", 
                successCount, updates.Count, processingTime.TotalMilliseconds);

            return new BulkOperationResultDto(
                updates.Count,
                successCount,
                errors.Count,
                errors.ToList(),
                processingTime
            );
        }
        finally
        {
            _bulkOperationSemaphore.Release();
        }
    }

    public async Task<BulkOperationResultDto> BulkExecutePutAwayAsync(List<BulkPutAwayDto> putAways, string userId, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var errors = new ConcurrentBag<string>();
        var successCount = 0;

        _logger.LogInformation("Starting bulk put away for {PutAwayCount} items", putAways.Count);

        try
        {
            await _bulkOperationSemaphore.WaitAsync(cancellationToken);

            // Use channels for high-throughput processing
            var channel = Channel.CreateBounded<BulkPutAwayDto>(new BoundedChannelOptions(1000)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = false,
                SingleWriter = false
            });

            // Producer task
            var producer = Task.Run(async () =>
            {
                try
                {
                    foreach (var putAway in putAways)
                    {
                        await channel.Writer.WriteAsync(putAway, cancellationToken);
                    }
                }
                finally
                {
                    channel.Writer.Complete();
                }
            }, cancellationToken);

            // Consumer tasks
            var consumers = Enumerable.Range(0, MaxConcurrentBatches)
                .Select(_ => ProcessPutAwayChannel(channel.Reader, userId, errors, cancellationToken))
                .ToArray();

            await Task.WhenAll(consumers.Concat(new[] { producer }));
            
            successCount = putAways.Count - errors.Count;

            var processingTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("Bulk put away completed: {Success}/{Total} successful in {Time}ms", 
                successCount, putAways.Count, processingTime.TotalMilliseconds);

            return new BulkOperationResultDto(
                putAways.Count,
                successCount,
                errors.Count,
                errors.ToList(),
                processingTime
            );
        }
        finally
        {
            _bulkOperationSemaphore.Release();
        }
    }

    public async Task<BulkOperationResultDto> BulkExecutePickAsync(List<BulkPickDto> picks, string userId, CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var errors = new ConcurrentBag<string>();
        var successCount = 0;

        _logger.LogInformation("Starting bulk pick for {PickCount} items", picks.Count);

        try
        {
            await _bulkOperationSemaphore.WaitAsync(cancellationToken);

            // Group picks by bin for optimal database access
            var picksByBin = picks.GroupBy(p => p.BinId).ToList();
            
            // Process picks in parallel while respecting bin locks
            var parallelOptions = new ParallelOptions
            {
                CancellationToken = cancellationToken,
                MaxDegreeOfParallelism = MaxConcurrentBatches
            };

            await Parallel.ForEachAsync(picksByBin, parallelOptions, async (binGroup, ct) =>
            {
                var binId = binGroup.Key;
                var binPicks = binGroup.ToList();

                try
                {
                    using var transaction = await _context.Database.BeginTransactionAsync(ct);
                    
                    var bin = await _context.Bins.FindAsync(new object[] { binId }, ct);
                    if (bin == null)
                    {
                        foreach (var pick in binPicks)
                            errors.Add($"Bin {binId} not found for SKU {pick.Sku}");
                        return;
                    }

                    var totalPickQuantity = 0;
                    var validPicks = new List<BulkPickDto>();

                    // Validate all picks for this bin
                    foreach (var pick in binPicks)
                    {
                        if (ValidatePickOperation(bin, pick))
                        {
                            validPicks.Add(pick);
                            totalPickQuantity += pick.Quantity;
                        }
                        else
                        {
                            errors.Add($"Invalid pick: {pick.Sku} quantity {pick.Quantity} from bin {bin.Code}");
                        }
                    }

                    if (validPicks.Any())
                    {
                        // Execute all valid picks for this bin
                        await ExecuteBinPicks(bin, validPicks, userId, ct);
                        await transaction.CommitAsync(ct);
                        
                        Interlocked.Add(ref successCount, validPicks.Count);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing picks for bin {BinId}", binId);
                    foreach (var pick in binPicks)
                        errors.Add($"Bin {binId} - {pick.Sku}: {ex.Message}");
                }
            });

            var processingTime = DateTime.UtcNow - startTime;
            _logger.LogInformation("Bulk pick completed: {Success}/{Total} successful in {Time}ms", 
                successCount, picks.Count, processingTime.TotalMilliseconds);

            return new BulkOperationResultDto(
                picks.Count,
                successCount,
                errors.Count,
                errors.ToList(),
                processingTime
            );
        }
        finally
        {
            _bulkOperationSemaphore.Release();
        }
    }

    // Private helper methods
    private async Task ProcessBinCreationBatch(List<CreateBinDto> batch, string userId, ConcurrentBag<string> errors, 
        CancellationToken cancellationToken, SemaphoreSlim concurrencyLimiter)
    {
        await concurrencyLimiter.WaitAsync(cancellationToken);
        try
        {
            using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
            
            var binEntities = new List<Bin>();
            
            foreach (var createBinDto in batch)
            {
                try
                {
                    var bin = new Bin
                    {
                        WarehouseId = createBinDto.WarehouseId,
                        ZoneId = createBinDto.ZoneId,
                        RackId = createBinDto.RackId,
                        Code = createBinDto.Code,
                        Level = createBinDto.Level,
                        Position = createBinDto.Position,
                        ShelfLevel = createBinDto.ShelfLevel,
                        Capacity = createBinDto.Capacity,
                        Status = "available",
                        CreatedBy = userId,
                        UpdatedBy = userId
                    };

                    binEntities.Add(bin);
                }
                catch (Exception ex)
                {
                    errors.Add($"Bin {createBinDto.Code}: {ex.Message}");
                }
            }

            if (binEntities.Any())
            {
                _context.Bins.AddRange(binEntities);
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing bin creation batch");
            foreach (var bin in batch)
                errors.Add($"Batch error for {bin.Code}: {ex.Message}");
        }
        finally
        {
            concurrencyLimiter.Release();
        }
    }

    private async Task ProcessPutAwayChannel(ChannelReader<BulkPutAwayDto> reader, string userId, 
        ConcurrentBag<string> errors, CancellationToken cancellationToken)
    {
        await foreach (var putAway in reader.ReadAllAsync(cancellationToken))
        {
            try
            {
                // Implementation for individual put away processing
                await ProcessSinglePutAway(putAway, userId, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing put away for SKU {Sku}", putAway.Sku);
                errors.Add($"SKU {putAway.Sku}: {ex.Message}");
            }
        }
    }

    private async Task ProcessSinglePutAway(BulkPutAwayDto putAway, string userId, CancellationToken cancellationToken)
    {
        // Implementation would include:
        // 1. Find optimal bin using allocation algorithm
        // 2. Create put away task
        // 3. Execute allocation
        // 4. Update bin quantities
        // 5. Create audit log
        await Task.Delay(1, cancellationToken); // Placeholder
    }

    private static void ApplyBinUpdates(Bin bin, UpdateBinDto updates, string userId)
    {
        if (updates.Code != null) bin.Code = updates.Code;
        if (updates.Level != null) bin.Level = updates.Level;
        if (updates.Position.HasValue) bin.Position = updates.Position.Value;
        if (updates.ShelfLevel.HasValue) bin.ShelfLevel = updates.ShelfLevel.Value;
        if (updates.Capacity.HasValue) bin.Capacity = updates.Capacity.Value;
        if (updates.CurrentQty.HasValue) bin.CurrentQty = updates.CurrentQty.Value;
        if (updates.Sku != null) bin.Sku = updates.Sku;
        if (updates.LotNumber != null) bin.LotNumber = updates.LotNumber;
        if (updates.ExpiryDate.HasValue) bin.ExpiryDate = updates.ExpiryDate;
        if (updates.Status != null) bin.Status = updates.Status;
        
        bin.UpdatedBy = userId;
        bin.UpdatedAt = DateTime.UtcNow;
    }

    private static bool ValidatePickOperation(Bin bin, BulkPickDto pick)
    {
        // Implementation would include validation logic
        return bin.CurrentQty >= pick.Quantity && bin.Status == "occupied";
    }

    private async Task ExecuteBinPicks(Bin bin, List<BulkPickDto> picks, string userId, CancellationToken cancellationToken)
    {
        // Implementation would include:
        // 1. Update bin quantities
        // 2. Handle mixed contents if applicable
        // 3. Create stock movements
        // 4. Update bin status if emptied
        await Task.Delay(1, cancellationToken); // Placeholder
    }
}

// Supporting DTOs for bulk operations
public record BulkPickDto(Guid BinId, string Sku, int Quantity, string? LotNumber = null, DateTime? ExpiryDate = null);

public interface IExcelImportService
{
    Task<ExcelImportResultDto> ImportBinsAsync(Stream excelStream, Guid warehouseId, string userId, CancellationToken cancellationToken = default);
    Task<ExcelImportResultDto> ImportPutAwayTasksAsync(Stream excelStream, Guid warehouseId, string userId, CancellationToken cancellationToken = default);
    Task<ExcelImportResultDto> ImportPickTasksAsync(Stream excelStream, Guid warehouseId, string userId, CancellationToken cancellationToken = default);
}

public interface IReportService
{
    Task<Stream> GenerateInventoryReportAsync(Guid warehouseId, ReportParameters parameters, CancellationToken cancellationToken = default);
    Task<Stream> GenerateUtilizationReportAsync(Guid warehouseId, ReportParameters parameters, CancellationToken cancellationToken = default);
    Task<Stream> GeneratePerformanceReportAsync(Guid warehouseId, ReportParameters parameters, CancellationToken cancellationToken = default);
}

public interface IAuditService
{
    Task LogActivityAsync(string action, string entityType, string? entityId, object? oldValues, object? newValues, string userId, CancellationToken cancellationToken = default);
    Task<List<AuditLog>> GetAuditTrailAsync(string? entityType, string? entityId, DateTime? fromDate, DateTime? toDate, CancellationToken cancellationToken = default);
}

public interface IBarcodeService
{
    byte[] GenerateBarcode(string data, BarcodeFormat format = BarcodeFormat.Code128);
    byte[] GenerateQRCode(string data, int size = 200);
    string? ScanBarcode(byte[] imageData);
}

public interface IPrintService
{
    Task PrintBinLabelAsync(BinDto bin, CancellationToken cancellationToken = default);
    Task PrintPickListAsync(PickTaskDto pickTask, CancellationToken cancellationToken = default);
    Task PrintReportAsync(Stream reportStream, string reportName, CancellationToken cancellationToken = default);
}

public enum BarcodeFormat
{
    Code128,
    Code39,
    EAN13,
    QRCode
}

public record ReportParameters(
    DateTime FromDate,
    DateTime ToDate,
    List<string>? ZoneIds = null,
    List<string>? ProductCategories = null,
    string Format = "Excel" // Excel, PDF, CSV
);
