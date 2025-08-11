using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace WarehouseManagement.Desktop.Models.Entities;

[Table("PutAwayTasks")]
public class PutAwayTask
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    [StringLength(100)]
    public string TaskNumber { get; set; } = string.Empty;
    
    [Required]
    [StringLength(100)]
    public string Sku { get; set; } = string.Empty;
    
    public int Quantity { get; set; }
    
    [StringLength(100)]
    public string? LotNumber { get; set; }
    
    public DateTime? ExpiryDate { get; set; }
    
    public Guid? SuggestedBinId { get; set; }
    
    public Guid? ActualBinId { get; set; }
    
    public int? ActualQuantity { get; set; }
    
    [StringLength(20)]
    public string Status { get; set; } = "pending"; // pending, assigned, completed, cancelled
    
    [StringLength(50)]
    public string Priority { get; set; } = "normal"; // low, normal, high, urgent
    
    [StringLength(100)]
    public string? AssignedTo { get; set; }
    
    public DateTime? AssignedAt { get; set; }
    
    public DateTime? CompletedAt { get; set; }
    
    [StringLength(500)]
    public string? Notes { get; set; }
    
    [Column(TypeName = "nvarchar(max)")]
    public string? AuditLog { get; set; } // JSON audit trail
    
    [StringLength(50)]
    public string? AllocationType { get; set; } // NEW_PLACEMENT, SAME_SKU_CONSOLIDATION, MIXED_SKU_STORAGE
    
    [StringLength(500)]
    public string? AllocationReason { get; set; }
    
    public double? UtilizationAfter { get; set; }
    
    public bool IsOptimalPlacement { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [StringLength(100)]
    public string? CreatedBy { get; set; }
    
    [StringLength(100)]
    public string? UpdatedBy { get; set; }
    
    // Computed properties
    [NotMapped]
    public TimeSpan? ProcessingTime => CompletedAt.HasValue && AssignedAt.HasValue 
        ? CompletedAt.Value - AssignedAt.Value 
        : null;
    
    [NotMapped]
    public bool IsOverdue => Status != "completed" && CreatedAt.AddHours(24) < DateTime.UtcNow;
    
    // Foreign keys
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    [ForeignKey(nameof(SuggestedBinId))]
    public virtual Bin? SuggestedBin { get; set; }
    
    [ForeignKey(nameof(ActualBinId))]
    public virtual Bin? ActualBin { get; set; }
}

[Table("PickTasks")]
public class PickTask
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    [StringLength(100)]
    public string TaskNumber { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string? OrderNumber { get; set; }
    
    [StringLength(100)]
    public string? CustomerCode { get; set; }
    
    [StringLength(20)]
    public string Status { get; set; } = "pending"; // pending, assigned, in_progress, completed, cancelled
    
    [StringLength(50)]
    public string Priority { get; set; } = "normal"; // low, normal, high, urgent
    
    [StringLength(100)]
    public string? AssignedTo { get; set; }
    
    public DateTime? AssignedAt { get; set; }
    
    public DateTime? StartedAt { get; set; }
    
    public DateTime? CompletedAt { get; set; }
    
    [StringLength(500)]
    public string? Notes { get; set; }
    
    [Column(TypeName = "nvarchar(max)")]
    public string? RouteOptimization { get; set; } // JSON route data
    
    [Column(TypeName = "nvarchar(max)")]
    public string? AuditLog { get; set; } // JSON audit trail
    
    public int TotalItems { get; set; } = 0;
    
    public int TotalQuantity { get; set; } = 0;
    
    public int CompletedItems { get; set; } = 0;
    
    public int CompletedQuantity { get; set; } = 0;
    
    public bool IsFifoCompliant { get; set; } = true;
    
    public int BinsEmptied { get; set; } = 0;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [StringLength(100)]
    public string? CreatedBy { get; set; }
    
    [StringLength(100)]
    public string? UpdatedBy { get; set; }
    
    // Computed properties
    [NotMapped]
    public double CompletionPercentage => TotalItems > 0 ? (double)CompletedItems / TotalItems * 100 : 0;
    
    [NotMapped]
    public TimeSpan? ProcessingTime => CompletedAt.HasValue && StartedAt.HasValue 
        ? CompletedAt.Value - StartedAt.Value 
        : null;
    
    [NotMapped]
    public bool IsOverdue => Status != "completed" && CreatedAt.AddHours(4) < DateTime.UtcNow;
    
    // Foreign keys
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    // Navigation properties
    public virtual ICollection<PickTaskItem> Items { get; set; } = new List<PickTaskItem>();
}

[Table("PickTaskItems")]
public class PickTaskItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid PickTaskId { get; set; }
    
    [Required]
    [StringLength(100)]
    public string Sku { get; set; } = string.Empty;
    
    public int RequestedQuantity { get; set; }
    
    public int PickedQuantity { get; set; } = 0;
    
    [StringLength(100)]
    public string? LotNumber { get; set; }
    
    public DateTime? ExpiryDate { get; set; }
    
    public Guid? BinId { get; set; }
    
    [StringLength(20)]
    public string Status { get; set; } = "pending"; // pending, completed, partial, cancelled
    
    [Column(TypeName = "nvarchar(max)")]
    public string? PickPlan { get; set; } // JSON pick plan with FIFO details
    
    public bool IsFifoCompliant { get; set; } = true;
    
    [StringLength(500)]
    public string? FifoReason { get; set; }
    
    public bool BinEmptied { get; set; } = false;
    
    public int PickOrder { get; set; } = 0;
    
    public DateTime? PickedAt { get; set; }
    
    [StringLength(500)]
    public string? Notes { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Computed properties
    [NotMapped]
    public int ShortfallQuantity => Math.Max(0, RequestedQuantity - PickedQuantity);
    
    [NotMapped]
    public bool IsFullyPicked => PickedQuantity >= RequestedQuantity;
    
    [NotMapped]
    public bool IsPartialPick => PickedQuantity > 0 && PickedQuantity < RequestedQuantity;
    
    // Foreign keys
    [ForeignKey(nameof(PickTaskId))]
    public virtual PickTask PickTask { get; set; } = null!;
    
    [ForeignKey(nameof(BinId))]
    public virtual Bin? Bin { get; set; }
}

[Table("StockMovements")]
public class StockMovement
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid WarehouseId { get; set; }
    
    [Required]
    [StringLength(100)]
    public string Sku { get; set; } = string.Empty;
    
    [StringLength(50)]
    public string MovementType { get; set; } = string.Empty; // PUTAWAY, PICK, ADJUSTMENT, MOVE
    
    [StringLength(100)]
    public string? ReferenceNumber { get; set; } // Task ID, Order number, etc.
    
    public Guid? FromBinId { get; set; }
    
    public Guid? ToBinId { get; set; }
    
    public int Quantity { get; set; }
    
    [StringLength(100)]
    public string? LotNumber { get; set; }
    
    public DateTime? ExpiryDate { get; set; }
    
    [StringLength(500)]
    public string? Reason { get; set; }
    
    [StringLength(100)]
    public string? UserId { get; set; }
    
    [Column(TypeName = "nvarchar(max)")]
    public string? AdditionalData { get; set; } // JSON for extra details
    
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    // Foreign keys
    [ForeignKey(nameof(WarehouseId))]
    public virtual Warehouse Warehouse { get; set; } = null!;
    
    [ForeignKey(nameof(FromBinId))]
    public virtual Bin? FromBin { get; set; }
    
    [ForeignKey(nameof(ToBinId))]
    public virtual Bin? ToBin { get; set; }
}

[Table("Users")]
public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [StringLength(100)]
    public string Username { get; set; } = string.Empty;
    
    [Required]
    [StringLength(200)]
    public string Email { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string FirstName { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string LastName { get; set; } = string.Empty;
    
    [Required]
    [StringLength(500)]
    public string PasswordHash { get; set; } = string.Empty;
    
    [StringLength(500)]
    public string? PasswordSalt { get; set; }
    
    [StringLength(50)]
    public string Role { get; set; } = "Operator"; // Admin, Manager, Operator, Viewer
    
    public bool IsActive { get; set; } = true;
    
    public DateTime? LastLoginAt { get; set; }
    
    public int FailedLoginAttempts { get; set; } = 0;
    
    public DateTime? LockedUntil { get; set; }
    
    [Column(TypeName = "nvarchar(max)")]
    public string? Permissions { get; set; } // JSON permissions
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Computed properties
    [NotMapped]
    public string FullName => $"{FirstName} {LastName}".Trim();
    
    [NotMapped]
    public bool IsLocked => LockedUntil.HasValue && LockedUntil.Value > DateTime.UtcNow;
}

[Table("AuditLogs")]
public class AuditLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [StringLength(100)]
    public string? UserId { get; set; }
    
    [StringLength(100)]
    public string? Username { get; set; }
    
    [Required]
    [StringLength(100)]
    public string Action { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string EntityType { get; set; } = string.Empty;
    
    [StringLength(100)]
    public string? EntityId { get; set; }
    
    [Column(TypeName = "nvarchar(max)")]
    public string? OldValues { get; set; } // JSON
    
    [Column(TypeName = "nvarchar(max)")]
    public string? NewValues { get; set; } // JSON
    
    [StringLength(200)]
    public string? IpAddress { get; set; }
    
    [StringLength(500)]
    public string? UserAgent { get; set; }
    
    [StringLength(500)]
    public string? Notes { get; set; }
    
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    [Column(TypeName = "nvarchar(max)")]
    public string? AdditionalData { get; set; } // JSON for extra context
}
