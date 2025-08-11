using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Models.Entities;
using WarehouseManagement.Desktop.Models.DTOs;

namespace WarehouseManagement.Desktop.Services
{
    public interface IAuthenticationService
    {
        Task<AuthResult> LoginAsync(string username, string password);
        Task<AuthResult> RegisterAsync(string username, string password, string email, UserRole role);
        Task<bool> LogoutAsync();
        Task<bool> ChangePasswordAsync(int userId, string currentPassword, string newPassword);
        Task<User?> GetCurrentUserAsync();
        Task<bool> ValidateTokenAsync(string token);
        Task<List<User>> GetUsersAsync();
        Task<bool> UpdateUserRoleAsync(int userId, UserRole newRole);
        Task<bool> DeactivateUserAsync(int userId);
    }

    public class AuthenticationService : IAuthenticationService
    {
        private readonly WarehouseDbContext _context;
        private readonly ILogger<AuthenticationService> _logger;
        private readonly IConfiguration _configuration;
        private User? _currentUser;
        private string? _currentToken;

        public AuthenticationService(
            WarehouseDbContext context,
            ILogger<AuthenticationService> logger,
            IConfiguration configuration)
        {
            _context = context;
            _logger = logger;
            _configuration = configuration;
        }

        public async Task<AuthResult> LoginAsync(string username, string password)
        {
            try
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == username && u.IsActive);

                if (user == null)
                {
                    _logger.LogWarning("Login attempt failed: User {Username} not found", username);
                    return new AuthResult { Success = false, Message = "Invalid username or password" };
                }

                if (!VerifyPassword(password, user.PasswordHash, user.Salt))
                {
                    _logger.LogWarning("Login attempt failed: Invalid password for user {Username}", username);
                    return new AuthResult { Success = false, Message = "Invalid username or password" };
                }

                // Update last login
                user.LastLoginDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                _currentUser = user;
                _currentToken = GenerateSessionToken(user);

                _logger.LogInformation("User {Username} logged in successfully", username);

                return new AuthResult 
                { 
                    Success = true, 
                    Message = "Login successful",
                    User = new UserDto
                    {
                        Id = user.Id,
                        Username = user.Username,
                        Email = user.Email,
                        Role = user.Role,
                        IsActive = user.IsActive,
                        CreatedDate = user.CreatedDate,
                        LastLoginDate = user.LastLoginDate
                    },
                    Token = _currentToken
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login for user {Username}", username);
                return new AuthResult { Success = false, Message = "An error occurred during login" };
            }
        }

        public async Task<AuthResult> RegisterAsync(string username, string password, string email, UserRole role)
        {
            try
            {
                // Check if user already exists
                var existingUser = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == username || u.Email == email);

                if (existingUser != null)
                {
                    return new AuthResult { Success = false, Message = "Username or email already exists" };
                }

                // Generate salt and hash password
                var salt = GenerateSalt();
                var passwordHash = HashPassword(password, salt);

                var user = new User
                {
                    Username = username,
                    Email = email,
                    PasswordHash = passwordHash,
                    Salt = salt,
                    Role = role,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                };

                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                _logger.LogInformation("User {Username} registered successfully with role {Role}", username, role);

                return new AuthResult 
                { 
                    Success = true, 
                    Message = "Registration successful",
                    User = new UserDto
                    {
                        Id = user.Id,
                        Username = user.Username,
                        Email = user.Email,
                        Role = user.Role,
                        IsActive = user.IsActive,
                        CreatedDate = user.CreatedDate
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during registration for user {Username}", username);
                return new AuthResult { Success = false, Message = "An error occurred during registration" };
            }
        }

        public async Task<bool> LogoutAsync()
        {
            try
            {
                if (_currentUser != null)
                {
                    _logger.LogInformation("User {Username} logged out", _currentUser.Username);
                }

                _currentUser = null;
                _currentToken = null;
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during logout");
                return false;
            }
        }

        public async Task<bool> ChangePasswordAsync(int userId, string currentPassword, string newPassword)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null || !user.IsActive)
                {
                    return false;
                }

                if (!VerifyPassword(currentPassword, user.PasswordHash, user.Salt))
                {
                    return false;
                }

                var salt = GenerateSalt();
                user.PasswordHash = HashPassword(newPassword, salt);
                user.Salt = salt;
                user.ModifiedDate = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Password changed for user {Username}", user.Username);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing password for user {UserId}", userId);
                return false;
            }
        }

        public async Task<User?> GetCurrentUserAsync()
        {
            return _currentUser;
        }

        public async Task<bool> ValidateTokenAsync(string token)
        {
            return _currentToken == token && _currentUser != null;
        }

        public async Task<List<User>> GetUsersAsync()
        {
            try
            {
                return await _context.Users
                    .Where(u => u.IsActive)
                    .OrderBy(u => u.Username)
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving users");
                return new List<User>();
            }
        }

        public async Task<bool> UpdateUserRoleAsync(int userId, UserRole newRole)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null || !user.IsActive)
                {
                    return false;
                }

                user.Role = newRole;
                user.ModifiedDate = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Role updated for user {Username} to {Role}", user.Username, newRole);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating role for user {UserId}", userId);
                return false;
            }
        }

        public async Task<bool> DeactivateUserAsync(int userId)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return false;
                }

                user.IsActive = false;
                user.ModifiedDate = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("User {Username} deactivated", user.Username);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deactivating user {UserId}", userId);
                return false;
            }
        }

        private string HashPassword(string password, string salt)
        {
            using (var sha256 = SHA256.Create())
            {
                var saltedPassword = password + salt;
                var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(saltedPassword));
                return Convert.ToBase64String(hash);
            }
        }

        private bool VerifyPassword(string password, string hash, string salt)
        {
            var hashedPassword = HashPassword(password, salt);
            return hashedPassword == hash;
        }

        private string GenerateSalt()
        {
            using (var rng = RandomNumberGenerator.Create())
            {
                var saltBytes = new byte[32];
                rng.GetBytes(saltBytes);
                return Convert.ToBase64String(saltBytes);
            }
        }

        private string GenerateSessionToken(User user)
        {
            var tokenData = $"{user.Id}:{user.Username}:{DateTime.UtcNow.Ticks}";
            using (var sha256 = SHA256.Create())
            {
                var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(tokenData));
                return Convert.ToBase64String(hash);
            }
        }
    }

    public class AuthResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public UserDto? User { get; set; }
        public string? Token { get; set; }
    }
}
