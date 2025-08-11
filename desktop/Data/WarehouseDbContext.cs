using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;
using System.Text.Json;
using WarehouseManagement.Desktop.Models.Entities;

namespace WarehouseManagement.Desktop.Data;

public class WarehouseDbContext : DbContext
{
    private readonly IConfiguration _configuration;

    public WarehouseDbContext(DbContextOptions<WarehouseDbContext> options, IConfiguration configuration)
        : base(options)
    {
        _configuration = configuration;
    }

    // Core entities
    public DbSet<Warehouse> Warehouses { get; set; } = null!;
    public DbSet<Zone> Zones { get; set; } = null!;
    public DbSet<Rack> Racks { get; set; } = null!;
    public DbSet<Bin> Bins { get; set; } = null!;
    public DbSet<Product> Products { get; set; } = null!;
    public DbSet<BinLock> BinLocks { get; set; } = null!;

    // Task entities
    public DbSet<PutAwayTask> PutAwayTasks { get; set; } = null!;
    public DbSet<PickTask> PickTasks { get; set; } = null!;
    public DbSet<PickTaskItem> PickTaskItems { get; set; } = null!;
    public DbSet<StockMovement> StockMovements { get; set; } = null!;

    // System entities
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        if (!optionsBuilder.IsConfigured)
        {
            var connectionString = _configuration.GetConnectionString("DefaultConnection");
            optionsBuilder.UseSqlServer(connectionString, options =>
            {
                options.CommandTimeout(300); // 5 minutes
                options.EnableRetryOnFailure(
                    maxRetryCount: 3,
                    maxRetryDelay: TimeSpan.FromSeconds(5),
                    errorNumbersToAdd: null);
            });

            // Performance optimizations
            optionsBuilder.EnableSensitiveDataLogging(false);
            optionsBuilder.EnableServiceProviderCaching(true);
            optionsBuilder.ConfigureWarnings(warnings =>
            {
                warnings.Default(WarningBehavior.Log);
            });
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure JSON serialization for complex types
        ConfigureJsonConversions(modelBuilder);

        // Configure indexes for performance
        ConfigureIndexes(modelBuilder);

        // Configure relationships
        ConfigureRelationships(modelBuilder);

        // Configure constraints
        ConfigureConstraints(modelBuilder);

        // Seed data
        SeedData(modelBuilder);
    }

    private void ConfigureJsonConversions(ModelBuilder modelBuilder)
    {
        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };

        var jsonConverter = new ValueConverter<object, string>(
            v => JsonSerializer.Serialize(v, jsonOptions),
            v => JsonSerializer.Deserialize<object>(v, jsonOptions)!
        );

        // Configure JSON columns
        modelBuilder.Entity<Bin>()
            .Property(e => e.MixedContents)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<PutAwayTask>()
            .Property(e => e.AuditLog)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<PickTask>()
            .Property(e => e.RouteOptimization)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<PickTask>()
            .Property(e => e.AuditLog)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<PickTaskItem>()
            .Property(e => e.PickPlan)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<StockMovement>()
            .Property(e => e.AdditionalData)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<User>()
            .Property(e => e.Permissions)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<AuditLog>()
            .Property(e => e.OldValues)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<AuditLog>()
            .Property(e => e.NewValues)
            .HasConversion(jsonConverter);

        modelBuilder.Entity<AuditLog>()
            .Property(e => e.AdditionalData)
            .HasConversion(jsonConverter);
    }

    private void ConfigureIndexes(ModelBuilder modelBuilder)
    {
        // Warehouse indexes
        modelBuilder.Entity<Warehouse>()
            .HasIndex(e => e.Code)
            .IsUnique();

        modelBuilder.Entity<Warehouse>()
            .HasIndex(e => e.IsActive);

        // Zone indexes
        modelBuilder.Entity<Zone>()
            .HasIndex(e => new { e.WarehouseId, e.Code })
            .IsUnique();

        modelBuilder.Entity<Zone>()
            .HasIndex(e => e.ZoneType);

        // Rack indexes
        modelBuilder.Entity<Rack>()
            .HasIndex(e => new { e.WarehouseId, e.Code })
            .IsUnique();

        modelBuilder.Entity<Rack>()
            .HasIndex(e => e.ZoneId);

        // Bin indexes - Critical for performance
        modelBuilder.Entity<Bin>()
            .HasIndex(e => new { e.WarehouseId, e.Code })
            .IsUnique();

        modelBuilder.Entity<Bin>()
            .HasIndex(e => new { e.WarehouseId, e.Status });

        modelBuilder.Entity<Bin>()
            .HasIndex(e => new { e.WarehouseId, e.Sku });

        modelBuilder.Entity<Bin>()
            .HasIndex(e => new { e.WarehouseId, e.ZoneId, e.Status });

        modelBuilder.Entity<Bin>()
            .HasIndex(e => new { e.WarehouseId, e.RackId, e.Level, e.Position });

        modelBuilder.Entity<Bin>()
            .HasIndex(e => e.CurrentQty);

        modelBuilder.Entity<Bin>()
            .HasIndex(e => e.LastPutAwayAt);

        modelBuilder.Entity<Bin>()
            .HasIndex(e => e.LastPickedAt);

        // Product indexes
        modelBuilder.Entity<Product>()
            .HasIndex(e => e.Sku)
            .IsUnique();

        modelBuilder.Entity<Product>()
            .HasIndex(e => e.Category);

        modelBuilder.Entity<Product>()
            .HasIndex(e => e.IsActive);

        // BinLock indexes
        modelBuilder.Entity<BinLock>()
            .HasIndex(e => new { e.BinId, e.IsActive });

        modelBuilder.Entity<BinLock>()
            .HasIndex(e => e.OperationId);

        modelBuilder.Entity<BinLock>()
            .HasIndex(e => e.ExpiresAt);

        // Task indexes
        modelBuilder.Entity<PutAwayTask>()
            .HasIndex(e => new { e.WarehouseId, e.Status });

        modelBuilder.Entity<PutAwayTask>()
            .HasIndex(e => e.Sku);

        modelBuilder.Entity<PutAwayTask>()
            .HasIndex(e => e.CreatedAt);

        modelBuilder.Entity<PutAwayTask>()
            .HasIndex(e => e.AssignedTo);

        modelBuilder.Entity<PickTask>()
            .HasIndex(e => new { e.WarehouseId, e.Status });

        modelBuilder.Entity<PickTask>()
            .HasIndex(e => e.OrderNumber);

        modelBuilder.Entity<PickTask>()
            .HasIndex(e => e.CreatedAt);

        modelBuilder.Entity<PickTask>()
            .HasIndex(e => e.AssignedTo);

        modelBuilder.Entity<PickTaskItem>()
            .HasIndex(e => e.Sku);

        modelBuilder.Entity<PickTaskItem>()
            .HasIndex(e => e.BinId);

        // StockMovement indexes
        modelBuilder.Entity<StockMovement>()
            .HasIndex(e => new { e.WarehouseId, e.Sku });

        modelBuilder.Entity<StockMovement>()
            .HasIndex(e => e.MovementType);

        modelBuilder.Entity<StockMovement>()
            .HasIndex(e => e.Timestamp);

        modelBuilder.Entity<StockMovement>()
            .HasIndex(e => e.ReferenceNumber);

        // User indexes
        modelBuilder.Entity<User>()
            .HasIndex(e => e.Username)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(e => e.Email)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(e => e.IsActive);

        // AuditLog indexes
        modelBuilder.Entity<AuditLog>()
            .HasIndex(e => e.Timestamp);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(e => e.UserId);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(e => e.Action);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(e => new { e.EntityType, e.EntityId });
    }

    private void ConfigureRelationships(ModelBuilder modelBuilder)
    {
        // Warehouse relationships
        modelBuilder.Entity<Zone>()
            .HasOne(z => z.Warehouse)
            .WithMany(w => w.Zones)
            .HasForeignKey(z => z.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Rack>()
            .HasOne(r => r.Warehouse)
            .WithMany(w => w.Racks)
            .HasForeignKey(r => r.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Rack>()
            .HasOne(r => r.Zone)
            .WithMany(z => z.Racks)
            .HasForeignKey(r => r.ZoneId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Bin>()
            .HasOne(b => b.Warehouse)
            .WithMany(w => w.Bins)
            .HasForeignKey(b => b.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Bin>()
            .HasOne(b => b.Zone)
            .WithMany(z => z.Bins)
            .HasForeignKey(b => b.ZoneId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Bin>()
            .HasOne(b => b.Rack)
            .WithMany(r => r.Bins)
            .HasForeignKey(b => b.RackId)
            .OnDelete(DeleteBehavior.SetNull);

        // Task relationships
        modelBuilder.Entity<PutAwayTask>()
            .HasOne(p => p.Warehouse)
            .WithMany(w => w.PutAwayTasks)
            .HasForeignKey(p => p.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PutAwayTask>()
            .HasOne(p => p.SuggestedBin)
            .WithMany()
            .HasForeignKey(p => p.SuggestedBinId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<PutAwayTask>()
            .HasOne(p => p.ActualBin)
            .WithMany(b => b.PutAwayTasks)
            .HasForeignKey(p => p.ActualBinId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<PickTask>()
            .HasOne(p => p.Warehouse)
            .WithMany(w => w.PickTasks)
            .HasForeignKey(p => p.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PickTaskItem>()
            .HasOne(p => p.PickTask)
            .WithMany(pt => pt.Items)
            .HasForeignKey(p => p.PickTaskId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PickTaskItem>()
            .HasOne(p => p.Bin)
            .WithMany(b => b.PickTaskItems)
            .HasForeignKey(p => p.BinId)
            .OnDelete(DeleteBehavior.SetNull);

        // StockMovement relationships
        modelBuilder.Entity<StockMovement>()
            .HasOne(s => s.Warehouse)
            .WithMany(w => w.StockMovements)
            .HasForeignKey(s => s.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<StockMovement>()
            .HasOne(s => s.FromBin)
            .WithMany()
            .HasForeignKey(s => s.FromBinId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<StockMovement>()
            .HasOne(s => s.ToBin)
            .WithMany(b => b.StockMovements)
            .HasForeignKey(s => s.ToBinId)
            .OnDelete(DeleteBehavior.SetNull);

        // BinLock relationships
        modelBuilder.Entity<BinLock>()
            .HasOne(bl => bl.Bin)
            .WithMany(b => b.BinLocks)
            .HasForeignKey(bl => bl.BinId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    private void ConfigureConstraints(ModelBuilder modelBuilder)
    {
        // Bin constraints
        modelBuilder.Entity<Bin>()
            .HasCheckConstraint("CK_Bin_CurrentQty", "[CurrentQty] >= 0");

        modelBuilder.Entity<Bin>()
            .HasCheckConstraint("CK_Bin_Capacity", "[Capacity] > 0");

        modelBuilder.Entity<Bin>()
            .HasCheckConstraint("CK_Bin_CapacityCheck", "[CurrentQty] <= [Capacity]");

        modelBuilder.Entity<Bin>()
            .HasCheckConstraint("CK_Bin_Position", "[Position] > 0");

        modelBuilder.Entity<Bin>()
            .HasCheckConstraint("CK_Bin_ShelfLevel", "[ShelfLevel] > 0");

        // Task constraints
        modelBuilder.Entity<PutAwayTask>()
            .HasCheckConstraint("CK_PutAwayTask_Quantity", "[Quantity] > 0");

        modelBuilder.Entity<PutAwayTask>()
            .HasCheckConstraint("CK_PutAwayTask_ActualQuantity", "[ActualQuantity] IS NULL OR [ActualQuantity] > 0");

        modelBuilder.Entity<PickTaskItem>()
            .HasCheckConstraint("CK_PickTaskItem_RequestedQuantity", "[RequestedQuantity] > 0");

        modelBuilder.Entity<PickTaskItem>()
            .HasCheckConstraint("CK_PickTaskItem_PickedQuantity", "[PickedQuantity] >= 0");

        modelBuilder.Entity<PickTaskItem>()
            .HasCheckConstraint("CK_PickTaskItem_PickOrder", "[PickOrder] >= 0");

        // StockMovement constraints
        modelBuilder.Entity<StockMovement>()
            .HasCheckConstraint("CK_StockMovement_Quantity", "[Quantity] != 0");

        // BinLock constraints
        modelBuilder.Entity<BinLock>()
            .HasCheckConstraint("CK_BinLock_Expires", "[ExpiresAt] > [LockedAt]");
    }

    private void SeedData(ModelBuilder modelBuilder)
    {
        // Seed default admin user
        var adminId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        modelBuilder.Entity<User>().HasData(new User
        {
            Id = adminId,
            Username = "admin",
            Email = "admin@warehouse.com",
            FirstName = "System",
            LastName = "Administrator",
            PasswordHash = "AQAAAAIAAYagAAAAENGzTKp8N5f5B1yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ5yJ==", // Password: admin123
            Role = "Admin",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });

        // Seed demo warehouse
        var warehouseId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        modelBuilder.Entity<Warehouse>().HasData(new Warehouse
        {
            Id = warehouseId,
            Name = "Main Warehouse",
            Code = "MAIN-01",
            Description = "Primary warehouse facility",
            Address = "123 Industrial Blvd",
            City = "Business City",
            PostalCode = "12345",
            Country = "USA",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            CreatedBy = "admin"
        });

        // Seed demo zones
        var zoneAId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var zoneBId = Guid.Parse("44444444-4444-4444-4444-444444444444");

        modelBuilder.Entity<Zone>().HasData(
            new Zone
            {
                Id = zoneAId,
                WarehouseId = warehouseId,
                Code = "A",
                Name = "Zone A - Fast Pick",
                Description = "High-velocity products zone",
                ZoneType = "FastPick",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            },
            new Zone
            {
                Id = zoneBId,
                WarehouseId = warehouseId,
                Code = "B",
                Name = "Zone B - General Storage",
                Description = "General storage zone",
                ZoneType = "General",
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            }
        );
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Update timestamps
        var entries = ChangeTracker.Entries()
            .Where(e => e.Entity is IHasTimestamps && (e.State == EntityState.Added || e.State == EntityState.Modified));

        foreach (var entry in entries)
        {
            if (entry.Entity is IHasTimestamps entity)
            {
                if (entry.State == EntityState.Added)
                {
                    entity.CreatedAt = DateTime.UtcNow;
                }
                entity.UpdatedAt = DateTime.UtcNow;
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}

// Interface for timestamp tracking
public interface IHasTimestamps
{
    DateTime CreatedAt { get; set; }
    DateTime UpdatedAt { get; set; }
}
