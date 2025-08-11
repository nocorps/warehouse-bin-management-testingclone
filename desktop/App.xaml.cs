using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Serilog;
using System.Windows;
using WarehouseManagement.Desktop.Data;
using WarehouseManagement.Desktop.Services;
using WarehouseManagement.Desktop.ViewModels;
using WarehouseManagement.Desktop.Views;

namespace WarehouseManagement.Desktop;

/// <summary>
/// High-Performance Warehouse Management Desktop Application
/// Built for handling high-load operations with SQL Server backend
/// </summary>
public partial class App : Application
{
    private IHost? _host;
    private IServiceProvider? _serviceProvider;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            // Configure Serilog early
            ConfigureSerilog();

            // Build the host
            _host = CreateHostBuilder(e.Args).Build();
            _serviceProvider = _host.Services;

            // Initialize database
            await InitializeDatabaseAsync();

            // Start the host
            await _host.StartAsync();

            // Show login window first
            var loginWindow = _serviceProvider.GetRequiredService<LoginWindow>();
            if (loginWindow.ShowDialog() == true)
            {
                // Login successful, show main window
                var mainWindow = _serviceProvider.GetRequiredService<MainWindow>();
                mainWindow.Show();
                
                Log.Information("Warehouse Management Desktop Application started successfully");
            }
            else
            {
                // Login cancelled or failed
                Log.Information("Application startup cancelled by user");
                Current.Shutdown();
                return;
            }
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Application failed to start");
            MessageBox.Show($"Application failed to start: {ex.Message}", "Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
            Current.Shutdown(1);
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        try
        {
            if (_host != null)
            {
                await _host.StopAsync(TimeSpan.FromSeconds(10));
                _host.Dispose();
            }

            Log.Information("Application shutdown completed");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Error during application shutdown");
        }
        finally
        {
            Log.CloseAndFlush();
            base.OnExit(e);
        }
    }

    private static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .UseSerilog()
            .ConfigureAppConfiguration((context, config) =>
            {
                config.SetBasePath(AppDomain.CurrentDomain.BaseDirectory);
                config.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
                config.AddJsonFile($"appsettings.{context.HostingEnvironment.EnvironmentName}.json", optional: true, reloadOnChange: true);
                config.AddEnvironmentVariables();
                config.AddCommandLine(args);
            })
            .ConfigureServices((context, services) =>
            {
                ConfigureServices(services, context.Configuration);
            });

    private static void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        // Configure Entity Framework with SQL Server
        services.AddDbContext<WarehouseDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection");
            options.UseSqlServer(connectionString, sqlOptions =>
            {
                sqlOptions.CommandTimeout(300); // 5 minutes for large operations
                sqlOptions.EnableRetryOnFailure(
                    maxRetryCount: 3,
                    maxRetryDelay: TimeSpan.FromSeconds(5),
                    errorNumbersToAdd: null);
            });

            // Performance optimizations
            options.EnableSensitiveDataLogging(false);
            options.EnableServiceProviderCaching(true);
            options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking); // Default to no tracking for better performance
        });

        // Configure memory cache for high-performance operations
        services.AddMemoryCache(options =>
        {
            options.SizeLimit = 1000; // Limit number of cached items
            options.CompactionPercentage = 0.2; // Remove 20% of items when limit is reached
        });

        // Register application services
        services.AddScoped<IWarehouseOperationsService, WarehouseOperationsService>();
        services.AddScoped<IBulkOperationsService, BulkOperationsService>();
        services.AddScoped<IAuthenticationService, AuthenticationService>();
        services.AddScoped<IExcelService, ExcelService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IBarcodeService, BarcodeService>();
        services.AddScoped<IPrintService, PrintService>();

        // Register ViewModels
        services.AddTransient<MainWindowViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<BinManagementViewModel>();
        services.AddTransient<PutAwayOperationsViewModel>();
        services.AddTransient<PickOperationsViewModel>();
        services.AddTransient<RackConfigurationViewModel>();
        services.AddTransient<SettingsViewModel>();
        services.AddTransient<LoginViewModel>();

        // Register Views
        services.AddTransient<MainWindow>();
        services.AddTransient<LoginWindow>();
        services.AddTransient<BinManagementView>();

        // Configure AutoMapper for DTO mapping
        services.AddAutoMapper(typeof(App));

        // Configure background services for performance
        services.AddHostedService<DatabaseCleanupService>();
        services.AddHostedService<PerformanceMonitoringService>();
        services.AddHostedService<CacheWarmupService>();

        // Configure application settings
        services.Configure<ApplicationSettings>(configuration.GetSection("Application"));
        services.Configure<PerformanceSettings>(configuration.GetSection("Performance"));
        services.Configure<WarehouseSettings>(configuration.GetSection("Warehouse"));
        services.Configure<SecuritySettings>(configuration.GetSection("Security"));

        // Configure HTTP client for external integrations
        services.AddHttpClient();

        // Configure concurrent operation limits
        services.Configure<ThreadPoolSettings>(settings =>
        {
            var performanceConfig = configuration.GetSection("Performance");
            ThreadPool.SetMinThreads(
                performanceConfig.GetValue<int>("MinWorkerThreads", 50),
                performanceConfig.GetValue<int>("MinCompletionPortThreads", 50)
            );
            ThreadPool.SetMaxThreads(
                performanceConfig.GetValue<int>("MaxWorkerThreads", 1000),
                performanceConfig.GetValue<int>("MaxCompletionPortThreads", 1000)
            );
        });

        // Configure task scheduler for bulk operations
        services.AddSingleton<TaskScheduler>(provider =>
        {
            var maxConcurrency = configuration.GetValue<int>("Performance:MaxConcurrentOperations", 100);
            return new LimitedConcurrencyLevelTaskScheduler(maxConcurrency);
        });
    }

    private static void ConfigureSerilog()
    {
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
            .MinimumLevel.Override("System", Serilog.Events.LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .Enrich.WithMachineName()
            .Enrich.WithEnvironmentUserName()
            .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
            .WriteTo.File("Logs/warehouse-management-.log",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 30,
                fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
            .CreateLogger();
    }

    private async Task InitializeDatabaseAsync()
    {
        try
        {
            using var scope = _serviceProvider!.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<WarehouseDbContext>();
            
            Log.Information("Initializing database...");
            
            // Ensure database is created and up to date
            await context.Database.MigrateAsync();
            
            // Warm up the database connection
            await context.Database.CanConnectAsync();
            
            Log.Information("Database initialized successfully");
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Failed to initialize database");
            throw;
        }
    }
}

// Configuration classes
public class ApplicationSettings
{
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string Environment { get; set; } = string.Empty;
    public int MaxConcurrentOperations { get; set; } = 1000;
    public int BatchSize { get; set; } = 500;
    public TimeSpan CacheExpiration { get; set; } = TimeSpan.FromMinutes(15);
    public bool EnableRealTimeUpdates { get; set; } = true;
    public bool EnablePerformanceCounters { get; set; } = true;
}

public class PerformanceSettings
{
    public bool EnableVirtualization { get; set; } = true;
    public int MaxItemsInMemory { get; set; } = 50000;
    public int BatchProcessingSize { get; set; } = 1000;
    public int DatabaseCommandTimeout { get; set; } = 300;
    public int ConcurrentConnectionLimit { get; set; } = 100;
    public bool EnableDataCompression { get; set; } = true;
    public bool EnableLazyLoading { get; set; } = false;
    public bool UseAsyncOperations { get; set; } = true;
    public int MinWorkerThreads { get; set; } = 50;
    public int MinCompletionPortThreads { get; set; } = 50;
    public int MaxWorkerThreads { get; set; } = 1000;
    public int MaxCompletionPortThreads { get; set; } = 1000;
}

public class WarehouseSettings
{
    public int DefaultCapacity { get; set; } = 100;
    public int MaxBinsPerRack { get; set; } = 50;
    public int MaxRacksPerZone { get; set; } = 20;
    public bool EnableMixedSKUStorage { get; set; } = true;
    public bool EnableFIFOLogic { get; set; } = true;
    public TimeSpan AutoBackupInterval { get; set; } = TimeSpan.FromHours(1);
    public bool EnableAuditLogging { get; set; } = true;
}

public class SecuritySettings
{
    public bool EnableEncryption { get; set; } = true;
    public TimeSpan SessionTimeout { get; set; } = TimeSpan.FromHours(8);
    public int MaxLoginAttempts { get; set; } = 5;
    public int PasswordMinLength { get; set; } = 8;
    public bool RequireComplexPassword { get; set; } = true;
}

public class ThreadPoolSettings
{
    public int MinWorkerThreads { get; set; } = 50;
    public int MinCompletionPortThreads { get; set; } = 50;
    public int MaxWorkerThreads { get; set; } = 1000;
    public int MaxCompletionPortThreads { get; set; } = 1000;
}

// Custom task scheduler for controlling concurrency
public class LimitedConcurrencyLevelTaskScheduler : TaskScheduler
{
    private readonly int _maxDegreeOfParallelism;
    private readonly LinkedList<Task> _tasks = new();
    private int _delegatesQueuedOrRunning = 0;

    public LimitedConcurrencyLevelTaskScheduler(int maxDegreeOfParallelism)
    {
        if (maxDegreeOfParallelism < 1) throw new ArgumentOutOfRangeException(nameof(maxDegreeOfParallelism));
        _maxDegreeOfParallelism = maxDegreeOfParallelism;
    }

    protected sealed override void QueueTask(Task task)
    {
        lock (_tasks)
        {
            _tasks.AddLast(task);
            if (_delegatesQueuedOrRunning < _maxDegreeOfParallelism)
            {
                ++_delegatesQueuedOrRunning;
                NotifyThreadPoolOfPendingWork();
            }
        }
    }

    private void NotifyThreadPoolOfPendingWork()
    {
        ThreadPool.UnsafeQueueUserWorkItem(_ =>
        {
            try
            {
                while (true)
                {
                    Task item;
                    lock (_tasks)
                    {
                        if (_tasks.Count == 0)
                        {
                            --_delegatesQueuedOrRunning;
                            break;
                        }

                        item = _tasks.First!.Value;
                        _tasks.RemoveFirst();
                    }

                    TryExecuteTask(item);
                }
            }
            finally
            {
                // Implementation continues...
            }
        }, null);
    }

    protected sealed override bool TryExecuteTaskInline(Task task, bool taskWasPreviouslyQueued)
    {
        if (!taskWasPreviouslyQueued)
        {
            return TryExecuteTask(task);
        }

        if (TryDequeue(task))
        {
            return TryExecuteTask(task);
        }

        return false;
    }

    protected sealed override bool TryDequeue(Task task)
    {
        lock (_tasks)
        {
            return _tasks.Remove(task);
        }
    }

    public sealed override int MaximumConcurrencyLevel => _maxDegreeOfParallelism;

    protected sealed override IEnumerable<Task> GetScheduledTasks()
    {
        bool lockTaken = false;
        try
        {
            Monitor.TryEnter(_tasks, ref lockTaken);
            if (lockTaken) return _tasks;
            else throw new NotSupportedException();
        }
        finally
        {
            if (lockTaken) Monitor.Exit(_tasks);
        }
    }
}
