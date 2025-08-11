using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using System.Collections.ObjectModel;
using System.Windows;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Models.Entities;
using WarehouseManagement.Desktop.Services;

namespace WarehouseManagement.Desktop.ViewModels
{
    public partial class BinManagementViewModel : ObservableObject
    {
        private readonly IWarehouseOperationsService _warehouseService;
        private readonly IBulkOperationsService _bulkService;
        private readonly IExcelService _excelService;
        private readonly ILogger<BinManagementViewModel> _logger;

        [ObservableProperty]
        private ObservableCollection<BinDto> bins = new();

        [ObservableProperty]
        private ObservableCollection<RackDto> racks = new();

        [ObservableProperty]
        private ObservableCollection<WarehouseDto> warehouses = new();

        [ObservableProperty]
        private BinDto? selectedBin;

        [ObservableProperty]
        private WarehouseDto? selectedWarehouse;

        [ObservableProperty]
        private RackDto? selectedRack;

        [ObservableProperty]
        private string searchText = string.Empty;

        [ObservableProperty]
        private BinStatus filterStatus = BinStatus.All;

        [ObservableProperty]
        private bool isLoading;

        [ObservableProperty]
        private string statusMessage = string.Empty;

        // New bin creation properties
        [ObservableProperty]
        private string newBinPosition = string.Empty;

        [ObservableProperty]
        private decimal newBinMaxWeight = 1000;

        [ObservableProperty]
        private decimal newBinMaxVolume = 1000;

        [ObservableProperty]
        private BinType newBinType = BinType.Standard;

        public BinManagementViewModel(
            IWarehouseOperationsService warehouseService,
            IBulkOperationsService bulkService,
            IExcelService excelService,
            ILogger<BinManagementViewModel> logger)
        {
            _warehouseService = warehouseService;
            _bulkService = bulkService;
            _excelService = excelService;
            _logger = logger;
        }

        [RelayCommand]
        private async Task LoadDataAsync()
        {
            try
            {
                IsLoading = true;
                StatusMessage = "Loading warehouses...";

                var warehousesResult = await _warehouseService.GetWarehousesAsync();
                Warehouses.Clear();
                foreach (var warehouse in warehousesResult)
                {
                    Warehouses.Add(warehouse);
                }

                if (Warehouses.Any() && SelectedWarehouse == null)
                {
                    SelectedWarehouse = Warehouses.First();
                }

                await LoadRacksAsync();
                StatusMessage = "Data loaded successfully";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading data");
                StatusMessage = $"Error loading data: {ex.Message}";
            }
            finally
            {
                IsLoading = false;
            }
        }

        [RelayCommand]
        private async Task LoadRacksAsync()
        {
            if (SelectedWarehouse == null) return;

            try
            {
                StatusMessage = "Loading racks...";
                var racksResult = await _warehouseService.GetRacksByWarehouseAsync(SelectedWarehouse.Id);
                Racks.Clear();
                foreach (var rack in racksResult)
                {
                    Racks.Add(rack);
                }

                await LoadBinsAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading racks for warehouse {WarehouseId}", SelectedWarehouse?.Id);
                StatusMessage = $"Error loading racks: {ex.Message}";
            }
        }

        [RelayCommand]
        private async Task LoadBinsAsync()
        {
            if (SelectedWarehouse == null) return;

            try
            {
                StatusMessage = "Loading bins...";
                
                var binsResult = await _warehouseService.GetBinsByWarehouseAsync(
                    SelectedWarehouse.Id, 
                    SelectedRack?.Id,
                    FilterStatus == BinStatus.All ? null : FilterStatus);

                Bins.Clear();
                foreach (var bin in binsResult)
                {
                    Bins.Add(bin);
                }

                ApplySearchFilter();
                StatusMessage = $"Loaded {Bins.Count} bins";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading bins for warehouse {WarehouseId}", SelectedWarehouse?.Id);
                StatusMessage = $"Error loading bins: {ex.Message}";
            }
        }

        [RelayCommand]
        private async Task SearchBinsAsync()
        {
            await LoadBinsAsync();
        }

        [RelayCommand]
        private async Task CreateBinAsync()
        {
            if (SelectedRack == null)
            {
                MessageBox.Show("Please select a rack first.", "Create Bin", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            if (string.IsNullOrWhiteSpace(NewBinPosition))
            {
                MessageBox.Show("Please enter a bin position.", "Create Bin", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                IsLoading = true;
                StatusMessage = "Creating bin...";

                var newBin = new CreateBinDto
                {
                    RackId = SelectedRack.Id,
                    Position = NewBinPosition.Trim(),
                    MaxWeight = NewBinMaxWeight,
                    MaxVolume = NewBinMaxVolume,
                    BinType = NewBinType
                };

                var createdBin = await _warehouseService.CreateBinAsync(newBin);
                
                if (createdBin != null)
                {
                    Bins.Add(createdBin);
                    ClearNewBinForm();
                    StatusMessage = $"Bin {SelectedRack.Code}-{NewBinPosition} created successfully";
                    _logger.LogInformation("Bin created: {RackCode}-{Position}", SelectedRack.Code, NewBinPosition);
                }
                else
                {
                    StatusMessage = "Failed to create bin";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating bin {RackCode}-{Position}", SelectedRack?.Code, NewBinPosition);
                StatusMessage = $"Error creating bin: {ex.Message}";
                MessageBox.Show($"Error creating bin: {ex.Message}", "Create Bin", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                IsLoading = false;
            }
        }

        [RelayCommand]
        private async Task UpdateBinAsync()
        {
            if (SelectedBin == null)
            {
                MessageBox.Show("Please select a bin to update.", "Update Bin", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                IsLoading = true;
                StatusMessage = "Updating bin...";

                var updateBin = new UpdateBinDto
                {
                    Id = SelectedBin.Id,
                    MaxWeight = SelectedBin.MaxWeight,
                    MaxVolume = SelectedBin.MaxVolume,
                    BinType = SelectedBin.BinType,
                    Status = SelectedBin.Status
                };

                var success = await _warehouseService.UpdateBinAsync(updateBin);
                
                if (success)
                {
                    StatusMessage = $"Bin {SelectedBin.RackCode}-{SelectedBin.Position} updated successfully";
                    _logger.LogInformation("Bin updated: {BinId}", SelectedBin.Id);
                }
                else
                {
                    StatusMessage = "Failed to update bin";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating bin {BinId}", SelectedBin?.Id);
                StatusMessage = $"Error updating bin: {ex.Message}";
                MessageBox.Show($"Error updating bin: {ex.Message}", "Update Bin", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                IsLoading = false;
            }
        }

        [RelayCommand]
        private async Task DeleteBinAsync()
        {
            if (SelectedBin == null)
            {
                MessageBox.Show("Please select a bin to delete.", "Delete Bin", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var result = MessageBox.Show(
                $"Are you sure you want to delete bin {SelectedBin.RackCode}-{SelectedBin.Position}?",
                "Delete Bin",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            try
            {
                IsLoading = true;
                StatusMessage = "Deleting bin...";

                var success = await _warehouseService.DeleteBinAsync(SelectedBin.Id);
                
                if (success)
                {
                    Bins.Remove(SelectedBin);
                    StatusMessage = $"Bin {SelectedBin.RackCode}-{SelectedBin.Position} deleted successfully";
                    _logger.LogInformation("Bin deleted: {BinId}", SelectedBin.Id);
                    SelectedBin = null;
                }
                else
                {
                    StatusMessage = "Failed to delete bin";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting bin {BinId}", SelectedBin?.Id);
                StatusMessage = $"Error deleting bin: {ex.Message}";
                MessageBox.Show($"Error deleting bin: {ex.Message}", "Delete Bin", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                IsLoading = false;
            }
        }

        [RelayCommand]
        private async Task BulkCreateBinsAsync()
        {
            if (SelectedRack == null)
            {
                MessageBox.Show("Please select a rack first.", "Bulk Create Bins", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            // Show bulk create dialog (would need to implement this)
            var dialog = new BulkCreateBinsDialog(SelectedRack);
            if (dialog.ShowDialog() == true)
            {
                try
                {
                    IsLoading = true;
                    StatusMessage = "Creating bins in bulk...";

                    var binsToCreate = dialog.GetBinsToCreate();
                    await _bulkService.BulkCreateBinsAsync(binsToCreate);

                    await LoadBinsAsync();
                    StatusMessage = $"Successfully created {binsToCreate.Count} bins";
                    _logger.LogInformation("Bulk created {Count} bins for rack {RackId}", binsToCreate.Count, SelectedRack.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error bulk creating bins for rack {RackId}", SelectedRack.Id);
                    StatusMessage = $"Error bulk creating bins: {ex.Message}";
                    MessageBox.Show($"Error bulk creating bins: {ex.Message}", "Bulk Create Bins", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                finally
                {
                    IsLoading = false;
                }
            }
        }

        [RelayCommand]
        private async Task ImportBinsAsync()
        {
            var openFileDialog = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "Excel files (*.xlsx)|*.xlsx|All files (*.*)|*.*",
                FilterIndex = 1,
                RestoreDirectory = true
            };

            if (openFileDialog.ShowDialog() == true)
            {
                try
                {
                    IsLoading = true;
                    StatusMessage = "Importing bins from Excel...";

                    var progress = new Progress<ImportProgress>(p =>
                    {
                        StatusMessage = $"Importing bins: {p.Message} ({p.PercentComplete:F1}%)";
                    });

                    var result = await _excelService.ImportBinsAsync(openFileDialog.FileName, progress);
                    
                    if (result.Success)
                    {
                        await LoadBinsAsync();
                        StatusMessage = $"Import completed: {result.ProcessedRows} bins imported, {result.SkippedRows} skipped, {result.ErrorRows} errors";
                        MessageBox.Show(result.Message, "Import Complete", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else
                    {
                        StatusMessage = $"Import failed: {result.Message}";
                        MessageBox.Show(result.Message, "Import Failed", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error importing bins from file {FileName}", openFileDialog.FileName);
                    StatusMessage = $"Import error: {ex.Message}";
                    MessageBox.Show($"Import error: {ex.Message}", "Import Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                finally
                {
                    IsLoading = false;
                }
            }
        }

        [RelayCommand]
        private async Task ExportBinsAsync()
        {
            var saveFileDialog = new Microsoft.Win32.SaveFileDialog
            {
                Filter = "Excel files (*.xlsx)|*.xlsx|All files (*.*)|*.*",
                FilterIndex = 1,
                RestoreDirectory = true,
                FileName = $"Bins_Export_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.xlsx"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                try
                {
                    IsLoading = true;
                    StatusMessage = "Exporting bins to Excel...";

                    var success = await _excelService.ExportBinsAsync(saveFileDialog.FileName, SelectedWarehouse?.Id);
                    
                    if (success)
                    {
                        StatusMessage = "Bins exported successfully";
                        MessageBox.Show("Bins exported successfully!", "Export Complete", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else
                    {
                        StatusMessage = "Export failed";
                        MessageBox.Show("Export failed!", "Export Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error exporting bins to file {FileName}", saveFileDialog.FileName);
                    StatusMessage = $"Export error: {ex.Message}";
                    MessageBox.Show($"Export error: {ex.Message}", "Export Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                finally
                {
                    IsLoading = false;
                }
            }
        }

        partial void OnSelectedWarehouseChanged(WarehouseDto? value)
        {
            if (value != null)
            {
                _ = LoadRacksAsync();
            }
        }

        partial void OnSelectedRackChanged(RackDto? value)
        {
            _ = LoadBinsAsync();
        }

        partial void OnFilterStatusChanged(BinStatus value)
        {
            _ = LoadBinsAsync();
        }

        partial void OnSearchTextChanged(string value)
        {
            ApplySearchFilter();
        }

        private void ApplySearchFilter()
        {
            if (string.IsNullOrWhiteSpace(SearchText))
                return;

            var filteredBins = Bins.Where(b =>
                b.Position.Contains(SearchText, StringComparison.OrdinalIgnoreCase) ||
                b.RackCode.Contains(SearchText, StringComparison.OrdinalIgnoreCase)).ToList();

            Bins.Clear();
            foreach (var bin in filteredBins)
            {
                Bins.Add(bin);
            }
        }

        private void ClearNewBinForm()
        {
            NewBinPosition = string.Empty;
            NewBinMaxWeight = 1000;
            NewBinMaxVolume = 1000;
            NewBinType = BinType.Standard;
        }
    }
}

// Placeholder for bulk create bins dialog
public class BulkCreateBinsDialog : Window
{
    private readonly RackDto _rack;

    public BulkCreateBinsDialog(RackDto rack)
    {
        _rack = rack;
        Title = $"Bulk Create Bins for Rack {rack.Code}";
        // Initialize dialog UI
    }

    public List<Bin> GetBinsToCreate()
    {
        // Return list of bins to create based on dialog input
        return new List<Bin>();
    }
}
