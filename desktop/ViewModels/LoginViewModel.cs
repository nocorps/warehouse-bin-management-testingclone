using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using System.Windows;
using WarehouseManagement.Desktop.Services;

namespace WarehouseManagement.Desktop.ViewModels
{
    public partial class LoginViewModel : ObservableObject
    {
        private readonly IAuthenticationService _authenticationService;
        private readonly ILogger<LoginViewModel> _logger;

        [ObservableProperty]
        private string username = string.Empty;

        [ObservableProperty]
        private string password = string.Empty;

        [ObservableProperty]
        private bool isLoading;

        [ObservableProperty]
        private string errorMessage = string.Empty;

        [ObservableProperty]
        private bool rememberMe;

        public event EventHandler<AuthResult>? LoginSuccessful;

        public LoginViewModel(IAuthenticationService authenticationService, ILogger<LoginViewModel> logger)
        {
            _authenticationService = authenticationService;
            _logger = logger;
        }

        [RelayCommand]
        private async Task LoginAsync()
        {
            if (string.IsNullOrWhiteSpace(Username) || string.IsNullOrWhiteSpace(Password))
            {
                ErrorMessage = "Please enter both username and password.";
                return;
            }

            try
            {
                IsLoading = true;
                ErrorMessage = string.Empty;

                var result = await _authenticationService.LoginAsync(Username, Password);

                if (result.Success)
                {
                    _logger.LogInformation("User {Username} logged in successfully", Username);
                    LoginSuccessful?.Invoke(this, result);
                }
                else
                {
                    ErrorMessage = result.Message;
                    _logger.LogWarning("Login failed for user {Username}: {Message}", Username, result.Message);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login for user {Username}", Username);
                ErrorMessage = "An error occurred during login. Please try again.";
            }
            finally
            {
                IsLoading = false;
                Password = string.Empty; // Clear password for security
            }
        }

        [RelayCommand]
        private void Cancel()
        {
            Application.Current.Shutdown();
        }

        [RelayCommand]
        private void ClearForm()
        {
            Username = string.Empty;
            Password = string.Empty;
            ErrorMessage = string.Empty;
            RememberMe = false;
        }
    }
}
