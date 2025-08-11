using System.Windows.Controls;
using Microsoft.Extensions.DependencyInjection;
using WarehouseManagement.Desktop.ViewModels;

namespace WarehouseManagement.Desktop.Views
{
    public partial class BinManagementView : UserControl
    {
        public BinManagementView()
        {
            InitializeComponent();
            
            // Set DataContext to ViewModel - this would typically be done through DI
            if (System.ComponentModel.DesignerProperties.GetIsInDesignMode(this))
                return;

            // In a real application, you'd inject the ViewModel through the constructor
            // DataContext = serviceProvider.GetRequiredService<BinManagementViewModel>();
        }

        public BinManagementView(BinManagementViewModel viewModel) : this()
        {
            DataContext = viewModel;
            
            // Load initial data when the view is loaded
            Loaded += async (s, e) => await viewModel.LoadDataCommand.ExecuteAsync(null);
        }
    }
}
