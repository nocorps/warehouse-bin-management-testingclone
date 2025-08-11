using OfficeOpenXml;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Models.Entities;
using WarehouseManagement.Desktop.Models.DTOs;
using System.ComponentModel;
using System.Globalization;

namespace WarehouseManagement.Desktop.Services
{
    public interface IExcelService
    {
        Task<ExcelImportResult> ImportProductsAsync(string filePath, IProgress<ImportProgress>? progress = null);
        Task<ExcelImportResult> ImportBinsAsync(string filePath, IProgress<ImportProgress>? progress = null);
        Task<ExcelImportResult> ImportRacksAsync(string filePath, IProgress<ImportProgress>? progress = null);
        Task<bool> ExportBinsAsync(string filePath, int? warehouseId = null);
        Task<bool> ExportProductsAsync(string filePath);
        Task<bool> ExportInventoryReportAsync(string filePath, int? warehouseId = null);
        Task<bool> ExportMovementHistoryAsync(string filePath, DateTime? startDate = null, DateTime? endDate = null);
        Task<byte[]> GenerateTemplateAsync(ExcelTemplateType templateType);
    }

    public class ExcelService : IExcelService
    {
        private readonly WarehouseDbContext _context;
        private readonly ILogger<ExcelService> _logger;
        private readonly IBulkOperationsService _bulkOperationsService;

        public ExcelService(
            WarehouseDbContext context,
            ILogger<ExcelService> logger,
            IBulkOperationsService bulkOperationsService)
        {
            _context = context;
            _logger = logger;
            _bulkOperationsService = bulkOperationsService;

            // Set the license context for EPPlus
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        }

        public async Task<ExcelImportResult> ImportProductsAsync(string filePath, IProgress<ImportProgress>? progress = null)
        {
            var result = new ExcelImportResult();

            try
            {
                using var package = new ExcelPackage(new FileInfo(filePath));
                var worksheet = package.Workbook.Worksheets.FirstOrDefault();

                if (worksheet == null)
                {
                    result.Success = false;
                    result.Message = "No worksheet found in the Excel file";
                    return result;
                }

                var products = new List<Product>();
                var rowCount = worksheet.Dimension?.Rows ?? 0;

                // Expected columns: SKU, Name, Description, Category, Weight, Volume, IsHazardous
                for (int row = 2; row <= rowCount; row++) // Skip header row
                {
                    try
                    {
                        var sku = worksheet.Cells[row, 1].Text?.Trim();
                        var name = worksheet.Cells[row, 2].Text?.Trim();
                        var description = worksheet.Cells[row, 3].Text?.Trim();
                        var category = worksheet.Cells[row, 4].Text?.Trim();
                        var weightText = worksheet.Cells[row, 5].Text?.Trim();
                        var volumeText = worksheet.Cells[row, 6].Text?.Trim();
                        var isHazardousText = worksheet.Cells[row, 7].Text?.Trim();

                        if (string.IsNullOrEmpty(sku) || string.IsNullOrEmpty(name))
                        {
                            result.SkippedRows++;
                            continue;
                        }

                        var product = new Product
                        {
                            SKU = sku,
                            Name = name,
                            Description = description ?? "",
                            Category = category ?? "",
                            Weight = decimal.TryParse(weightText, out var weight) ? weight : 0,
                            Volume = decimal.TryParse(volumeText, out var volume) ? volume : 0,
                            IsHazardous = bool.TryParse(isHazardousText, out var hazardous) && hazardous,
                            CreatedDate = DateTime.UtcNow
                        };

                        products.Add(product);
                        result.ProcessedRows++;

                        progress?.Report(new ImportProgress 
                        { 
                            CurrentRow = row, 
                            TotalRows = rowCount, 
                            Message = $"Processing product: {sku}" 
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error processing row {Row} in products import", row);
                        result.ErrorRows++;
                    }
                }

                // Bulk insert products
                await _bulkOperationsService.BulkCreateProductsAsync(products);

                result.Success = true;
                result.Message = $"Successfully imported {products.Count} products";

                _logger.LogInformation("Products import completed: {Count} products imported", products.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing products from {FilePath}", filePath);
                result.Success = false;
                result.Message = $"Import failed: {ex.Message}";
            }

            return result;
        }

        public async Task<ExcelImportResult> ImportBinsAsync(string filePath, IProgress<ImportProgress>? progress = null)
        {
            var result = new ExcelImportResult();

            try
            {
                using var package = new ExcelPackage(new FileInfo(filePath));
                var worksheet = package.Workbook.Worksheets.FirstOrDefault();

                if (worksheet == null)
                {
                    result.Success = false;
                    result.Message = "No worksheet found in the Excel file";
                    return result;
                }

                var bins = new List<Bin>();
                var rowCount = worksheet.Dimension?.Rows ?? 0;

                // Get warehouses and racks for reference
                var warehouses = await _context.Warehouses.ToDictionaryAsync(w => w.Name, w => w.Id);
                var racks = await _context.Racks.ToDictionaryAsync(r => r.Code, r => r.Id);

                // Expected columns: WarehouseName, RackCode, Position, MaxWeight, MaxVolume, BinType
                for (int row = 2; row <= rowCount; row++)
                {
                    try
                    {
                        var warehouseName = worksheet.Cells[row, 1].Text?.Trim();
                        var rackCode = worksheet.Cells[row, 2].Text?.Trim();
                        var position = worksheet.Cells[row, 3].Text?.Trim();
                        var maxWeightText = worksheet.Cells[row, 4].Text?.Trim();
                        var maxVolumeText = worksheet.Cells[row, 5].Text?.Trim();
                        var binTypeText = worksheet.Cells[row, 6].Text?.Trim();

                        if (string.IsNullOrEmpty(warehouseName) || string.IsNullOrEmpty(rackCode) || string.IsNullOrEmpty(position))
                        {
                            result.SkippedRows++;
                            continue;
                        }

                        if (!warehouses.TryGetValue(warehouseName, out var warehouseId) ||
                            !racks.TryGetValue(rackCode, out var rackId))
                        {
                            result.ErrorRows++;
                            continue;
                        }

                        var bin = new Bin
                        {
                            RackId = rackId,
                            Position = position,
                            MaxWeight = decimal.TryParse(maxWeightText, out var maxWeight) ? maxWeight : 1000,
                            MaxVolume = decimal.TryParse(maxVolumeText, out var maxVolume) ? maxVolume : 1000,
                            BinType = Enum.TryParse<BinType>(binTypeText, out var binType) ? binType : BinType.Standard,
                            Status = BinStatus.Available,
                            CreatedDate = DateTime.UtcNow
                        };

                        bins.Add(bin);
                        result.ProcessedRows++;

                        progress?.Report(new ImportProgress 
                        { 
                            CurrentRow = row, 
                            TotalRows = rowCount, 
                            Message = $"Processing bin: {rackCode}-{position}" 
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error processing row {Row} in bins import", row);
                        result.ErrorRows++;
                    }
                }

                // Bulk insert bins
                await _bulkOperationsService.BulkCreateBinsAsync(bins);

                result.Success = true;
                result.Message = $"Successfully imported {bins.Count} bins";

                _logger.LogInformation("Bins import completed: {Count} bins imported", bins.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing bins from {FilePath}", filePath);
                result.Success = false;
                result.Message = $"Import failed: {ex.Message}";
            }

            return result;
        }

        public async Task<ExcelImportResult> ImportRacksAsync(string filePath, IProgress<ImportProgress>? progress = null)
        {
            var result = new ExcelImportResult();

            try
            {
                using var package = new ExcelPackage(new FileInfo(filePath));
                var worksheet = package.Workbook.Worksheets.FirstOrDefault();

                if (worksheet == null)
                {
                    result.Success = false;
                    result.Message = "No worksheet found in the Excel file";
                    return result;
                }

                var racks = new List<Rack>();
                var rowCount = worksheet.Dimension?.Rows ?? 0;

                // Get warehouses and zones for reference
                var warehouses = await _context.Warehouses.ToDictionaryAsync(w => w.Name, w => w.Id);
                var zones = await _context.Zones.ToDictionaryAsync(z => z.Name, z => z.Id);

                // Expected columns: WarehouseName, ZoneName, Code, Name, Aisle, Level, Position
                for (int row = 2; row <= rowCount; row++)
                {
                    try
                    {
                        var warehouseName = worksheet.Cells[row, 1].Text?.Trim();
                        var zoneName = worksheet.Cells[row, 2].Text?.Trim();
                        var code = worksheet.Cells[row, 3].Text?.Trim();
                        var name = worksheet.Cells[row, 4].Text?.Trim();
                        var aisle = worksheet.Cells[row, 5].Text?.Trim();
                        var levelText = worksheet.Cells[row, 6].Text?.Trim();
                        var positionText = worksheet.Cells[row, 7].Text?.Trim();

                        if (string.IsNullOrEmpty(warehouseName) || string.IsNullOrEmpty(code))
                        {
                            result.SkippedRows++;
                            continue;
                        }

                        if (!warehouses.TryGetValue(warehouseName, out var warehouseId))
                        {
                            result.ErrorRows++;
                            continue;
                        }

                        int? zoneId = null;
                        if (!string.IsNullOrEmpty(zoneName) && zones.TryGetValue(zoneName, out var zId))
                        {
                            zoneId = zId;
                        }

                        var rack = new Rack
                        {
                            WarehouseId = warehouseId,
                            ZoneId = zoneId,
                            Code = code,
                            Name = name ?? code,
                            Aisle = aisle ?? "",
                            Level = int.TryParse(levelText, out var level) ? level : 1,
                            Position = int.TryParse(positionText, out var position) ? position : 1,
                            IsActive = true,
                            CreatedDate = DateTime.UtcNow
                        };

                        racks.Add(rack);
                        result.ProcessedRows++;

                        progress?.Report(new ImportProgress 
                        { 
                            CurrentRow = row, 
                            TotalRows = rowCount, 
                            Message = $"Processing rack: {code}" 
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error processing row {Row} in racks import", row);
                        result.ErrorRows++;
                    }
                }

                // Bulk insert racks
                await _bulkOperationsService.BulkCreateRacksAsync(racks);

                result.Success = true;
                result.Message = $"Successfully imported {racks.Count} racks";

                _logger.LogInformation("Racks import completed: {Count} racks imported", racks.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing racks from {FilePath}", filePath);
                result.Success = false;
                result.Message = $"Import failed: {ex.Message}";
            }

            return result;
        }

        public async Task<bool> ExportBinsAsync(string filePath, int? warehouseId = null)
        {
            try
            {
                var query = _context.Bins
                    .Include(b => b.Rack)
                        .ThenInclude(r => r.Warehouse)
                    .Include(b => b.Rack)
                        .ThenInclude(r => r.Zone)
                    .Include(b => b.BinContents)
                        .ThenInclude(bc => bc.Product)
                    .AsQueryable();

                if (warehouseId.HasValue)
                {
                    query = query.Where(b => b.Rack.WarehouseId == warehouseId.Value);
                }

                var bins = await query.ToListAsync();

                using var package = new ExcelPackage();
                var worksheet = package.Workbook.Worksheets.Add("Bins");

                // Headers
                var headers = new[] 
                {
                    "Warehouse", "Zone", "Rack Code", "Position", "Bin Type", "Status", 
                    "Max Weight", "Max Volume", "Current Weight", "Current Volume",
                    "Product Count", "Products", "Created Date"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cells[1, i + 1].Value = headers[i];
                    worksheet.Cells[1, i + 1].Style.Font.Bold = true;
                }

                // Data
                for (int i = 0; i < bins.Count; i++)
                {
                    var bin = bins[i];
                    var row = i + 2;

                    worksheet.Cells[row, 1].Value = bin.Rack.Warehouse.Name;
                    worksheet.Cells[row, 2].Value = bin.Rack.Zone?.Name ?? "";
                    worksheet.Cells[row, 3].Value = bin.Rack.Code;
                    worksheet.Cells[row, 4].Value = bin.Position;
                    worksheet.Cells[row, 5].Value = bin.BinType.ToString();
                    worksheet.Cells[row, 6].Value = bin.Status.ToString();
                    worksheet.Cells[row, 7].Value = bin.MaxWeight;
                    worksheet.Cells[row, 8].Value = bin.MaxVolume;
                    worksheet.Cells[row, 9].Value = bin.CurrentWeight;
                    worksheet.Cells[row, 10].Value = bin.CurrentVolume;
                    worksheet.Cells[row, 11].Value = bin.BinContents.Count;
                    worksheet.Cells[row, 12].Value = string.Join(", ", bin.BinContents.Select(bc => bc.Product.SKU));
                    worksheet.Cells[row, 13].Value = bin.CreatedDate.ToString("yyyy-MM-dd HH:mm:ss");
                }

                worksheet.Cells.AutoFitColumns();

                await package.SaveAsAsync(new FileInfo(filePath));

                _logger.LogInformation("Bins exported to {FilePath}: {Count} bins", filePath, bins.Count);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting bins to {FilePath}", filePath);
                return false;
            }
        }

        public async Task<bool> ExportProductsAsync(string filePath)
        {
            try
            {
                var products = await _context.Products.ToListAsync();

                using var package = new ExcelPackage();
                var worksheet = package.Workbook.Worksheets.Add("Products");

                // Headers
                var headers = new[] 
                {
                    "SKU", "Name", "Description", "Category", "Weight", "Volume", 
                    "Is Hazardous", "Created Date", "Modified Date"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cells[1, i + 1].Value = headers[i];
                    worksheet.Cells[1, i + 1].Style.Font.Bold = true;
                }

                // Data
                for (int i = 0; i < products.Count; i++)
                {
                    var product = products[i];
                    var row = i + 2;

                    worksheet.Cells[row, 1].Value = product.SKU;
                    worksheet.Cells[row, 2].Value = product.Name;
                    worksheet.Cells[row, 3].Value = product.Description;
                    worksheet.Cells[row, 4].Value = product.Category;
                    worksheet.Cells[row, 5].Value = product.Weight;
                    worksheet.Cells[row, 6].Value = product.Volume;
                    worksheet.Cells[row, 7].Value = product.IsHazardous;
                    worksheet.Cells[row, 8].Value = product.CreatedDate.ToString("yyyy-MM-dd HH:mm:ss");
                    worksheet.Cells[row, 9].Value = product.ModifiedDate?.ToString("yyyy-MM-dd HH:mm:ss") ?? "";
                }

                worksheet.Cells.AutoFitColumns();

                await package.SaveAsAsync(new FileInfo(filePath));

                _logger.LogInformation("Products exported to {FilePath}: {Count} products", filePath, products.Count);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting products to {FilePath}", filePath);
                return false;
            }
        }

        public async Task<bool> ExportInventoryReportAsync(string filePath, int? warehouseId = null)
        {
            try
            {
                var query = _context.BinContents
                    .Include(bc => bc.Product)
                    .Include(bc => bc.Bin)
                        .ThenInclude(b => b.Rack)
                            .ThenInclude(r => r.Warehouse)
                    .AsQueryable();

                if (warehouseId.HasValue)
                {
                    query = query.Where(bc => bc.Bin.Rack.WarehouseId == warehouseId.Value);
                }

                var inventory = await query.ToListAsync();

                using var package = new ExcelPackage();
                var worksheet = package.Workbook.Worksheets.Add("Inventory");

                // Headers
                var headers = new[] 
                {
                    "Warehouse", "Rack Code", "Bin Position", "Product SKU", "Product Name", 
                    "Quantity", "Unit Cost", "Total Cost", "Expiry Date", "Last Updated"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cells[1, i + 1].Value = headers[i];
                    worksheet.Cells[1, i + 1].Style.Font.Bold = true;
                }

                // Data
                for (int i = 0; i < inventory.Count; i++)
                {
                    var item = inventory[i];
                    var row = i + 2;

                    worksheet.Cells[row, 1].Value = item.Bin.Rack.Warehouse.Name;
                    worksheet.Cells[row, 2].Value = item.Bin.Rack.Code;
                    worksheet.Cells[row, 3].Value = item.Bin.Position;
                    worksheet.Cells[row, 4].Value = item.Product.SKU;
                    worksheet.Cells[row, 5].Value = item.Product.Name;
                    worksheet.Cells[row, 6].Value = item.Quantity;
                    worksheet.Cells[row, 7].Value = item.UnitCost;
                    worksheet.Cells[row, 8].Value = item.Quantity * item.UnitCost;
                    worksheet.Cells[row, 9].Value = item.ExpiryDate?.ToString("yyyy-MM-dd") ?? "";
                    worksheet.Cells[row, 10].Value = item.ModifiedDate?.ToString("yyyy-MM-dd HH:mm:ss") ?? item.CreatedDate.ToString("yyyy-MM-dd HH:mm:ss");
                }

                worksheet.Cells.AutoFitColumns();

                await package.SaveAsAsync(new FileInfo(filePath));

                _logger.LogInformation("Inventory report exported to {FilePath}: {Count} items", filePath, inventory.Count);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting inventory report to {FilePath}", filePath);
                return false;
            }
        }

        public async Task<bool> ExportMovementHistoryAsync(string filePath, DateTime? startDate = null, DateTime? endDate = null)
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
                    .AsQueryable();

                if (startDate.HasValue)
                    query = query.Where(sm => sm.MovementDate >= startDate.Value);

                if (endDate.HasValue)
                    query = query.Where(sm => sm.MovementDate <= endDate.Value);

                var movements = await query.OrderByDescending(sm => sm.MovementDate).ToListAsync();

                using var package = new ExcelPackage();
                var worksheet = package.Workbook.Worksheets.Add("Stock Movements");

                // Headers
                var headers = new[] 
                {
                    "Date", "Type", "Product SKU", "Product Name", "Quantity", 
                    "From Location", "To Location", "Reason", "User", "Reference"
                };

                for (int i = 0; i < headers.Length; i++)
                {
                    worksheet.Cells[1, i + 1].Value = headers[i];
                    worksheet.Cells[1, i + 1].Style.Font.Bold = true;
                }

                // Data
                for (int i = 0; i < movements.Count; i++)
                {
                    var movement = movements[i];
                    var row = i + 2;

                    worksheet.Cells[row, 1].Value = movement.MovementDate.ToString("yyyy-MM-dd HH:mm:ss");
                    worksheet.Cells[row, 2].Value = movement.MovementType.ToString();
                    worksheet.Cells[row, 3].Value = movement.Product.SKU;
                    worksheet.Cells[row, 4].Value = movement.Product.Name;
                    worksheet.Cells[row, 5].Value = movement.Quantity;
                    worksheet.Cells[row, 6].Value = movement.FromBin != null ? $"{movement.FromBin.Rack.Code}-{movement.FromBin.Position}" : "";
                    worksheet.Cells[row, 7].Value = movement.ToBin != null ? $"{movement.ToBin.Rack.Code}-{movement.ToBin.Position}" : "";
                    worksheet.Cells[row, 8].Value = movement.Reason;
                    worksheet.Cells[row, 9].Value = movement.User?.Username ?? "";
                    worksheet.Cells[row, 10].Value = movement.Reference;
                }

                worksheet.Cells.AutoFitColumns();

                await package.SaveAsAsync(new FileInfo(filePath));

                _logger.LogInformation("Movement history exported to {FilePath}: {Count} movements", filePath, movements.Count);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting movement history to {FilePath}", filePath);
                return false;
            }
        }

        public async Task<byte[]> GenerateTemplateAsync(ExcelTemplateType templateType)
        {
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Template");

            string[] headers;
            string[] sampleData;

            switch (templateType)
            {
                case ExcelTemplateType.Products:
                    headers = new[] { "SKU", "Name", "Description", "Category", "Weight", "Volume", "IsHazardous" };
                    sampleData = new[] { "PROD001", "Sample Product", "Product description", "Electronics", "10.5", "15.2", "false" };
                    break;

                case ExcelTemplateType.Bins:
                    headers = new[] { "WarehouseName", "RackCode", "Position", "MaxWeight", "MaxVolume", "BinType" };
                    sampleData = new[] { "Main Warehouse", "A01", "01", "1000", "1000", "Standard" };
                    break;

                case ExcelTemplateType.Racks:
                    headers = new[] { "WarehouseName", "ZoneName", "Code", "Name", "Aisle", "Level", "Position" };
                    sampleData = new[] { "Main Warehouse", "Zone A", "A01", "Rack A01", "A", "1", "1" };
                    break;

                default:
                    throw new ArgumentException($"Unknown template type: {templateType}");
            }

            // Add headers
            for (int i = 0; i < headers.Length; i++)
            {
                worksheet.Cells[1, i + 1].Value = headers[i];
                worksheet.Cells[1, i + 1].Style.Font.Bold = true;
            }

            // Add sample data
            for (int i = 0; i < sampleData.Length; i++)
            {
                worksheet.Cells[2, i + 1].Value = sampleData[i];
                worksheet.Cells[2, i + 1].Style.Font.Italic = true;
            }

            worksheet.Cells.AutoFitColumns();

            return package.GetAsByteArray();
        }
    }

    public class ExcelImportResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int ProcessedRows { get; set; }
        public int SkippedRows { get; set; }
        public int ErrorRows { get; set; }
    }

    public class ImportProgress
    {
        public int CurrentRow { get; set; }
        public int TotalRows { get; set; }
        public string Message { get; set; } = string.Empty;
        public double PercentComplete => TotalRows > 0 ? (double)CurrentRow / TotalRows * 100 : 0;
    }

    public enum ExcelTemplateType
    {
        Products,
        Bins,
        Racks
    }
}
