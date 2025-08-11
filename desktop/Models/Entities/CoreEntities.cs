using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace WarehouseManagement.Desktop.Models.Entities;

[Table("Warehouses")]
public class Warehouse
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [StringLength(500)]
    public string? Description { get; set; }
    
    [StringLength(50)]
    public string Code { get; set; } = string.Empty;
    
    [StringLength(200)]
    public string? Address { get; set; }
    
    [StringLength(50)]
    public string? City { get; set; }
    
    [StringLength(10)]
    public string? PostalCode { get; set; }
    
    [StringLength(50)]
    public string? Country { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [StringLength(100)]
    public string? CreatedBy { get; set; }
    
    [StringLength(100)]
    public string? UpdatedBy { get; set; }
    
    // Navigation properties
    public virtual ICollection<Zone> Zones { get; set; } = new List<Zone>();
    public virtual ICollection<Rack> Racks { get; set; } = new List<Rack>();
    public virtual ICollection<Bin> Bins { get; set; } = new List<Bin>();
    public virtual ICollection<PutAwayTask> PutAwayTasks { get; set; } = new List<PutAwayTask>();
    public virtual ICollection<PickTask> PickTasks { get; set; } = new List<PickTask>();
    public virtual ICollection<StockMovement> StockMovements { get; set; } = new List<StockMovement>();
}

[Table("Zones")]
public class Zone
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    [Required]
    [StringLength(50)]
    public string Code { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [StringLength(500)]
    public string? Description { get; set; }
    
    [StringLength(50)]
    public string ZoneType { get; set; } = "General"; // General, FastPick, Quarantine, etc.
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Foreign key
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    // Navigation properties
    public virtual ICollection<Rack> Racks { get; set; } = new List<Rack>();
    public virtual ICollection<Bin> Bins { get; set; } = new List<Bin>();
}

[Table("Racks")]
public class Rack
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    public Guid? ZoneId { get; set; }
    
    [Required]
    [StringLength(50)]
    public string Code { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;
    
    public int MaxLevels { get; set; } = 8; // A-H levels
    
    public int MaxPositions { get; set; } = 10; // 1-10 positions per level
    
    public int ShelfLevel { get; set; } = 1; // Grid level (1, 2, 3, etc.)
    
    [StringLength(500)]
    public string? Description { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Foreign keys
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    [ForeignKey(nameof(ZoneId))]
    public virtual Zone? Zone { get; set; }
    
    // Navigation properties
    public virtual ICollection<Bin> Bins { get; set; } = new List<Bin>();
}

[Table("Bins")]
public class Bin
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    public Guid? ZoneId { get; set; }
    
    public Guid? RackId { get; set; }
    
    [Required]
    [StringLength(50)]
    public string Code { get; set; } = string.Empty; // A-02-3-05 format
    
    [StringLength(10)]
    public string Level { get; set; } = "A"; // A, B, C, D, E, F, G, H
    
    public int Position { get; set; } = 1; // 1-10
    
    public int ShelfLevel { get; set; } = 1; // Grid level
    
    public int Capacity { get; set; } = 100;
    
    public int CurrentQty { get; set; } = 0;
    
    [StringLength(100)]
    public string? Sku { get; set; }
    
    [StringLength(100)]
    public string? LotNumber { get; set; }
    
    public DateTime? ExpiryDate { get; set; }
    
    [StringLength(20)]
    public string Status { get; set; } = "available"; // available, occupied, reserved, blocked
    
    [Column(TypeName = "nvarchar(max)")]
    public string? MixedContents { get; set; } // JSON for mixed SKU storage
    
    public DateTime? LastPutAwayAt { get; set; }
    
    public DateTime? LastPickedAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [StringLength(100)]
    public string? CreatedBy { get; set; }
    
    [StringLength(100)]
    public string? UpdatedBy { get; set; }
    
    // Computed properties
    [NotMapped]
    public int AvailableCapacity => Capacity - CurrentQty;
    
    [NotMapped]
    public double UtilizationPercentage => Capacity > 0 ? (double)CurrentQty / Capacity * 100 : 0;
    
    [NotMapped]
    public bool IsEmpty => CurrentQty == 0;
    
    [NotMapped]
    public bool IsFull => CurrentQty >= Capacity;
    
    [NotMapped]
    public string FullCode => $"{Level}-{ShelfLevel:D2}-{RackId?.ToString()[..2] ?? "00"}-{Position:D2}";
    
    // Foreign keys
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    [ForeignKey(nameof(ZoneId))]
    public virtual Zone? Zone { get; set; }
    
    [ForeignKey(nameof(RackId))]
    public virtual Rack? Rack { get; set; }
    
    // Navigation properties
    public virtual ICollection<PutAwayTask> PutAwayTasks { get; set; } = new List<PutAwayTask>();
    public virtual ICollection<PickTaskItem> PickTaskItems { get; set; } = new List<PickTaskItem>();
    public virtual ICollection<StockMovement> StockMovements { get; set; } = new List<StockMovement>();
    public virtual ICollection<BinLock> BinLocks { get; set; } = new List<BinLock>();
}

[Table("Products")]
public class Product
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [StringLength(100)]
    public string Sku { get; set; } = string.Empty;
    
    [StringLength(200)]
    public string Name { get; set; } = string.Empty;
    
    [StringLength(500)]
    public string? Description { get; set; }
    
    [StringLength(50)]
    public string? Category { get; set; }
    
    [StringLength(20)]
    public string? UnitOfMeasure { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Weight { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Length { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Width { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal Height { get; set; }
    
    public bool RequiresLotTracking { get; set; } = false;
    
    public bool RequiresExpiryTracking { get; set; } = false;
    
    public int ShelfLife { get; set; } = 0; // Days
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual ICollection<PutAwayTask> PutAwayTasks { get; set; } = new List<PutAwayTask>();
    public virtual ICollection<PickTask> PickTasks { get; set; } = new List<PickTask>();
    public virtual ICollection<StockMovement> StockMovements { get; set; } = new List<StockMovement>();
}

[Table("BinLocks")]
public class BinLock
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid BinId { get; set; }
    
    [Required]
    [StringLength(100)]
    public string OperationId { get; set; } = string.Empty;
    
    [StringLength(50)]
    public string OperationType { get; set; } = "Pick"; // Pick, PutAway, Move
    
    [StringLength(100)]
    public string? UserId { get; set; }
    
    public DateTime LockedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddMinutes(10);
    
    public bool IsActive { get; set; } = true;
    
    // Foreign key
    [ForeignKey(nameof(BinId))]
    public virtual Bin Bin { get; set; } = null!;
}
