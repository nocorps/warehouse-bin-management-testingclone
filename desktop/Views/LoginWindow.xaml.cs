using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using WarehouseManagement.Desktop.ViewModels;
using WarehouseManagement.Desktop.Services;

namespace WarehouseManagement.Desktop.Views
{
    public partial class LoginWindow : Window
    {
        private readonly LoginViewModel _viewModel;

        public LoginWindow(LoginViewModel viewModel)
        {
            InitializeComponent();
            _viewModel = viewModel;
            DataContext = _viewModel;

            // Subscribe to login events
            _viewModel.LoginSuccessful += OnLoginSuccessful;

            // Set focus to username field
            Loaded += (s, e) => 
            {
                if (!string.IsNullOrEmpty(_viewModel.Username))
                    PasswordBox.Focus();
                else
                    MoveFocus(new TraversalRequest(FocusNavigationDirection.First));
            };

            // Handle password binding (PasswordBox doesn't support direct binding)
            PasswordBox.PasswordChanged += (s, e) =>
            {
                _viewModel.Password = PasswordBox.Password;
            };
        }

        private void OnLoginSuccessful(object? sender, AuthResult result)
        {
            // Close login window and show main window
            DialogResult = true;
            Close();
        }

        protected override void OnClosed(EventArgs e)
        {
            _viewModel.LoginSuccessful -= OnLoginSuccessful;
            base.OnClosed(e);
        }
    }
}
