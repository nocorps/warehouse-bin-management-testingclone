# Warehouse Management Desktop Application (.NET C# with SQL Server)

This is a high-performance warehouse management system built with .NET 8, WPF, Entity Framework Core, and SQL Server. The application provides comprehensive bin management, inventory tracking, pick/put-away operations, and reporting capabilities.

## Architecture Overview

### Technology Stack
- **.NET 8** - Latest .NET framework for high performance
- **WPF (Windows Presentation Foundation)** - Modern desktop UI framework
- **Entity Framework Core 8** - ORM for database operations
- **SQL Server** - Enterprise-grade database
- **Material Design** - Modern, beautiful UI components
- **Serilog** - Structured logging
- **AutoMapper** - Object-to-object mapping
- **CommunityToolkit.Mvvm** - MVVM framework

### Key Features
- **Real-time Inventory Management** - Track products across multiple warehouses
- **Advanced Bin Management** - Organize inventory in racks, zones, and bins
- **Pick & Put-Away Operations** - Optimize warehouse workflows
- **Barcode Integration** - Generate and scan barcodes for products, bins, and tasks
- **Excel Import/Export** - Bulk operations and reporting
- **Comprehensive Reporting** - Analytics and performance metrics
- **High-Performance Design** - Optimized for large datasets and concurrent operations
- **User Authentication** - Secure login and role-based access

## Project Structure

```
desktop/
├── Data/
│   └── WarehouseDbContext.cs          # Entity Framework DbContext
├── Models/
│   ├── Entities/                      # Database entities
│   │   ├── CoreEntities.cs           # Core entities (Warehouse, Rack, Bin, Product)
│   │   └── TaskEntities.cs           # Task and movement entities
│   └── DTOs/                         # Data Transfer Objects
│       └── WarehouseDTOs.cs          # API contracts and view models
├── Services/                         # Business logic layer
│   ├── AuthenticationService.cs      # User authentication
│   ├── WarehouseOperationsService.cs # Core warehouse operations
│   ├── BulkOperationsService.cs      # High-performance bulk operations
│   ├── ExcelService.cs              # Excel import/export
│   ├── ReportService.cs             # Report generation
│   ├── BarcodeService.cs            # Barcode generation/scanning
│   └── PrintService.cs              # Label and report printing
├── ViewModels/                      # MVVM ViewModels
│   ├── MainWindowViewModel.cs       # Main application window
│   ├── BinManagementViewModel.cs    # Bin management functionality
│   └── LoginViewModel.cs            # User authentication
├── Views/                          # WPF Views
│   ├── MainWindow.xaml             # Main application window
│   ├── LoginWindow.xaml            # Login form
│   ├── DashboardView.xaml          # Dashboard and KPIs
│   └── BinManagementView.xaml      # Bin management interface
├── App.xaml.cs                     # Application startup and DI configuration
└── appsettings.json               # Configuration settings
```

## Database Schema

The application uses the following core entities:

### Core Entities
- **Warehouse** - Physical warehouse locations
- **Zone** - Logical areas within warehouses
- **Rack** - Storage rack structures
- **Bin** - Individual storage locations
- **Product** - Items being managed
- **BinContent** - Current inventory in bins
- **User** - Application users with roles

### Task Entities
- **WarehouseTask** - Pick/put-away tasks
- **StockMovement** - Inventory movement history
- **BinLock** - Concurrency control for bins
- **AuditLog** - System activity tracking

## Getting Started

### Prerequisites
- **Visual Studio 2022** or **Visual Studio Code** with C# extension
- **.NET 8 SDK** or later
- **SQL Server** (LocalDB, Express, or full version)
- **Windows 10/11** (for WPF applications)

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd warehouse-bin-management-testingclone/desktop
   ```

2. **Update Database Connection**
   Edit `appsettings.json` and update the connection string:
   ```json
   {
     "ConnectionStrings": {
       "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=WarehouseManagement;Trusted_Connection=true;MultipleActiveResultSets=true"
     }
   }
   ```

3. **Install Dependencies**
   ```bash
   dotnet restore
   ```

4. **Create Database**
   ```bash
   dotnet ef database update
   ```

5. **Build the Application**
   ```bash
   dotnet build
   ```

6. **Run the Application**
   ```bash
   dotnet run
   ```

### First Time Setup

1. **Create Initial User**
   The application includes seed data that creates a default admin user:
   - Username: `admin`
   - Password: `admin123`

2. **Create Sample Data**
   Use the Excel import feature to bulk-create:
   - Warehouses and zones
   - Racks and bins
   - Products and initial inventory

## Key Features Guide

### Authentication
- Secure login with password hashing
- Role-based access control
- Session management

### Bin Management
- Create, update, and delete bins
- Bulk bin creation and import from Excel
- Real-time status tracking (Available, Occupied, Reserved, Blocked)
- Weight and volume capacity management

### Inventory Operations
- Product management with categories and attributes
- Bin allocation strategies (FIFO, LIFO, Best Fit)
- Stock movement tracking
- Expiry date management

### Barcode Integration
- Generate barcodes for bins, products, and tasks
- Scan barcodes for quick operations
- Print labels for physical identification

### Reporting & Analytics
- Inventory reports with current stock levels
- Movement history and analytics
- Performance metrics for users and operations
- Bin utilization analysis
- Alert management for low stock and expiring items

### Excel Integration
- Import products, racks, and bins from Excel templates
- Export inventory and movement data
- Bulk operations for large datasets

### High-Performance Features
- Entity Framework change tracking optimization
- Memory caching for frequently accessed data
- Bulk operations using SQL bulk insert
- Virtualized UI controls for large datasets
- Background services for maintenance tasks

## Configuration

### Application Settings
```json
{
  "Application": {
    "Name": "Warehouse Management Pro",
    "Version": "2.0.1",
    "DefaultWarehouseId": 1,
    "AutoLogoutMinutes": 60
  },
  "Performance": {
    "EnableCaching": true,
    "CacheExpirationMinutes": 30,
    "BulkOperationBatchSize": 1000,
    "MaxConcurrentOperations": 10
  },
  "Warehouse": {
    "DefaultBinCapacityWeight": 1000,
    "DefaultBinCapacityVolume": 1000,
    "AllowOverbooking": false,
    "EnableBinLocking": true
  }
}
```

### Performance Tuning
- Adjust `BulkOperationBatchSize` for optimal bulk import performance
- Configure `MaxConcurrentOperations` based on system capabilities
- Enable/disable caching based on memory constraints
- Tune database connection pool settings

## Development Guide

### Adding New Features
1. Create entities in `Models/Entities/`
2. Add DTOs in `Models/DTOs/`
3. Implement business logic in `Services/`
4. Create ViewModels in `ViewModels/`
5. Design UI in `Views/`
6. Register services in `App.xaml.cs`

### Database Migrations
```bash
# Add new migration
dotnet ef migrations add <MigrationName>

# Update database
dotnet ef database update

# Remove last migration (if not applied)
dotnet ef migrations remove
```

### Testing
- Unit tests for business logic services
- Integration tests for database operations
- UI tests for critical workflows

## Production Deployment

### Database Setup
1. Create production SQL Server database
2. Update connection string in production config
3. Run database migrations
4. Create initial admin user

### Application Deployment
1. Publish the application:
   ```bash
   dotnet publish -c Release -r win-x64 --self-contained true
   ```
2. Copy published files to target machine
3. Configure production settings
4. Install as Windows service (optional)

### Security Considerations
- Use strong database passwords
- Enable SSL for database connections
- Configure firewall rules
- Regular security updates
- Audit log monitoring

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify SQL Server is running
   - Check connection string format
   - Ensure database exists

2. **Performance Issues**
   - Monitor memory usage
   - Check database query performance
   - Optimize bulk operations batch size

3. **UI Responsiveness**
   - Use async operations for long-running tasks
   - Implement progress indicators
   - Optimize data binding

### Logging
- Application logs are stored in `Logs/` directory
- Use Serilog configuration for log levels
- Monitor performance metrics in logs

## Support

For technical support or feature requests:
- Check application logs for detailed error information
- Review database performance metrics
- Use built-in diagnostic tools

## License

This application is proprietary software. All rights reserved.

---

**Version:** 2.0.1  
**Last Updated:** August 2025  
**Platform:** Windows .NET 8
