import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Card,
  CardContent,
  CardActions,
  Fab,
  useMediaQuery,
  useTheme,
  Stack,
  Divider,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  DataGrid,
  GridToolbar,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { warehouseService } from '../services/warehouseService';
import { printService } from '../services/printService';
import { barcodeService } from '../services/barcodeService';
import { rackService } from '../services/rackService';

const statusOptions = [
  { value: 'available', label: 'Available', color: 'success' },
  { value: 'occupied', label: 'Occupied', color: 'warning' },
  { value: 'maintenance', label: 'Maintenance', color: 'error' },
  { value: 'damaged', label: 'Damaged', color: 'error' },
];

function BinDialog({ open, onClose, bin = null, onSave }) {
  const { currentWarehouse, racks, zones } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const isEdit = !!bin;
  
  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      code: bin?.code || '',
      rackId: bin?.rackId || '',
      rackCode: bin?.rackCode || '',
      shelfLevel: bin?.shelfLevel || 1,
      position: bin?.position || 1,
      zoneId: bin?.zoneId || '',
      capacity: bin?.capacity || 10,
      currentQty: bin?.currentQty || 0,
      sku: bin?.sku || '',
      lotNumber: bin?.lotNumber || '',
      expiryDate: bin?.expiryDate || '',
      status: bin?.status || 'available',
    }
  });

  // Watch rack and position changes for auto-generating bin code
  const rackId = watch('rackId');
  const shelfLevel = watch('shelfLevel');
  const position = watch('position');

  // Auto-generate bin code when rack, grid, or position changes (for both create and edit)
  useEffect(() => {
    if (rackId && shelfLevel && position) {
      const selectedRack = racks.find(rack => rack.id === rackId);
      if (selectedRack && currentWarehouse) {
        const generatedCode = rackService.generateBinCode(
          selectedRack.code, 
          shelfLevel, 
          position, 
          currentWarehouse.code || 'WH', 
          selectedRack.floor || 'GF'
        );
        setValue('code', generatedCode);
        setValue('rackCode', selectedRack.code);
      }
    }
  }, [rackId, shelfLevel, position, racks, setValue, currentWarehouse]);

  // Set initial values and auto-generate code for edit mode
  useEffect(() => {
    if (isEdit && bin && open) {
      // Reset form with bin data
      reset({
        code: bin.code || '',
        rackId: bin.rackId || '',
        rackCode: bin.rackCode || '',
        shelfLevel: bin.shelfLevel || 1,
        position: bin.position || 1,
        zoneId: bin.zoneId || '',
        capacity: bin.capacity || 10,
        currentQty: bin.currentQty || 0,
        sku: bin.sku || '',
        lotNumber: bin.lotNumber || '',
        expiryDate: bin.expiryDate || '',
        status: bin.status || 'available',
      });

      // Auto-generate bin code for edit mode
      if (bin.rackId && bin.shelfLevel && bin.position) {
        const selectedRack = racks.find(rack => rack.id === bin.rackId);
        if (selectedRack && currentWarehouse) {
          const generatedCode = rackService.generateBinCode(
            selectedRack.code, 
            bin.shelfLevel, 
            bin.position, 
            currentWarehouse.code || 'WH', 
            selectedRack.floor || 'GF'
          );
          setValue('code', generatedCode);
          setValue('rackCode', selectedRack.code);
        }
      }
    }
  }, [isEdit, bin, open, racks, reset, setValue]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await warehouseService.updateBin(currentWarehouse.id, bin.id, data);
        showSuccess('Bin updated successfully');
      } else {
        await warehouseService.createBin(currentWarehouse.id, data);
        showSuccess('Bin created successfully');
      }
      onSave();
      onClose();
      reset();
    } catch (error) {
      showError(`Error ${isEdit ? 'updating' : 'creating'} bin: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {isEdit ? 'Edit Bin' : 'Create New Bin'}
        </DialogTitle>
        
        <DialogContent>
          {isEdit && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Bin code, rack, grid level, and position are auto-generated and cannot be changed during edit. 
              These fields ensure proper bin identification and location tracking.
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Controller
                name="code"
                control={control}
                rules={{ required: 'Bin code is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Bin Code"
                    fullWidth
                    disabled={isEdit}
                    error={!!errors.code}
                    helperText={isEdit ? 'Bin code is auto-generated and cannot be edited' : errors.code?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="rackId"
                control={control}
                rules={{ required: 'Rack is required' }}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.rackId}>
                    <InputLabel>Rack</InputLabel>
                    <Select 
                      {...field} 
                      label="Rack"
                      disabled={isEdit}
                    >
                      {racks.map(rack => (
                        <MenuItem key={rack.id} value={rack.id}>
                          {rack.code} - {rack.name}
                        </MenuItem>
                      ))}
                    </Select>
                    {isEdit && (
                      <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
                        Rack cannot be changed during edit
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Controller
                name="shelfLevel"
                control={control}
                rules={{ 
                  required: 'Grid level is required',
                  min: { value: 1, message: 'Grid level must be at least 1' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Grid Level"
                    type="number"
                    fullWidth
                    disabled={isEdit}
                    error={!!errors.shelfLevel}
                    helperText={isEdit ? 'Grid level cannot be changed during edit' : errors.shelfLevel?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Controller
                name="position"
                control={control}
                rules={{ 
                  required: 'Position is required',
                  min: { value: 1, message: 'Position must be at least 1' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Position"
                    type="number"
                    fullWidth
                    disabled={isEdit}
                    error={!!errors.position}
                    helperText={isEdit ? 'Position cannot be changed during edit' : errors.position?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Controller
                name="capacity"
                control={control}
                rules={{ 
                  required: 'Capacity is required',
                  min: { value: 1, message: 'Capacity must be at least 1' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Capacity"
                    type="number"
                    fullWidth
                    error={!!errors.capacity}
                    helperText={errors.capacity?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="zoneId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Zone</InputLabel>
                    <Select {...field} label="Zone">
                      <MenuItem value="">No Zone</MenuItem>
                      {zones.map(zone => (
                        <MenuItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select {...field} label="Status">
                      {statusOptions.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
            
            {isEdit && (
              <>
                <Grid item xs={12} md={4}>
                  <Controller
                    name="currentQty"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Current Quantity"
                        type="number"
                        fullWidth
                      />
                    )}
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Controller
                    name="sku"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="SKU"
                        fullWidth
                      />
                    )}
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Controller
                    name="lotNumber"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Lot Number"
                        fullWidth
                      />
                    )}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Controller
                    name="expiryDate"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Expiry Date"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                      />
                    )}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// Enhanced Mobile/Desktop Bins List Component
function EnhancedBinsList() {
  const { currentWarehouse, bins, racks, zones, loading } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBin, setSelectedBin] = useState(null);
  const [viewMode, setViewMode] = useState(isMobile ? 'cards' : 'table');
  const [filtersExpanded, setFiltersExpanded] = useState(!isMobile);
  const [selectionModel, setSelectionModel] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Initialize selection model as empty array to prevent DataGrid errors
  useEffect(() => {
    setSelectionModel([]);
  }, []);

  const filteredBins = useMemo(() => {
    return bins.filter(bin => {
      const matchesSearch = !searchText || [
        bin.code,
        bin.sku,
        bin.rackCode,
        bin.lotNumber,
      ].some(field => 
        field && field.toLowerCase().includes(searchText.toLowerCase())
      );
      
      const matchesStatus = !filterStatus || bin.status === filterStatus;
      const matchesZone = !filterZone || bin.zoneId === filterZone;
      
      return matchesSearch && matchesStatus && matchesZone;
    });
  }, [bins, searchText, filterStatus, filterZone]);

  // Update view mode when switching between mobile/desktop
  useEffect(() => {
    setViewMode(isMobile ? 'cards' : 'table');
  }, [isMobile]);

  // Update selection model and bulk actions (temporarily disabled)
  // useEffect(() => {
  //   setShowBulkActions(selectionModel.length > 0);
  // }, [selectionModel]);

  // Clear selection when switching views to prevent DataGrid errors
  useEffect(() => {
    if (isMobile || viewMode === 'cards') {
      setSelectionModel([]);
    }
  }, [isMobile, viewMode]);

  // Mobile-optimized filters
  const renderMobileFilters = () => (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ pb: 1 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="subtitle1" fontWeight={600}>
            Filters
          </Typography>
          <IconButton 
            size="small" 
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            {filtersExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        
        <TextField
          fullWidth
          label="Search bins..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by code, SKU, rack..."
          size="small"
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
        />
        
        <Collapse in={filtersExpanded}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                label="Status"
              >
                <MenuItem value="">All Statuses</MenuItem>
                {statusOptions.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <FormControl fullWidth size="small">
              <InputLabel>Zone</InputLabel>
              <Select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                label="Zone"
              >
                <MenuItem value="">All Zones</MenuItem>
                {zones.map(zone => (
                  <MenuItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {filteredBins.length} of {bins.length} bins
              </Typography>
              <Box>
                <IconButton 
                  size="small" 
                  onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
                  color={viewMode === 'cards' ? 'primary' : 'default'}
                >
                  {viewMode === 'cards' ? <ViewListIcon /> : <ViewModuleIcon />}
                </IconButton>
              </Box>
            </Box>
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );

  // Mobile card view
  const renderMobileCards = () => (
    <Box>
      {filteredBins.map((bin) => (
        <Card key={bin.id} sx={{ mb: 2 }}>
          <CardContent sx={{ pb: 1 }}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Box>
                <Typography variant="h6" fontWeight={600}>
                  {bin.code}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {bin.rackCode} • Grid {bin.shelfLevel} • Pos {bin.position}
                </Typography>
              </Box>
              <Chip 
                label={statusOptions.find(s => s.value === bin.status)?.label || bin.status}
                color={statusOptions.find(s => s.value === bin.status)?.color || 'default'}
                size="small"
              />
            </Box>
            
            <Divider sx={{ my: 1 }} />
            
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">SKU</Typography>
                <Typography variant="body2" fontWeight={500}>
                  {bin.sku || '-'}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Quantity</Typography>
                <Typography variant="body2" fontWeight={500}>
                  {bin.currentQty} / {bin.capacity}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Utilization</Typography>
                <Typography variant="body2" fontWeight={500}>
                  {bin.capacity > 0 ? ((bin.currentQty / bin.capacity) * 100).toFixed(1) : 0}%
                </Typography>
              </Grid>
              {bin.lotNumber && (
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Lot</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {bin.lotNumber}
                  </Typography>
                </Grid>
              )}
              {bin.expiryDate && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Expiry</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    {new Date(bin.expiryDate).toLocaleDateString()}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
          
          <CardActions sx={{ pt: 0 }}>
            <Button 
              size="small" 
              startIcon={<EditIcon />}
              onClick={() => handleEdit(bin)}
            >
              Edit
            </Button>
            <Button 
              size="small" 
              startIcon={<QrCodeIcon />}
              onClick={() => handlePrintQR([bin])}
            >
              Print QR
            </Button>
            <Button 
              size="small" 
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => handleDelete(bin.id)}
            >
              Delete
            </Button>
          </CardActions>
        </Card>
      ))}
      
      {filteredBins.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <InventoryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No bins found
            </Typography>
            <Typography color="text.secondary" gutterBottom>
              {searchText || filterStatus || filterZone 
                ? 'Try adjusting your filters to see more results.'
                : 'Create your first bin to get started.'
              }
            </Typography>
            {!searchText && !filterStatus && !filterZone && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                sx={{ mt: 2 }}
                onClick={handleCreate}
              >
                Add First Bin
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );

  const columns = [
    { 
      field: 'code', 
      headerName: 'Bin Code', 
      width: 150,
      pinned: 'left',
    },
    { 
      field: 'rackCode', 
      headerName: 'Rack', 
      width: 100,
    },
    { 
      field: 'shelfLevel', 
      headerName: 'Shelf', 
      width: 80,
      type: 'number',
    },
    { 
      field: 'position', 
      headerName: 'Position', 
      width: 90,
      type: 'number',
    },
    { 
      field: 'sku', 
      headerName: 'SKU', 
      width: 120,
      renderCell: (params) => params.value || '-',
    },
    { 
      field: 'currentQty', 
      headerName: 'Current Qty', 
      width: 110,
      type: 'number',
    },
    { 
      field: 'capacity', 
      headerName: 'Capacity', 
      width: 100,
      type: 'number',
    },
    {
      field: 'utilization',
      headerName: 'Utilization',
      width: 120,
      renderCell: (params) => {
        const utilization = params.row.capacity > 0 
          ? (params.row.currentQty / params.row.capacity) * 100 
          : 0;
        return `${utilization.toFixed(1)}%`;
      }
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 110,
      renderCell: (params) => {
        const status = statusOptions.find(s => s.value === params.value);
        return (
          <Chip 
            label={status?.label || params.value} 
            color={status?.color || 'default'}
            size="small"
          />
        );
      }
    },
    { 
      field: 'lotNumber', 
      headerName: 'Lot Number', 
      width: 120,
      renderCell: (params) => params.value || '-',
    },
    { 
      field: 'expiryDate', 
      headerName: 'Expiry Date', 
      width: 120,
      renderCell: (params) => {
        if (!params.value) return '-';
        return new Date(params.value).toLocaleDateString();
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label="Edit"
          onClick={() => handleEdit(params.row)}
        />,
        <GridActionsCellItem
          icon={<QrCodeIcon />}
          label="Print QR"
          onClick={() => handlePrintQR([params.row])}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="Delete"
          onClick={() => handleDelete(params.row.id)}
        />,
      ],
    },
  ];

  const handleCreate = () => {
    setSelectedBin(null);
    setDialogOpen(true);
  };

  const handleEdit = (bin) => {
    setSelectedBin(bin);
    setDialogOpen(true);
  };

  const handleDelete = async (binId) => {
    if (window.confirm('Are you sure you want to delete this bin?')) {
      try {
        await warehouseService.deleteBin(currentWarehouse.id, binId);
        showSuccess('Bin deleted successfully');
      } catch (error) {
        showError(`Error deleting bin: ${error.message}`);
      }
    }
  };

  const handlePrintQR = async (selectedBins) => {
    try {
      await printService.printBinLabels(selectedBins, {
        includeQR: true,
        includeCapacity: true,
        includeLocation: true,
        labelSize: 'medium',
      });
    } catch (error) {
      showError(`Error printing labels: ${error.message}`);
    }
  };

  const handlePrintSelected = async () => {
    const selectedBins = bins.filter(bin => selectionModel.includes(bin.id));
    if (selectedBins.length === 0) {
      showError('Please select bins to print');
      return;
    }
    await handlePrintQR(selectedBins);
  };

  // Safe handler for DataGrid row selection changes
  const handleRowSelectionChange = (newSelection) => {
    // Ensure the selection is always an array to prevent DataGrid errors
    const validSelection = Array.isArray(newSelection) ? newSelection : [];
    setSelectionModel(validSelection);
  };

  const handleRefresh = () => {
    // Trigger refresh through context
    window.location.reload();
  };

  if (!currentWarehouse) {
    return (
      <Alert severity="info">
        No warehouse selected. Please configure a warehouse first.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant={isMobile ? "h5" : "h4"} fontWeight="bold">
            {isMobile ? 'Bins' : 'Bins Management'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {filteredBins.length} of {bins.length} bins
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {!isMobile && (
            <>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                sx={{ mr: 1 }}
              >
                Filters
              </Button>
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                onClick={() => handlePrintQR(filteredBins)}
                disabled={filteredBins.length === 0}
                sx={{ mr: 1 }}
              >
                Print All
              </Button>
            </>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
            size={isMobile ? "small" : "medium"}
          >
            {isMobile ? 'Add' : 'Add Bin'}
          </Button>
        </Box>
      </Box>

      {/* Mobile Filters or Desktop Filters */}
      {isMobile ? renderMobileFilters() : (
        <Collapse in={filtersExpanded}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Search bins..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by code, SKU, rack..."
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                />
              </Grid>
              
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {statusOptions.map(option => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Zone</InputLabel>
                  <Select
                    value={filterZone}
                    onChange={(e) => setFilterZone(e.target.value)}
                    label="Zone"
                  >
                    <MenuItem value="">All Zones</MenuItem>
                    {zones.map(zone => (
                      <MenuItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    View:
                  </Typography>
                  <IconButton 
                    size="small" 
                    onClick={() => setViewMode('table')}
                    color={viewMode === 'table' ? 'primary' : 'default'}
                  >
                    <ViewListIcon />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    onClick={() => setViewMode('cards')}
                    color={viewMode === 'cards' ? 'primary' : 'default'}
                  >
                    <ViewModuleIcon />
                  </IconButton>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Collapse>
      )}

      {/* Content - Mobile Cards or Desktop Table */}
      {isMobile || viewMode === 'cards' ? renderMobileCards() : (
        <Paper sx={{ height: 600, width: '100%' }}>
          {bins.length > 0 ? (
            // Note: Temporarily disabled checkboxSelection due to DataGrid v8 compatibility issues
            // Individual row actions are still available in the Actions column
            <DataGrid
              rows={filteredBins}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 },
                },
              }}
              initialState={{
                pagination: {
                  paginationModel: { page: 0, pageSize: 25 },
                },
              }}
              pageSizeOptions={[25, 50, 100]}
              sx={{
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: theme.palette.action.hover,
                },
                '& .MuiDataGrid-footerContainer': {
                  minHeight: 52,
                },
              }}
            />
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" height={400}>
              <Typography color="text.secondary">No bins found</Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Mobile Print All FAB - Alternative to bulk selection */}
      {isMobile && filteredBins.length > 0 && (
        <Fab
          color="primary"
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 1000
          }}
          onClick={() => handlePrintQR(filteredBins)}
        >
          <PrintIcon />
        </Fab>
      )}

      {/* Mobile Bulk Actions FAB - Temporarily disabled */}
      {/* {isMobile && showBulkActions && (
        <Fab
          color="primary"
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 1000
          }}
          onClick={handlePrintSelected}
        >
          <PrintIcon />
        </Fab>
      )} */}

      {/* Desktop Bulk Actions - Temporarily disabled */}
      {/* {!isMobile && showBulkActions && (
        <Box mt={2} display="flex" gap={1}>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
            {selectionModel.length} bin(s) selected
          </Typography>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrintSelected}
          >
            Print Selected Labels
          </Button>
        </Box>
      )} */}

      {/* Dialog */}
      <BinDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        bin={selectedBin}
        onSave={() => {}}
      />
    </Box>
  );
}

// Export the enhanced version as default
export default EnhancedBinsList;
