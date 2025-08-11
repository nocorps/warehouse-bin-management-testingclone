using Microsoft.Extensions.Logging;
using System.Drawing;
using System.Drawing.Printing;
using System.Text;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Models.Entities;

namespace WarehouseManagement.Desktop.Services
{
    public interface IPrintService
    {
        Task<bool> PrintBinLabelAsync(BinLabelInfo labelInfo);
        Task<bool> PrintProductLabelAsync(ProductLabelInfo labelInfo);
        Task<bool> PrintTaskLabelAsync(TaskLabelInfo labelInfo);
        Task<bool> PrintInventoryReportAsync(InventoryReport report);
        Task<bool> PrintMovementReportAsync(MovementReport report);
        Task<bool> PrintPickListAsync(List<PickTaskDto> pickTasks);
        Task<bool> PrintPutAwayListAsync(List<PutAwayTaskDto> putAwayTasks);
        List<string> GetAvailablePrinters();
        Task<byte[]> GenerateBinLabelPdfAsync(BinLabelInfo labelInfo);
        Task<byte[]> GenerateProductLabelPdfAsync(ProductLabelInfo labelInfo);
        Task<byte[]> GenerateReportPdfAsync(object report, ReportType reportType);
    }

    public class PrintService : IPrintService
    {
        private readonly ILogger<PrintService> _logger;
        private readonly IBarcodeService _barcodeService;
        private PrintDocument _printDocument;

        public PrintService(ILogger<PrintService> logger, IBarcodeService barcodeService)
        {
            _logger = logger;
            _barcodeService = barcodeService;
            _printDocument = new PrintDocument();
        }

        public async Task<bool> PrintBinLabelAsync(BinLabelInfo labelInfo)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawBinLabel(e.Graphics!, labelInfo);
                        taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing bin label");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Bin Label - {labelInfo.RackCode}-{labelInfo.Position}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Bin label printed for {RackCode}-{Position}: {Success}", 
                    labelInfo.RackCode, labelInfo.Position, result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing bin label for {RackCode}-{Position}", 
                    labelInfo.RackCode, labelInfo.Position);
                return false;
            }
        }

        public async Task<bool> PrintProductLabelAsync(ProductLabelInfo labelInfo)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawProductLabel(e.Graphics!, labelInfo);
                        taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing product label");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Product Label - {labelInfo.SKU}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Product label printed for {SKU}: {Success}", labelInfo.SKU, result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing product label for {SKU}", labelInfo.SKU);
                return false;
            }
        }

        public async Task<bool> PrintTaskLabelAsync(TaskLabelInfo labelInfo)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawTaskLabel(e.Graphics!, labelInfo);
                        taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing task label");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Task Label - {labelInfo.TaskId}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Task label printed for task {TaskId}: {Success}", labelInfo.TaskId, result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing task label for task {TaskId}", labelInfo.TaskId);
                return false;
            }
        }

        public async Task<bool> PrintInventoryReportAsync(InventoryReport report)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                int currentPage = 0;
                int itemsPerPage = 40;
                int totalPages = (int)Math.Ceiling((double)report.Items.Count / itemsPerPage);
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawInventoryReport(e.Graphics!, report, currentPage, itemsPerPage);
                        currentPage++;
                        e.HasMorePages = currentPage < totalPages;
                        
                        if (!e.HasMorePages)
                            taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing inventory report");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Inventory Report - {report.GeneratedDate:yyyy-MM-dd}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Inventory report printed: {Success}", result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing inventory report");
                return false;
            }
        }

        public async Task<bool> PrintMovementReportAsync(MovementReport report)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                int currentPage = 0;
                int itemsPerPage = 35;
                int totalPages = (int)Math.Ceiling((double)report.Movements.Count / itemsPerPage);
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawMovementReport(e.Graphics!, report, currentPage, itemsPerPage);
                        currentPage++;
                        e.HasMorePages = currentPage < totalPages;
                        
                        if (!e.HasMorePages)
                            taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing movement report");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Movement Report - {report.StartDate:yyyy-MM-dd} to {report.EndDate:yyyy-MM-dd}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Movement report printed: {Success}", result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing movement report");
                return false;
            }
        }

        public async Task<bool> PrintPickListAsync(List<PickTaskDto> pickTasks)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                int currentPage = 0;
                int itemsPerPage = 30;
                int totalPages = (int)Math.Ceiling((double)pickTasks.Count / itemsPerPage);
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawPickList(e.Graphics!, pickTasks, currentPage, itemsPerPage);
                        currentPage++;
                        e.HasMorePages = currentPage < totalPages;
                        
                        if (!e.HasMorePages)
                            taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing pick list");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Pick List - {DateTime.Now:yyyy-MM-dd HH:mm}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Pick list printed with {TaskCount} tasks: {Success}", pickTasks.Count, result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing pick list");
                return false;
            }
        }

        public async Task<bool> PrintPutAwayListAsync(List<PutAwayTaskDto> putAwayTasks)
        {
            try
            {
                var taskCompletionSource = new TaskCompletionSource<bool>();
                int currentPage = 0;
                int itemsPerPage = 30;
                int totalPages = (int)Math.Ceiling((double)putAwayTasks.Count / itemsPerPage);
                
                _printDocument.PrintPage += (sender, e) =>
                {
                    try
                    {
                        DrawPutAwayList(e.Graphics!, putAwayTasks, currentPage, itemsPerPage);
                        currentPage++;
                        e.HasMorePages = currentPage < totalPages;
                        
                        if (!e.HasMorePages)
                            taskCompletionSource.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error drawing put away list");
                        taskCompletionSource.SetResult(false);
                    }
                };

                _printDocument.DocumentName = $"Put Away List - {DateTime.Now:yyyy-MM-dd HH:mm}";
                _printDocument.Print();

                var result = await taskCompletionSource.Task;
                _logger.LogInformation("Put away list printed with {TaskCount} tasks: {Success}", putAwayTasks.Count, result);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing put away list");
                return false;
            }
        }

        public List<string> GetAvailablePrinters()
        {
            try
            {
                var printers = new List<string>();
                foreach (string printer in PrinterSettings.InstalledPrinters)
                {
                    printers.Add(printer);
                }
                return printers;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting available printers");
                return new List<string>();
            }
        }

        public async Task<byte[]> GenerateBinLabelPdfAsync(BinLabelInfo labelInfo)
        {
            // Note: This would require a PDF library like iTextSharp or PdfSharp
            // For now, returning empty array as placeholder
            await Task.Delay(1);
            _logger.LogInformation("PDF generation for bin label would be implemented here");
            return Array.Empty<byte>();
        }

        public async Task<byte[]> GenerateProductLabelPdfAsync(ProductLabelInfo labelInfo)
        {
            // Note: This would require a PDF library like iTextSharp or PdfSharp
            // For now, returning empty array as placeholder
            await Task.Delay(1);
            _logger.LogInformation("PDF generation for product label would be implemented here");
            return Array.Empty<byte>();
        }

        public async Task<byte[]> GenerateReportPdfAsync(object report, ReportType reportType)
        {
            // Note: This would require a PDF library like iTextSharp or PdfSharp
            // For now, returning empty array as placeholder
            await Task.Delay(1);
            _logger.LogInformation("PDF generation for {ReportType} report would be implemented here", reportType);
            return Array.Empty<byte>();
        }

        private void DrawBinLabel(Graphics graphics, BinLabelInfo labelInfo)
        {
            var font = new Font("Arial", 12, FontStyle.Bold);
            var smallFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            // Generate barcode
            var barcodeData = _barcodeService.GenerateBinBarcode(labelInfo.RackCode, labelInfo.Position);
            var barcodeImage = _barcodeService.GenerateBarcode(barcodeData, ZXing.BarcodeFormat.CODE_128, 200, 50);

            // Draw bin information
            graphics.DrawString($"Bin: {labelInfo.RackCode}-{labelInfo.Position}", font, brush, 10, 10);
            graphics.DrawString($"Warehouse: {labelInfo.WarehouseName}", smallFont, brush, 10, 35);
            graphics.DrawString($"Zone: {labelInfo.ZoneName}", smallFont, brush, 10, 50);
            graphics.DrawString($"Max Weight: {labelInfo.MaxWeight} kg", smallFont, brush, 10, 65);
            graphics.DrawString($"Max Volume: {labelInfo.MaxVolume} m³", smallFont, brush, 10, 80);

            // Draw barcode
            using var ms = new MemoryStream(barcodeImage);
            using var barcodeBitmap = new Bitmap(ms);
            graphics.DrawImage(barcodeBitmap, 10, 100);

            // Draw barcode text
            graphics.DrawString(barcodeData, smallFont, brush, 10, 160);
        }

        private void DrawProductLabel(Graphics graphics, ProductLabelInfo labelInfo)
        {
            var font = new Font("Arial", 12, FontStyle.Bold);
            var smallFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            // Generate barcode
            var barcodeData = _barcodeService.GenerateProductBarcode(labelInfo.SKU);
            var barcodeImage = _barcodeService.GenerateBarcode(barcodeData, ZXing.BarcodeFormat.CODE_128, 200, 50);

            // Draw product information
            graphics.DrawString($"SKU: {labelInfo.SKU}", font, brush, 10, 10);
            graphics.DrawString($"Product: {labelInfo.Name}", smallFont, brush, 10, 35);
            graphics.DrawString($"Category: {labelInfo.Category}", smallFont, brush, 10, 50);
            graphics.DrawString($"Weight: {labelInfo.Weight} kg", smallFont, brush, 10, 65);
            graphics.DrawString($"Volume: {labelInfo.Volume} m³", smallFont, brush, 10, 80);

            if (labelInfo.IsHazardous)
            {
                graphics.DrawString("⚠ HAZARDOUS", new Font("Arial", 10, FontStyle.Bold), Brushes.Red, 150, 10);
            }

            // Draw barcode
            using var ms = new MemoryStream(barcodeImage);
            using var barcodeBitmap = new Bitmap(ms);
            graphics.DrawImage(barcodeBitmap, 10, 100);

            // Draw barcode text
            graphics.DrawString(barcodeData, smallFont, brush, 10, 160);
        }

        private void DrawTaskLabel(Graphics graphics, TaskLabelInfo labelInfo)
        {
            var font = new Font("Arial", 12, FontStyle.Bold);
            var smallFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            // Generate barcode
            var barcodeData = _barcodeService.GenerateTaskBarcode(labelInfo.TaskId);
            var barcodeImage = _barcodeService.GenerateBarcode(barcodeData, ZXing.BarcodeFormat.CODE_128, 200, 50);

            // Draw task information
            graphics.DrawString($"Task ID: {labelInfo.TaskId}", font, brush, 10, 10);
            graphics.DrawString($"Type: {labelInfo.TaskType}", smallFont, brush, 10, 35);
            graphics.DrawString($"Priority: {labelInfo.Priority}", smallFont, brush, 10, 50);
            graphics.DrawString($"Location: {labelInfo.Location}", smallFont, brush, 10, 65);
            graphics.DrawString($"Created: {labelInfo.CreatedDate:yyyy-MM-dd HH:mm}", smallFont, brush, 10, 80);

            // Draw barcode
            using var ms = new MemoryStream(barcodeImage);
            using var barcodeBitmap = new Bitmap(ms);
            graphics.DrawImage(barcodeBitmap, 10, 100);

            // Draw barcode text
            graphics.DrawString(barcodeData, smallFont, brush, 10, 160);
        }

        private void DrawInventoryReport(Graphics graphics, InventoryReport report, int pageNumber, int itemsPerPage)
        {
            var titleFont = new Font("Arial", 16, FontStyle.Bold);
            var headerFont = new Font("Arial", 10, FontStyle.Bold);
            var dataFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            int y = 20;

            // Title
            graphics.DrawString("Inventory Report", titleFont, brush, 20, y);
            y += 30;

            // Report info
            graphics.DrawString($"Generated: {report.GeneratedDate:yyyy-MM-dd HH:mm}", dataFont, brush, 20, y);
            graphics.DrawString($"Page: {pageNumber + 1}", dataFont, brush, 400, y);
            y += 20;

            // Summary (only on first page)
            if (pageNumber == 0)
            {
                graphics.DrawString($"Total Items: {report.TotalItems:N0}", dataFont, brush, 20, y);
                graphics.DrawString($"Total Value: ${report.TotalValue:N2}", dataFont, brush, 150, y);
                graphics.DrawString($"Total Products: {report.TotalProducts:N0}", dataFont, brush, 300, y);
                y += 30;
            }

            // Headers
            graphics.DrawString("SKU", headerFont, brush, 20, y);
            graphics.DrawString("Product", headerFont, brush, 100, y);
            graphics.DrawString("Location", headerFont, brush, 250, y);
            graphics.DrawString("Qty", headerFont, brush, 350, y);
            graphics.DrawString("Value", headerFont, brush, 400, y);
            y += 20;

            // Data
            var startIndex = pageNumber * itemsPerPage;
            var endIndex = Math.Min(startIndex + itemsPerPage, report.Items.Count);

            for (int i = startIndex; i < endIndex; i++)
            {
                var item = report.Items[i];
                graphics.DrawString(item.ProductSKU, dataFont, brush, 20, y);
                graphics.DrawString(TruncateString(item.ProductName, 20), dataFont, brush, 100, y);
                graphics.DrawString($"{item.RackCode}-{item.BinPosition}", dataFont, brush, 250, y);
                graphics.DrawString($"{item.Quantity:N0}", dataFont, brush, 350, y);
                graphics.DrawString($"${item.TotalValue:N2}", dataFont, brush, 400, y);
                y += 15;
            }
        }

        private void DrawMovementReport(Graphics graphics, MovementReport report, int pageNumber, int itemsPerPage)
        {
            var titleFont = new Font("Arial", 16, FontStyle.Bold);
            var headerFont = new Font("Arial", 10, FontStyle.Bold);
            var dataFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            int y = 20;

            // Title
            graphics.DrawString("Movement Report", titleFont, brush, 20, y);
            y += 30;

            // Report info
            graphics.DrawString($"Period: {report.StartDate:yyyy-MM-dd} to {report.EndDate:yyyy-MM-dd}", dataFont, brush, 20, y);
            graphics.DrawString($"Page: {pageNumber + 1}", dataFont, brush, 400, y);
            y += 20;

            // Summary (only on first page)
            if (pageNumber == 0)
            {
                graphics.DrawString($"Total Movements: {report.TotalMovements:N0}", dataFont, brush, 20, y);
                graphics.DrawString($"Total Quantity: {report.TotalQuantityMoved:N0}", dataFont, brush, 200, y);
                y += 30;
            }

            // Headers
            graphics.DrawString("Date", headerFont, brush, 20, y);
            graphics.DrawString("Type", headerFont, brush, 80, y);
            graphics.DrawString("Product", headerFont, brush, 130, y);
            graphics.DrawString("Qty", headerFont, brush, 230, y);
            graphics.DrawString("From", headerFont, brush, 270, y);
            graphics.DrawString("To", headerFont, brush, 330, y);
            graphics.DrawString("User", headerFont, brush, 390, y);
            y += 20;

            // Data
            var startIndex = pageNumber * itemsPerPage;
            var endIndex = Math.Min(startIndex + itemsPerPage, report.Movements.Count);

            for (int i = startIndex; i < endIndex; i++)
            {
                var movement = report.Movements[i];
                graphics.DrawString(movement.Date.ToString("MM/dd"), dataFont, brush, 20, y);
                graphics.DrawString(movement.Type.ToString().Substring(0, Math.Min(8, movement.Type.ToString().Length)), dataFont, brush, 80, y);
                graphics.DrawString(TruncateString(movement.ProductSKU, 12), dataFont, brush, 130, y);
                graphics.DrawString($"{movement.Quantity:N0}", dataFont, brush, 230, y);
                graphics.DrawString(TruncateString(movement.FromLocation, 8), dataFont, brush, 270, y);
                graphics.DrawString(TruncateString(movement.ToLocation, 8), dataFont, brush, 330, y);
                graphics.DrawString(TruncateString(movement.UserName, 10), dataFont, brush, 390, y);
                y += 15;
            }
        }

        private void DrawPickList(Graphics graphics, List<PickTaskDto> pickTasks, int pageNumber, int itemsPerPage)
        {
            var titleFont = new Font("Arial", 16, FontStyle.Bold);
            var headerFont = new Font("Arial", 10, FontStyle.Bold);
            var dataFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            int y = 20;

            // Title
            graphics.DrawString("Pick List", titleFont, brush, 20, y);
            y += 30;

            // Report info
            graphics.DrawString($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}", dataFont, brush, 20, y);
            graphics.DrawString($"Page: {pageNumber + 1}", dataFont, brush, 400, y);
            y += 20;

            // Headers
            graphics.DrawString("Task ID", headerFont, brush, 20, y);
            graphics.DrawString("Product", headerFont, brush, 80, y);
            graphics.DrawString("Location", headerFont, brush, 180, y);
            graphics.DrawString("Qty", headerFont, brush, 250, y);
            graphics.DrawString("Priority", headerFont, brush, 290, y);
            graphics.DrawString("Status", headerFont, brush, 350, y);
            graphics.DrawString("☐", headerFont, brush, 420, y); // Checkbox
            y += 20;

            // Data
            var startIndex = pageNumber * itemsPerPage;
            var endIndex = Math.Min(startIndex + itemsPerPage, pickTasks.Count);

            for (int i = startIndex; i < endIndex; i++)
            {
                var task = pickTasks[i];
                graphics.DrawString(task.TaskId.ToString(), dataFont, brush, 20, y);
                graphics.DrawString(TruncateString(task.ProductSKU, 12), dataFont, brush, 80, y);
                graphics.DrawString($"{task.RackCode}-{task.BinPosition}", dataFont, brush, 180, y);
                graphics.DrawString($"{task.QuantityToPick:N0}", dataFont, brush, 250, y);
                graphics.DrawString(task.Priority.ToString(), dataFont, brush, 290, y);
                graphics.DrawString(task.Status.ToString(), dataFont, brush, 350, y);
                graphics.DrawString("☐", dataFont, brush, 420, y); // Checkbox
                y += 15;
            }
        }

        private void DrawPutAwayList(Graphics graphics, List<PutAwayTaskDto> putAwayTasks, int pageNumber, int itemsPerPage)
        {
            var titleFont = new Font("Arial", 16, FontStyle.Bold);
            var headerFont = new Font("Arial", 10, FontStyle.Bold);
            var dataFont = new Font("Arial", 8);
            var brush = Brushes.Black;

            int y = 20;

            // Title
            graphics.DrawString("Put Away List", titleFont, brush, 20, y);
            y += 30;

            // Report info
            graphics.DrawString($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}", dataFont, brush, 20, y);
            graphics.DrawString($"Page: {pageNumber + 1}", dataFont, brush, 400, y);
            y += 20;

            // Headers
            graphics.DrawString("Task ID", headerFont, brush, 20, y);
            graphics.DrawString("Product", headerFont, brush, 80, y);
            graphics.DrawString("Destination", headerFont, brush, 180, y);
            graphics.DrawString("Qty", headerFont, brush, 250, y);
            graphics.DrawString("Priority", headerFont, brush, 290, y);
            graphics.DrawString("Status", headerFont, brush, 350, y);
            graphics.DrawString("☐", headerFont, brush, 420, y); // Checkbox
            y += 20;

            // Data
            var startIndex = pageNumber * itemsPerPage;
            var endIndex = Math.Min(startIndex + itemsPerPage, putAwayTasks.Count);

            for (int i = startIndex; i < endIndex; i++)
            {
                var task = putAwayTasks[i];
                graphics.DrawString(task.TaskId.ToString(), dataFont, brush, 20, y);
                graphics.DrawString(TruncateString(task.ProductSKU, 12), dataFont, brush, 80, y);
                graphics.DrawString($"{task.DestinationRackCode}-{task.DestinationBinPosition}", dataFont, brush, 180, y);
                graphics.DrawString($"{task.QuantityToPutAway:N0}", dataFont, brush, 250, y);
                graphics.DrawString(task.Priority.ToString(), dataFont, brush, 290, y);
                graphics.DrawString(task.Status.ToString(), dataFont, brush, 350, y);
                graphics.DrawString("☐", dataFont, brush, 420, y); // Checkbox
                y += 15;
            }
        }

        private string TruncateString(string input, int maxLength)
        {
            if (string.IsNullOrEmpty(input) || input.Length <= maxLength)
                return input ?? "";

            return input.Substring(0, maxLength - 3) + "...";
        }
    }

    public class BinLabelInfo
    {
        public string RackCode { get; set; } = string.Empty;
        public string Position { get; set; } = string.Empty;
        public string WarehouseName { get; set; } = string.Empty;
        public string ZoneName { get; set; } = string.Empty;
        public decimal MaxWeight { get; set; }
        public decimal MaxVolume { get; set; }
    }

    public class ProductLabelInfo
    {
        public string SKU { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public decimal Weight { get; set; }
        public decimal Volume { get; set; }
        public bool IsHazardous { get; set; }
    }

    public class TaskLabelInfo
    {
        public int TaskId { get; set; }
        public string TaskType { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
    }

    public enum ReportType
    {
        Inventory,
        Movement,
        Performance,
        BinUtilization,
        ProductAnalysis,
        UserActivity,
        Alerts
    }
}
