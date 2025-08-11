using Microsoft.Extensions.Logging;
using System.Drawing;
using System.Drawing.Imaging;
using ZXing;
using ZXing.Common;
using ZXing.Windows.Compatibility;

namespace WarehouseManagement.Desktop.Services
{
    public interface IBarcodeService
    {
        byte[] GenerateBarcode(string data, BarcodeFormat format = BarcodeFormat.CODE_128, int width = 300, int height = 100);
        string? ScanBarcode(byte[] imageData);
        string? ScanBarcode(string imagePath);
        byte[] GenerateQRCode(string data, int size = 200);
        string GenerateBinBarcode(string rackCode, string position);
        string GenerateProductBarcode(string sku);
        string GenerateTaskBarcode(int taskId);
        BarcodeInfo? ParseBinBarcode(string barcode);
        BarcodeInfo? ParseProductBarcode(string barcode);
        BarcodeInfo? ParseTaskBarcode(string barcode);
        bool ValidateBarcode(string barcode, BarcodeType expectedType);
    }

    public class BarcodeService : IBarcodeService
    {
        private readonly ILogger<BarcodeService> _logger;
        private readonly BarcodeReader _barcodeReader;
        private readonly BarcodeWriter _barcodeWriter;

        public BarcodeService(ILogger<BarcodeService> logger)
        {
            _logger = logger;
            _barcodeReader = new BarcodeReader();
            _barcodeWriter = new BarcodeWriter();
            
            // Configure barcode reader options
            _barcodeReader.Options.TryHarder = true;
            _barcodeReader.Options.PossibleFormats = new List<BarcodeFormat>
            {
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.QR_CODE,
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8
            };
        }

        public byte[] GenerateBarcode(string data, BarcodeFormat format = BarcodeFormat.CODE_128, int width = 300, int height = 100)
        {
            try
            {
                _barcodeWriter.Format = format;
                _barcodeWriter.Options = new EncodingOptions
                {
                    Width = width,
                    Height = height,
                    Margin = 1,
                    PureBarcode = false
                };

                using var bitmap = _barcodeWriter.Write(data);
                using var stream = new MemoryStream();
                bitmap.Save(stream, ImageFormat.Png);
                
                _logger.LogDebug("Generated barcode for data: {Data}, format: {Format}", data, format);
                return stream.ToArray();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating barcode for data: {Data}", data);
                throw;
            }
        }

        public string? ScanBarcode(byte[] imageData)
        {
            try
            {
                using var stream = new MemoryStream(imageData);
                using var bitmap = new Bitmap(stream);
                
                var result = _barcodeReader.Decode(bitmap);
                
                if (result != null)
                {
                    _logger.LogDebug("Successfully scanned barcode: {BarcodeData}", result.Text);
                    return result.Text;
                }

                _logger.LogDebug("No barcode found in provided image data");
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning barcode from image data");
                return null;
            }
        }

        public string? ScanBarcode(string imagePath)
        {
            try
            {
                if (!File.Exists(imagePath))
                {
                    _logger.LogWarning("Image file not found: {ImagePath}", imagePath);
                    return null;
                }

                using var bitmap = new Bitmap(imagePath);
                var result = _barcodeReader.Decode(bitmap);
                
                if (result != null)
                {
                    _logger.LogDebug("Successfully scanned barcode from file {ImagePath}: {BarcodeData}", imagePath, result.Text);
                    return result.Text;
                }

                _logger.LogDebug("No barcode found in image file: {ImagePath}", imagePath);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning barcode from image file: {ImagePath}", imagePath);
                return null;
            }
        }

        public byte[] GenerateQRCode(string data, int size = 200)
        {
            try
            {
                var writer = new BarcodeWriter
                {
                    Format = BarcodeFormat.QR_CODE,
                    Options = new EncodingOptions
                    {
                        Width = size,
                        Height = size,
                        Margin = 1
                    }
                };

                using var bitmap = writer.Write(data);
                using var stream = new MemoryStream();
                bitmap.Save(stream, ImageFormat.Png);
                
                _logger.LogDebug("Generated QR code for data: {Data}", data);
                return stream.ToArray();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating QR code for data: {Data}", data);
                throw;
            }
        }

        public string GenerateBinBarcode(string rackCode, string position)
        {
            // Format: BIN-{RACKCODE}-{POSITION}
            var barcode = $"BIN-{rackCode}-{position}";
            _logger.LogDebug("Generated bin barcode: {Barcode}", barcode);
            return barcode;
        }

        public string GenerateProductBarcode(string sku)
        {
            // Format: PROD-{SKU}
            var barcode = $"PROD-{sku}";
            _logger.LogDebug("Generated product barcode: {Barcode}", barcode);
            return barcode;
        }

        public string GenerateTaskBarcode(int taskId)
        {
            // Format: TASK-{TASKID:D8}
            var barcode = $"TASK-{taskId:D8}";
            _logger.LogDebug("Generated task barcode: {Barcode}", barcode);
            return barcode;
        }

        public BarcodeInfo? ParseBinBarcode(string barcode)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(barcode) || !barcode.StartsWith("BIN-"))
                    return null;

                var parts = barcode.Split('-');
                if (parts.Length != 3)
                    return null;

                return new BarcodeInfo
                {
                    Type = BarcodeType.Bin,
                    RackCode = parts[1],
                    Position = parts[2],
                    OriginalBarcode = barcode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing bin barcode: {Barcode}", barcode);
                return null;
            }
        }

        public BarcodeInfo? ParseProductBarcode(string barcode)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(barcode) || !barcode.StartsWith("PROD-"))
                    return null;

                var parts = barcode.Split('-', 2);
                if (parts.Length != 2)
                    return null;

                return new BarcodeInfo
                {
                    Type = BarcodeType.Product,
                    ProductSKU = parts[1],
                    OriginalBarcode = barcode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing product barcode: {Barcode}", barcode);
                return null;
            }
        }

        public BarcodeInfo? ParseTaskBarcode(string barcode)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(barcode) || !barcode.StartsWith("TASK-"))
                    return null;

                var parts = barcode.Split('-');
                if (parts.Length != 2)
                    return null;

                if (!int.TryParse(parts[1], out var taskId))
                    return null;

                return new BarcodeInfo
                {
                    Type = BarcodeType.Task,
                    TaskId = taskId,
                    OriginalBarcode = barcode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error parsing task barcode: {Barcode}", barcode);
                return null;
            }
        }

        public bool ValidateBarcode(string barcode, BarcodeType expectedType)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(barcode))
                    return false;

                switch (expectedType)
                {
                    case BarcodeType.Bin:
                        return ParseBinBarcode(barcode) != null;
                    case BarcodeType.Product:
                        return ParseProductBarcode(barcode) != null;
                    case BarcodeType.Task:
                        return ParseTaskBarcode(barcode) != null;
                    default:
                        return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating barcode: {Barcode}", barcode);
                return false;
            }
        }
    }

    public class BarcodeInfo
    {
        public BarcodeType Type { get; set; }
        public string? RackCode { get; set; }
        public string? Position { get; set; }
        public string? ProductSKU { get; set; }
        public int? TaskId { get; set; }
        public string OriginalBarcode { get; set; } = string.Empty;
    }

    public enum BarcodeType
    {
        Bin,
        Product,
        Task,
        Unknown
    }
}
