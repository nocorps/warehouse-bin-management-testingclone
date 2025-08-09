import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  Tabs,
  Tab,
  Card,
  CardContent,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  ButtonGroup,
  Divider,
  Grid,
  LinearProgress
} from '@mui/material';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Assessment as ReportIcon,
  GetApp as ExportIcon,
  Print as PrintIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  DateRange as DateRangeIcon,
  Inventory as InventoryIcon,
  TrendingUp as MovementIcon,
  Storage as StorageIcon,
  Warning as WarningIcon,
  Upload as UploadIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { backupService } from '../services/backupService';
import { reportService } from '../services/reportService';
import { printService } from '../services/printService';
import { warehouseService } from '../services/warehouseService';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function Settings() {
  const { currentWarehouse } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  
  const [tabValue, setTabValue] = useState(0);
  
  // Backup & Restore State
  const [backups, setBackups] = useState([]);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  
  // Report Generation State
  const [reportType, setReportType] = useState('stock_movements');
  const [reportFormat, setReportFormat] = useState('excel');
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // 30 days ago
  const [endDate, setEndDate] = useState(new Date());
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportScope, setReportScope] = useState('date_range'); // 'date_range', 'full', 'current', 'selected'
  const [selectedSkus, setSelectedSkus] = useState(''); // For selected items reporting

  // Delete Warehouse State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [backupBeforeDelete, setBackupBeforeDelete] = useState(false);
  const [deleteBackupInProgress, setDeleteBackupInProgress] = useState(false);

  // Upload Backup State
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  // Delete progress tracking
  const [deleteProgressStep, setDeleteProgressStep] = useState('');

  useEffect(() => {
    loadBackups();
    initializeAutoBackup();
  }, [currentWarehouse]);

  const loadBackups = async () => {
    if (!currentWarehouse?.id) return;
    
    try {
      const backupList = await backupService.getBackups(currentWarehouse.id);
      setBackups(backupList);
    } catch (error) {
      console.error('Error loading backups:', error);
    }
  };

  const initializeAutoBackup = async () => {
    if (!currentWarehouse?.id) return;
    
    try {
      const isEnabled = await backupService.isAutoBackupEnabled(currentWarehouse.id);
      setAutoBackupEnabled(isEnabled);
      
      if (isEnabled) {
        await backupService.scheduleAutoBackup(currentWarehouse.id);
      }
    } catch (error) {
      console.error('Error initializing auto backup:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleCreateBackup = async () => {
    if (!currentWarehouse?.id) {
      showError('No warehouse selected');
      return;
    }

    setBackupInProgress(true);
    try {
      const backup = await backupService.createBackup(currentWarehouse.id, {
        name: `Manual Backup - ${new Date().toLocaleString()}`,
        type: 'manual'
      });
      
      setBackups(prev => [backup, ...prev]);
      showSuccess('Backup created successfully');
      setBackupDialogOpen(false);
    } catch (error) {
      showError(`Backup failed: ${error.message}`);
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup || !currentWarehouse?.id) return;

    setRestoreInProgress(true);
    try {
      await backupService.restoreBackup(currentWarehouse.id, selectedBackup.id);
      showSuccess('Backup restored successfully');
      setRestoreDialogOpen(false);
      setSelectedBackup(null);
    } catch (error) {
      showError(`Restore failed: ${error.message}`);
    } finally {
      setRestoreInProgress(false);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    try {
      await backupService.deleteBackup(currentWarehouse.id, backupId);
      setBackups(prev => prev.filter(b => b.id !== backupId));
      showSuccess('Backup deleted successfully');
    } catch (error) {
      showError(`Delete failed: ${error.message}`);
    }
  };

  const handleToggleAutoBackup = async (enabled) => {
    try {
      await backupService.setAutoBackupEnabled(currentWarehouse.id, enabled);
      setAutoBackupEnabled(enabled);
      
      if (enabled) {
        await backupService.scheduleAutoBackup(currentWarehouse.id);
        showSuccess('Auto backup enabled and scheduled');
      } else {
        await backupService.cancelAutoBackup(currentWarehouse.id);
        showSuccess('Auto backup disabled');
      }
    } catch (error) {
      showError(`Failed to ${enabled ? 'enable' : 'disable'} auto backup: ${error.message}`);
    }
  };

  const handleGenerateReport = async () => {
    if (!currentWarehouse?.id) {
      showError('No warehouse selected');
      return;
    }

    setReportGenerating(true);
    try {
      const reportConfig = {
        type: reportType,
        format: reportFormat,
        warehouseId: currentWarehouse.id, // Always use current warehouse
        scope: reportScope,
        startDate: reportScope === 'date_range' ? startDate : null,
        endDate: reportScope === 'date_range' ? endDate : null,
        selectedSkus: reportScope === 'selected' ? selectedSkus.split(',').map(sku => sku.trim()).filter(sku => sku) : null
      };

      const report = await reportService.generateReport(reportConfig);
      
      switch (reportFormat) {
        case 'excel':
          await reportService.downloadExcelReport(report);
          showSuccess('📊 Excel report generated and downloaded successfully');
          break;
        case 'pdf':
          await reportService.downloadPdfReport(report);
          showSuccess('📄 PDF report generated and downloaded successfully');
          break;
        case 'print':
          await printService.printSimpleStockMovementReport(report);
          showSuccess('🖨️ Report sent to printer successfully');
          break;
        default:
          showError('Unknown report format');
      }
    } catch (error) {
      showError(`Report generation failed: ${error.message}`);
      console.error('Report generation error:', error);
    } finally {
      setReportGenerating(false);
    }
  };

  const handleDeleteWarehouse = async () => {
    if (!currentWarehouse || confirmationText !== currentWarehouse.name) {
      showError('Please confirm the warehouse name to proceed');
      return;
    }

    try {
      setDeleteInProgress(true);

      // Create backup first if requested
      if (backupBeforeDelete) {
        setDeleteBackupInProgress(true);
        try {
          setDeleteProgressStep('Creating backup...');
          showSuccess('Creating backup before deletion...');
          
          const backup = await backupService.createBackup(currentWarehouse.id, {
            type: 'manual',
            description: `Pre-deletion backup of ${currentWarehouse.name}`,
            includeData: true,
            includeConfiguration: true,
            includeHistory: true,
            name: `Pre-deletion-backup-${currentWarehouse.name}-${new Date().toISOString().slice(0, 10)}`
          });
          
          console.log('Backup created successfully:', backup);
          
          // Download the backup immediately
          setDeleteProgressStep('Downloading backup...');
          showSuccess('Backup created successfully. Starting download...');
          await backupService.downloadBackup(currentWarehouse.id, backup.id);
          
          // Give a moment for the download to start
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          showSuccess('✅ Backup created and downloaded successfully! Check your downloads folder.');
          
          // Additional confirmation before proceeding
          const proceedWithDeletion = window.confirm(
            `Backup has been downloaded to your computer.\n\nAre you absolutely sure you want to proceed with deleting "${currentWarehouse.name}"?\n\nThis action cannot be undone!`
          );
          
          if (!proceedWithDeletion) {
            showSuccess('Deletion cancelled. Your backup has been saved.');
            setDeleteDialogOpen(false);
            setConfirmationText('');
            setBackupBeforeDelete(false);
            setDeleteProgressStep('');
            return;
          }
          
        } catch (backupError) {
          console.error('Error creating/downloading backup:', backupError);
          showError(`Failed to create backup: ${backupError.message}. Deletion cancelled for safety.`);
          setDeleteProgressStep('');
          return;
        } finally {
          setDeleteBackupInProgress(false);
        }
      }

      // Delete the warehouse
      setDeleteProgressStep('Deleting warehouse and all data...');
      showSuccess('Deleting warehouse and all data...');
      await warehouseService.deleteWarehouse(currentWarehouse.id);
      
      // Close dialog and reset state
      setDeleteDialogOpen(false);
      setConfirmationText('');
      setBackupBeforeDelete(false);
      setDeleteProgressStep('');
      
      showSuccess(`Warehouse "${currentWarehouse.name}" has been permanently deleted`);
      
      // Redirect or refresh to clear the current warehouse context
      // The WarehouseContext should handle this automatically
      window.location.reload();
      
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      showError(`Failed to delete warehouse: ${error.message}`);
    } finally {
      setDeleteInProgress(false);
      setDeleteBackupInProgress(false);
      setDeleteProgressStep('');
    }
  };

  const handleUploadBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadInProgress(true);
    setUploadedFile(file);

    try {
      const uploadedBackup = await backupService.uploadBackup(currentWarehouse.id, file);
      
      // Refresh backups list
      await loadBackups();
      
      showSuccess(`Backup "${uploadedBackup.name}" uploaded successfully`);
      
      // Clear file input
      event.target.value = '';
      setUploadedFile(null);
    } catch (error) {
      showError(`Failed to upload backup: ${error.message}`);
      event.target.value = '';
      setUploadedFile(null);
    } finally {
      setUploadInProgress(false);
    }
  };

  const getBackupSizeDisplay = (sizeInBytes) => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getReportTypeDescription = (type) => {
    switch (type) {
      case 'stock_movements': 
        return '📦 Complete stock movement history including date, location, put-away operations, pick operations, quantity movements, and closing stock levels for comprehensive tracking.';
      // case 'inventory_summary': 
      //   return '📊 Current inventory levels showing real-time stock quantities, bin locations, and storage occupancy across all warehouse areas.';
      // case 'putaway_summary': 
      //   return '📥 Put-away operations summary with detailed statistics, success rates, and storage allocation performance metrics.';
      // case 'pick_summary': 
      //   return '📤 Pick operations summary including fulfillment rates, pick efficiency, and order completion statistics.';
      // case 'bin_utilization': 
      //   return '📈 Bin capacity utilization analysis with storage efficiency metrics, space optimization recommendations, and capacity planning insights.';
      default: 
        return 'Select a report type to see detailed description and available data fields.';
    }
  };

  if (!currentWarehouse) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Alert severity="warning">
          Please select a warehouse first to access settings.
        </Alert>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>

        <Paper sx={{ width: '100%' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="settings tabs"
            variant="fullWidth"
          >
            <Tab icon={<BackupIcon />} label="Backup & Restore" />
            <Tab icon={<ReportIcon />} label="Report Generation" />
            <Tab icon={<DeleteIcon />} label="Delete Warehouse" />
          </Tabs>

          {/* Backup & Restore Tab */}
          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={3}>
              {/* Auto Backup Settings */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Automatic Backup Settings
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={autoBackupEnabled}
                          onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                        />
                      }
                      label="Enable automatic backup every 12 hours"
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Automatic backups will keep up to 10 backups and delete oldest ones when limit is reached.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Manual Backup */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Manual Backup
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Create a backup of all warehouse data including bins, products, and operation history.
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<BackupIcon />}
                      onClick={() => setBackupDialogOpen(true)}
                      disabled={backupInProgress}
                      fullWidth
                    >
                      {backupInProgress ? <CircularProgress size={20} /> : 'Create Backup'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              {/* Restore */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Restore from Backup
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Restore warehouse data from a previous backup. This will overwrite current data.
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<RestoreIcon />}
                      onClick={() => setRestoreDialogOpen(true)}
                      disabled={backups.length === 0 || restoreInProgress}
                      fullWidth
                    >
                      {restoreInProgress ? <CircularProgress size={20} /> : 'Restore Backup'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              {/* Upload Backup */}
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Upload Backup
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Upload a previously downloaded backup file to restore or store for later use.
                    </Typography>
                    
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleUploadBackup}
                      style={{ display: 'none' }}
                      id="backup-upload-input"
                      disabled={uploadInProgress}
                    />
                    
                    <label htmlFor="backup-upload-input">
                      <Button
                        variant="outlined"
                        startIcon={uploadInProgress ? <CircularProgress size={20} /> : <UploadIcon />}
                        component="span"
                        disabled={uploadInProgress}
                        fullWidth
                      >
                        {uploadInProgress ? 'Uploading...' : 'Upload Backup File'}
                      </Button>
                    </label>
                    
                    {uploadedFile && (
                      <Alert severity="info" sx={{ mt: 2 }}>
                        Uploading: {uploadedFile.name}
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Backup List */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Available Backups ({backups.length}/10)
                    </Typography>
                    {backups.length === 0 ? (
                      <Alert severity="info">No backups available. Create your first backup above.</Alert>
                    ) : (
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Name</TableCell>
                              <TableCell>Date</TableCell>
                              <TableCell>Type</TableCell>
                              <TableCell>Size</TableCell>
                              <TableCell>Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {backups.map((backup) => (
                              <TableRow key={backup.id}>
                                <TableCell>{backup.name}</TableCell>
                                <TableCell>{new Date(backup.createdAt).toLocaleString()}</TableCell>
                                <TableCell>
                                  <Chip 
                                    label={backup.type} 
                                    color={backup.type === 'auto' ? 'primary' : 'secondary'}
                                    size="small"
                                  />
                                </TableCell>
                                <TableCell>{getBackupSizeDisplay(backup.size)}</TableCell>
                                <TableCell>
                                  <ButtonGroup size="small">
                                    <Button
                                      startIcon={<RestoreIcon />}
                                      onClick={() => {
                                        setSelectedBackup(backup);
                                        setRestoreDialogOpen(true);
                                      }}
                                    >
                                      Restore
                                    </Button>
                                    <Button
                                      startIcon={<DownloadIcon />}
                                      onClick={() => backupService.downloadBackup(currentWarehouse.id, backup.id)}
                                    >
                                      Download
                                    </Button>
                                    <IconButton
                                      color="error"
                                      onClick={() => handleDeleteBackup(backup.id)}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </ButtonGroup>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Report Generation Tab */}
          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              {/* Enhanced Report Configuration */}
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Stock Movement Reports
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Generate comprehensive reports with date, location, putaway, picklist, movement, and closing quantity data
                    </Typography>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                          <InputLabel>Report Type</InputLabel>
                          <Select
                            value={reportType}
                            label="Report Type"
                            onChange={(e) => setReportType(e.target.value)}
                          >
                            <MenuItem value="stock_movements">📦 Stock Movements (Complete)</MenuItem>
                            {/* <MenuItem value="putaway_summary">📥 Put-Away Operations</MenuItem>
                            <MenuItem value="pick_summary">📤 Pick Operations</MenuItem>
                            <MenuItem value="inventory_summary">📊 Current Inventory</MenuItem>
                            <MenuItem value="bin_utilization">📈 Bin Utilization</MenuItem> */}
                          </Select>
                        </FormControl>
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                          <InputLabel>Report Scope</InputLabel>
                          <Select
                            value={reportScope}
                            label="Report Scope"
                            onChange={(e) => setReportScope(e.target.value)}
                          >
                            {/* <MenuItem value="date_range">📅 Between Dates</MenuItem> */}
                            <MenuItem value="full">📋 Full Report (All Data)</MenuItem>
                            {/* <MenuItem value="current">🕐 Current Status Only</MenuItem>
                            <MenuItem value="selected">🎯 Selected Items Only</MenuItem> */}
                          </Select>
                        </FormControl>
                      </Grid>

                      {reportScope === 'date_range' && (
                        <>
                          <Grid item xs={12} md={6}>
                            <DatePicker
                              label="Start Date"
                              value={startDate}
                              onChange={setStartDate}
                              renderInput={(params) => <TextField {...params} fullWidth />}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <DatePicker
                              label="End Date"
                              value={endDate}
                              onChange={setEndDate}
                              renderInput={(params) => <TextField {...params} fullWidth />}
                            />
                          </Grid>
                        </>
                      )}

                      {reportScope === 'selected' && (
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="Selected SKUs (comma-separated)"
                            placeholder="Enter SKUs separated by commas, e.g., SKU001, SKU002, SKU003"
                            value={selectedSkus}
                            onChange={(e) => setSelectedSkus(e.target.value)}
                            helperText="Leave empty to include all SKUs"
                          />
                        </Grid>
                      )}

                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          {getReportTypeDescription(reportType)}
                        </Typography>
                      </Grid>

                      {/* Report Features Info */}
                      <Grid item xs={12}>
                        <Alert severity="info">
                          <Typography variant="subtitle2" gutterBottom>
                            📊 Stock Movement Report includes:
                          </Typography>
                          <Typography variant="body2" component="div">
                            • <strong>Date & Time:</strong> When each movement occurred<br/>
                            • <strong>Location:</strong> Warehouse, rack, and bin details<br/>
                            • <strong>Put-Away:</strong> Items received and stored<br/>
                            • <strong>Pick List:</strong> Items picked for orders<br/>
                            • <strong>Movement:</strong> Quantity changes and transfers<br/>
                            • <strong>Closing:</strong> Remaining stock after operations
                          </Typography>
                        </Alert>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>

              {/* Enhanced Output Options */}
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      📥 Download & Print Options
                    </Typography>
                    
                    <ButtonGroup orientation="vertical" fullWidth sx={{ mb: 2 }}>
                      <Button
                        variant={reportFormat === 'excel' ? 'contained' : 'outlined'}
                        startIcon={<ExcelIcon />}
                        onClick={() => setReportFormat('excel')}
                        color={reportFormat === 'excel' ? 'primary' : 'inherit'}
                      >
                        📊 Excel Spreadsheet
                      </Button>
                      {/* <Button
                        variant={reportFormat === 'pdf' ? 'contained' : 'outlined'}
                        startIcon={<PdfIcon />}
                        onClick={() => setReportFormat('pdf')}
                        color={reportFormat === 'pdf' ? 'primary' : 'inherit'}
                      >
                        📄 PDF Document
                      </Button> */}
                      <Button
                        variant={reportFormat === 'print' ? 'contained' : 'outlined'}
                        startIcon={<PrintIcon />}
                        onClick={() => setReportFormat('print')}
                        color={reportFormat === 'print' ? 'primary' : 'inherit'}
                      >
                        🖨️ Print Report
                      </Button>
                    </ButtonGroup>

                    <Divider sx={{ my: 2 }} />

                    <Button
                      variant="contained"
                      fullWidth
                      size="large"
                      startIcon={reportGenerating ? <CircularProgress size={20} /> : <ExportIcon />}
                      onClick={handleGenerateReport}
                      disabled={reportGenerating || !currentWarehouse}
                      sx={{ 
                        height: 56,
                        fontSize: '1.1rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {reportGenerating ? 'Generating...' : '🚀 Generate Report'}
                    </Button>

                    {reportGenerating && (
                      <Box sx={{ mt: 2 }}>
                        <LinearProgress />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                          Processing warehouse data...
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Report Features Overview */}
              {/* <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      📈 Available Report Types
                    </Typography>
                    
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6} lg={3}>
                        <Box textAlign="center" p={2}>
                          <MovementIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
                          <Typography variant="h6">Stock Movements</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Complete movement history with putaway, pick operations, and closing quantities for all items
                          </Typography>
                        </Box>
                      </Grid>
                      
                      <Grid item xs={12} md={6} lg={3}>
                        <Box textAlign="center" p={2}>
                          <InventoryIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
                          <Typography variant="h6">Current Inventory</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Real-time stock levels, bin locations, and available capacity across all warehouse areas
                          </Typography>
                        </Box>
                      </Grid>
                      
                      <Grid item xs={12} md={6} lg={3}>
                        <Box textAlign="center" p={2}>
                          <StorageIcon color="warning" sx={{ fontSize: 48, mb: 1 }} />
                          <Typography variant="h6">Bin Utilization</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Storage efficiency metrics, capacity utilization, and optimization recommendations
                          </Typography>
                        </Box>
                      </Grid>
                      
                      <Grid item xs={12} md={6} lg={3}>
                        <Box textAlign="center" p={2}>
                          <DateRangeIcon color="info" sx={{ fontSize: 48, mb: 1 }} />
                          <Typography variant="h6">Date Range Reports</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Filter operations by specific date ranges for detailed period analysis and trending
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid> */}

              {/* Report Statistics (if available) */}
              {/* {currentWarehouse && (
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        📊 Warehouse Data Summary - {currentWarehouse.name}
                      </Typography>
                      
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Box textAlign="center" p={1}>
                            <Typography variant="h4" color="primary">📦</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Ready for reporting
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box textAlign="center" p={1}>
                            <Typography variant="h4" color="success.main">📥</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Put-away operations
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box textAlign="center" p={1}>
                            <Typography variant="h4" color="warning.main">📤</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Pick operations
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Box textAlign="center" p={1}>
                            <Typography variant="h4" color="info.main">📊</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Movement tracking
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              )} */}
            </Grid>
          </TabPanel>

          {/* Delete Warehouse Tab */}
          <TabPanel value={tabValue} index={2}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Alert severity="error" sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    ⚠️ DANGER ZONE ⚠️
                  </Typography>
                  <Typography>
                    Deleting a warehouse will permanently remove ALL data including racks, bins, 
                    inventory, pick/put-away tasks, and operation history. This action CANNOT be undone.
                  </Typography>
                </Alert>
              </Grid>

              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom color="error">
                      Delete Warehouse: {currentWarehouse?.name}
                    </Typography>
                    
                    <Typography variant="body1" paragraph>
                      Before proceeding with deletion, we strongly recommend creating a backup 
                      of your warehouse data. This backup can be used to restore your data if needed.
                    </Typography>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={backupBeforeDelete}
                          onChange={(e) => setBackupBeforeDelete(e.target.checked)}
                          color="primary"
                        />
                      }
                      label="Create backup before deletion (Recommended)"
                      sx={{ mb: 3 }}
                    />

                    {backupBeforeDelete && (
                      <Alert severity="info" sx={{ mb: 3 }}>
                        A complete backup will be created and downloaded before deletion.
                      </Alert>
                    )}

                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={deleteInProgress || !currentWarehouse}
                      size="large"
                      sx={{ 
                        bgcolor: 'error.main',
                        '&:hover': { bgcolor: 'error.dark' }
                      }}
                    >
                      {deleteInProgress ? 'Deleting...' : 'Delete Warehouse'}
                    </Button>

                    {(deleteInProgress || deleteBackupInProgress) && (
                      <Box sx={{ mt: 2 }}>
                        <LinearProgress />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {deleteProgressStep || (deleteBackupInProgress ? 'Creating backup...' : 'Deleting warehouse...')}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      What will be deleted?
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon>
                          <StorageIcon color="error" />
                        </ListItemIcon>
                        <ListItemText primary="All racks and bins" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <InventoryIcon color="error" />
                        </ListItemIcon>
                        <ListItemText primary="All inventory data" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <MovementIcon color="error" />
                        </ListItemIcon>
                        <ListItemText primary="Pick & Put-away tasks" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <ReportIcon color="error" />
                        </ListItemIcon>
                        <ListItemText primary="Operation history" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <BackupIcon color="error" />
                        </ListItemIcon>
                        <ListItemText primary="Reports and analytics" />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>
        </Paper>

        {/* Backup Creation Dialog */}
        <Dialog open={backupDialogOpen} onClose={() => setBackupDialogOpen(false)}>
          <DialogTitle>Create Manual Backup</DialogTitle>
          <DialogContent>
            <Typography>
              This will create a complete backup of warehouse "{currentWarehouse.name}" including:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon><StorageIcon /></ListItemIcon>
                <ListItemText primary="All bins and rack configurations" />
              </ListItem>
              <ListItem>
                <ListItemIcon><InventoryIcon /></ListItemIcon>
                <ListItemText primary="Current inventory and stock levels" />
              </ListItem>
              <ListItem>
                <ListItemIcon><MovementIcon /></ListItemIcon>
                <ListItemText primary="Operation history (put-away and pick)" />
              </ListItem>
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBackupDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateBackup} 
              variant="contained"
              disabled={backupInProgress}
            >
              {backupInProgress ? <CircularProgress size={20} /> : 'Create Backup'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Restore Dialog */}
        <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
          <DialogTitle>Restore from Backup</DialogTitle>
          <DialogContent>
            {selectedBackup ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This will completely replace all current warehouse data with the selected backup. This action cannot be undone.
                </Alert>
                <Typography variant="h6">Selected Backup:</Typography>
                <Typography><strong>Name:</strong> {selectedBackup.name}</Typography>
                <Typography><strong>Date:</strong> {new Date(selectedBackup.createdAt).toLocaleString()}</Typography>
                <Typography><strong>Size:</strong> {getBackupSizeDisplay(selectedBackup.size)}</Typography>
              </Box>
            ) : (
              <FormControl fullWidth>
                <InputLabel>Select Backup</InputLabel>
                <Select
                  value=""
                  label="Select Backup"
                  onChange={(e) => setSelectedBackup(backups.find(b => b.id === e.target.value))}
                >
                  {backups.map((backup) => (
                    <MenuItem key={backup.id} value={backup.id}>
                      {backup.name} - {new Date(backup.createdAt).toLocaleString()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setRestoreDialogOpen(false);
              setSelectedBackup(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleRestoreBackup} 
              variant="contained"
              color="warning"
              disabled={!selectedBackup || restoreInProgress}
            >
              {restoreInProgress ? <CircularProgress size={20} /> : 'Restore Backup'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Warehouse Confirmation Dialog */}
        <Dialog 
          open={deleteDialogOpen} 
          onClose={() => setDeleteDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
              <WarningIcon sx={{ mr: 1 }} />
              Confirm Warehouse Deletion
            </Box>
          </DialogTitle>
          <DialogContent>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                This action is IRREVERSIBLE!
              </Typography>
              <Typography>
                You are about to permanently delete warehouse "{currentWarehouse?.name}" 
                and ALL of its data. This cannot be undone.
              </Typography>
            </Alert>

            <Typography variant="body1" paragraph>
              Type the warehouse name <strong>"{currentWarehouse?.name}"</strong> to confirm deletion:
            </Typography>

            <TextField
              fullWidth
              variant="outlined"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={`Type "${currentWarehouse?.name}" here`}
              error={confirmationText && confirmationText !== currentWarehouse?.name}
              helperText={
                confirmationText && confirmationText !== currentWarehouse?.name
                  ? "Warehouse name doesn't match"
                  : ""
              }
              sx={{ mb: 2 }}
            />

            {backupBeforeDelete && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  ✓ A backup will be created and downloaded before deletion
                </Typography>
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary">
              Data that will be permanently deleted:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="• All racks, shelves, and bins" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• All inventory and stock data" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• All pick and put-away operations" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• All operation history and reports" />
              </ListItem>
              <ListItem>
                <ListItemText primary="• All warehouse configuration" />
              </ListItem>
            </List>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button 
              onClick={() => {
                setDeleteDialogOpen(false);
                setConfirmationText('');
              }}
              disabled={deleteInProgress || deleteBackupInProgress}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteWarehouse}
              disabled={
                deleteInProgress || 
                deleteBackupInProgress ||
                confirmationText !== currentWarehouse?.name
              }
              startIcon={deleteInProgress ? <CircularProgress size={20} /> : <DeleteIcon />}
            >
              {deleteInProgress ? 'Deleting...' : 'Delete Warehouse Forever'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}
