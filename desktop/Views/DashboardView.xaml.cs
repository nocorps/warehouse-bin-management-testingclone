using System.Windows.Controls;

namespace WarehouseManagement.Desktop.Views;

/// <summary>
/// High-Performance Dashboard View with optimized rendering for large datasets
/// </summary>
public partial class DashboardView : UserControl
{
    public DashboardView()
    {
        InitializeComponent();
        
        // Enable virtualization for performance
        SetValue(VirtualizingPanel.IsVirtualizingProperty, true);
        SetValue(VirtualizingPanel.VirtualizationModeProperty, VirtualizationMode.Recycling);
    }
}
