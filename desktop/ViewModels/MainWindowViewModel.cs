using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Collections.ObjectModel;
using System.Windows.Input;
using WarehouseManagement.Desktop.Models.DTOs;
using WarehouseManagement.Desktop.Services;

namespace WarehouseManagement.Desktop.ViewModels;

public partial class MainWindowViewModel : ObservableObject
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MainWindowViewModel> _logger;
    private readonly IWarehouseOperationsService _warehouseService;

    [ObservableProperty]
    private string _currentUserName = "Administrator";

    [ObservableProperty]
    private string _currentWarehouseName = "Main Warehouse";

    [ObservableProperty]
    private string _applicationTitle = "Warehouse Management Pro";

    [ObservableProperty]
    private bool _isLoading = false;

    [ObservableProperty]
    private string _statusMessage = "Ready";

    [ObservableProperty]
    private int _selectedTabIndex = 0;

    [ObservableProperty]
    private ObservableCollection<WarehouseDto> _availableWarehouses = new();

    [ObservableProperty]
    private WarehouseDto? _selectedWarehouse;

    [ObservableProperty]
    private DashboardStatsDto? _dashboardStats;

    // Child ViewModels
    [ObservableProperty]
    private DashboardViewModel _dashboardViewModel;

    [ObservableProperty]
    private BinManagementViewModel _binManagementViewModel;

    [ObservableProperty]
    private PutAwayOperationsViewModel _putAwayOperationsViewModel;

    [ObservableProperty]
    private PickOperationsViewModel _pickOperationsViewModel;

    [ObservableProperty]
    private RackConfigurationViewModel _rackConfigurationViewModel;

    [ObservableProperty]
    private SettingsViewModel _settingsViewModel;

    public MainWindowViewModel(
        IServiceProvider serviceProvider,
        ILogger<MainWindowViewModel> logger,
        IWarehouseOperationsService warehouseService)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _warehouseService = warehouseService;

        // Initialize child view models
        _dashboardViewModel = _serviceProvider.GetRequiredService<DashboardViewModel>();
        _binManagementViewModel = _serviceProvider.GetRequiredService<BinManagementViewModel>();
        _putAwayOperationsViewModel = _serviceProvider.GetRequiredService<PutAwayOperationsViewModel>();
        _pickOperationsViewModel = _serviceProvider.GetRequiredService<PickOperationsViewModel>();
        _rackConfigurationViewModel = _serviceProvider.GetRequiredService<RackConfigurationViewModel>();
        _settingsViewModel = _serviceProvider.GetRequiredService<SettingsViewModel>();

        InitializeAsync();
    }

    [RelayCommand]
    private async Task RefreshDashboardAsync()
    {
        if (SelectedWarehouse == null) return;

        try
        {
            IsLoading = true;
            StatusMessage = "Refreshing dashboard...";

            DashboardStats = await _warehouseService.GetDashboardStatsAsync(SelectedWarehouse.Id);
            
            // Refresh child view models
            await DashboardViewModel.RefreshAsync();
            
            StatusMessage = "Dashboard refreshed";
            _logger.LogInformation("Dashboard refreshed for warehouse {WarehouseId}", SelectedWarehouse.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing dashboard");
            StatusMessage = "Error refreshing dashboard";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task LoadWarehousesAsync()
    {
        try
        {
            IsLoading = true;
            StatusMessage = "Loading warehouses...";

            // Implementation would load warehouses from service
            // For now, using demo data
            var demoWarehouse = new WarehouseDto(
                Guid.NewGuid(),
                "Main Warehouse",
                "MAIN-01",
                "Primary warehouse facility",
                "123 Industrial Blvd",
                "Business City",
                "12345",
                "USA",
                true,
                DateTime.UtcNow.AddDays(-30),
                DateTime.UtcNow,
                5, // Total zones
                25, // Total racks
                500, // Total bins
                320, // Occupied bins
                64.0 // Utilization percentage
            );

            AvailableWarehouses.Clear();
            AvailableWarehouses.Add(demoWarehouse);
            
            SelectedWarehouse = demoWarehouse;
            CurrentWarehouseName = demoWarehouse.Name;

            StatusMessage = "Warehouses loaded";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading warehouses");
            StatusMessage = "Error loading warehouses";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private void NavigateToTab(object parameter)
    {
        if (parameter is string tabName)
        {
            SelectedTabIndex = tabName switch
            {
                "Dashboard" => 0,
                "BinManagement" => 1,
                "PutAway" => 2,
                "Pick" => 3,
                "RackConfig" => 4,
                "Settings" => 5,
                _ => 0
            };

            _logger.LogDebug("Navigated to tab: {TabName} (Index: {TabIndex})", tabName, SelectedTabIndex);
        }
    }

    [RelayCommand]
    private async Task LogoutAsync()
    {
        try
        {
            _logger.LogInformation("User {UserName} logging out", CurrentUserName);
            
            // Clear current state
            SelectedWarehouse = null;
            DashboardStats = null;
            AvailableWarehouses.Clear();
            
            // Show login window
            var loginWindow = _serviceProvider.GetRequiredService<Views.LoginWindow>();
            loginWindow.Show();
            
            // Close main window
            System.Windows.Application.Current.MainWindow?.Close();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during logout");
        }
    }

    [RelayCommand]
    private void ShowAbout()
    {
        var aboutMessage = $"""
            {ApplicationTitle}
            Version 2.0.1
            
            High-Performance Warehouse Management Desktop Application
            Built with .NET 8, WPF, and SQL Server
            
            Features:
            • High-load bin management (50,000+ bins)
            • Smart allocation algorithms
            • FIFO picking logic
            • Real-time performance monitoring
            • Bulk operations support
            • Mixed SKU storage
            • Comprehensive audit trails
            
            © 2025 Warehouse Solutions Inc.
            """;

        System.Windows.MessageBox.Show(aboutMessage, "About Warehouse Management Pro", 
            System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Information);
    }

    partial void OnSelectedWarehouseChanged(WarehouseDto? value)
    {
        if (value != null)
        {
            CurrentWarehouseName = value.Name;
            
            // Update child view models with new warehouse
            DashboardViewModel.SetWarehouse(value);
            BinManagementViewModel.SetWarehouse(value);
            PutAwayOperationsViewModel.SetWarehouse(value);
            PickOperationsViewModel.SetWarehouse(value);
            RackConfigurationViewModel.SetWarehouse(value);
            
            _logger.LogInformation("Selected warehouse changed to {WarehouseName} ({WarehouseId})", 
                value.Name, value.Id);
        }
    }

    partial void OnSelectedTabIndexChanged(int value)
    {
        // Trigger refresh for the selected tab
        Task.Run(async () =>
        {
            try
            {
                switch (value)
                {
                    case 0: // Dashboard
                        await DashboardViewModel.RefreshAsync();
                        break;
                    case 1: // Bin Management
                        await BinManagementViewModel.RefreshAsync();
                        break;
                    case 2: // Put Away
                        await PutAwayOperationsViewModel.RefreshAsync();
                        break;
                    case 3: // Pick Operations
                        await PickOperationsViewModel.RefreshAsync();
                        break;
                    case 4: // Rack Configuration
                        await RackConfigurationViewModel.RefreshAsync();
                        break;
                    case 5: // Settings
                        await SettingsViewModel.RefreshAsync();
                        break;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing tab {TabIndex}", value);
            }
        });
    }

    private async void InitializeAsync()
    {
        await LoadWarehousesAsync();
        await RefreshDashboardAsync();
    }

    public void UpdateStatusMessage(string message)
    {
        StatusMessage = message;
        _logger.LogDebug("Status message updated: {Message}", message);
    }

    public void SetLoadingState(bool isLoading, string? message = null)
    {
        IsLoading = isLoading;
        if (message != null)
        {
            StatusMessage = message;
        }
    }
}

// Placeholder ViewModels - these would be fully implemented based on the requirements
public partial class DashboardViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        // Implementation for dashboard refresh
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}

public partial class BinManagementViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}

public partial class PutAwayOperationsViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}

public partial class PickOperationsViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}

public partial class RackConfigurationViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}

public partial class SettingsViewModel : ObservableObject
{
    [ObservableProperty]
    private WarehouseDto? _currentWarehouse;

    public async Task RefreshAsync()
    {
        await Task.Delay(100); // Placeholder
    }

    public void SetWarehouse(WarehouseDto warehouse)
    {
        CurrentWarehouse = warehouse;
    }
}
