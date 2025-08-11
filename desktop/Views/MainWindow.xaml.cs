using Microsoft.Extensions.DependencyInjection;
using System.Windows;
using WarehouseManagement.Desktop.ViewModels;

namespace WarehouseManagement.Desktop.Views;

/// <summary>
/// High-Performance Main Window for Warehouse Management Desktop Application
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow(MainWindowViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        
        // Enable hardware acceleration for better performance
        RenderOptions.ProcessRenderMode = System.Windows.Interop.RenderMode.Default;
        
        // Optimize for large datasets
        SetValue(VirtualizingPanel.IsVirtualizingProperty, true);
        SetValue(VirtualizingPanel.VirtualizationModeProperty, VirtualizationMode.Recycling);
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        
        // Additional performance optimizations can be added here
        // such as custom rendering behaviors for high-load scenarios
    }
}
