import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  LinearProgress,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Visibility as PreviewIcon,
  ViewModule as CardViewIcon,
  ViewList as TableViewIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { rackService } from '../services/rackService_restructured';

const steps = [
  'Basic Information',
  'Location & Configuration',
  'Preview & Confirm'
];

function RackConfigurationDialog({ open, onClose, rack = null, onSave }) {
  const { currentWarehouse } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const isEdit = !!rack;
  
  const { control, handleSubmit, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      name: rack?.name || '',
      floor: rack?.floor || 'GF',
      gridCount: rack?.gridCount || rack?.shelfCount || 5,
      binsPerGrid: rack?.binsPerGrid || rack?.binsPerShelf || 10,
      maxProductsPerBin: rack?.maxProductsPerBin || 100,
      rackNumber: rack?.rackNumber || 1,
      location: {
        aisle: rack?.location?.aisle || '',
        section: rack?.location?.section || ''
      },
      dimensions: {
        height: rack?.dimensions?.height || '',
        width: rack?.dimensions?.width || '',
        depth: rack?.dimensions?.depth || ''
      }
    }
  });

  const watchedValues = watch();

  const handleNext = () => {
    if (activeStep === 2) {
      handleSave();
    } else if (activeStep === 1) {
      generatePreview();
      setActiveStep(prev => prev + 1);
    } else {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const generatePreview = () => {
    const data = watchedValues;
    const warehouseCode = currentWarehouse?.code || 'WH';
    
    // Generate sample location codes
    const sampleLocations = [];
    for (let grid = 1; grid <= Math.min(3, data.gridCount); grid++) {
      for (let bin = 1; bin <= Math.min(3, data.binsPerGrid); bin++) {
        const locationCode = rackService.generateLocationCode(
          warehouseCode,
          data.floor,
          data.rackNumber,
          grid,
          bin
        );
        sampleLocations.push({
          grid,
          bin,
          locationCode
        });
      }
    }

    setPreviewData({
      ...data,
      warehouseCode,
      totalBins: data.gridCount * data.binsPerGrid,
      totalCapacity: data.gridCount * data.binsPerGrid * data.maxProductsPerBin,
      sampleLocations
    });
  };

  const handleSave = async () => {
    const data = watchedValues;
    
    // Validate configuration
    const validation = rackService.validateRackConfig(data);
    if (!validation.isValid) {
      showError(`Invalid configuration: ${validation.errors.join(', ')}`);
      return;
    }

    try {
      setLoading(true);
      
      if (isEdit) {
        // Update existing rack
        await rackService.updateRackStructure(currentWarehouse.id, rack.id, data);
        showSuccess('Rowupdated successfully');
      } else {
        // Create new rack
        const result = await rackService.createRackWithStructure(currentWarehouse.id, data);
        showSuccess(`Rowcreated with ${result.summary.totalBins} bins`);
      }
      
      onSave();
      handleClose();
    } catch (error) {
      showError(`Error ${isEdit ? 'updating' : 'creating'} rack: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setActiveStep(0);
    setPreviewData(null);
    onClose();
  };

  const floorOptions = rackService.getFloorOptions();

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEdit ? 'Edit RowConfiguration' : 'Create New Rack'}
      </DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={activeStep} orientation="vertical">
          <Step>
            <StepLabel>Basic Information</StepLabel>
            <StepContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Rowname is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="RowName"
                        fullWidth
                        error={!!errors.name}
                        helperText={errors.name?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="rackNumber"
                    control={control}
                    rules={{ required: 'Rownumber is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="RowNumber"
                        type="number"
                        fullWidth
                        error={!!errors.rackNumber}
                        helperText={errors.rackNumber?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="floor"
                    control={control}
                    rules={{ required: 'Floor is required' }}
                    render={({ field }) => (
                      <FormControl fullWidth error={!!errors.floor}>
                        <InputLabel>Floor</InputLabel>
                        <Select {...field} label="Floor">
                          {floorOptions.map(option => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="location.aisle"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Aisle (Optional)"
                        fullWidth
                        placeholder="e.g., A1, B2"
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </StepContent>
          </Step>

          <Step>
            <StepLabel>Location & Configuration</StepLabel>
            <StepContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="gridCount"
                    control={control}
                    rules={{ 
                      required: 'Grid count is required',
                      min: { value: 1, message: 'Minimum 1 grid' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Number of Grids"
                        type="number"
                        fullWidth
                        error={!!errors.gridCount}
                        helperText={errors.gridCount?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="binsPerGrid"
                    control={control}
                    rules={{ 
                      required: 'Bins per grid is required',
                      min: { value: 1, message: 'Minimum 1 bin' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Bins per Grid"
                        type="number"
                        fullWidth
                        error={!!errors.binsPerGrid}
                        helperText={errors.binsPerGrid?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="maxProductsPerBin"
                    control={control}
                    rules={{ 
                      required: 'Max products per bin is required',
                      min: { value: 1, message: 'Minimum 1 product' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Max Products per Bin"
                        type="number"
                        fullWidth
                        error={!!errors.maxProductsPerBin}
                        helperText={errors.maxProductsPerBin?.message}
                      />
                    )}
                  />
                </Grid>
              </Grid>

              <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                Location Code Format Preview
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                Format: WH-{watchedValues.floor}-R{String(watchedValues.rackNumber || 1).padStart(2, '0')}-G{String(1).padStart(2, '0')}-A1
                <br />
                Example: {currentWarehouse?.code || 'WH'}-{watchedValues.floor}-R{String(watchedValues.rackNumber || 1).padStart(2, '0')}-G01-A1 (Grid 1: A1, B1, C1... Grid 2: A2, B2, C2...)
              </Alert>
            </StepContent>
          </Step>

          <Step>
            <StepLabel>Preview & Confirm</StepLabel>
            <StepContent>
              {previewData && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Configuration Summary
                  </Typography>
                  
                  <TableContainer component={Paper} sx={{ mb: 2 }}>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell><strong>RowName</strong></TableCell>
                          <TableCell>{previewData.name}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Floor</strong></TableCell>
                          <TableCell>{previewData.floor}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Grids</strong></TableCell>
                          <TableCell>{previewData.gridCount}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Bins per Grid</strong></TableCell>
                          <TableCell>{previewData.binsPerGrid}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Bins</strong></TableCell>
                          <TableCell>{previewData.totalBins}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Capacity</strong></TableCell>
                          <TableCell>{previewData.totalCapacity} products</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Typography variant="h6" gutterBottom>
                    Sample Location Codes
                  </Typography>
                  <Grid container spacing={1}>
                    {previewData.sampleLocations.map((sample, index) => (
                      <Grid item key={index}>
                        <Chip 
                          label={sample.locationCode} 
                          variant="outlined" 
                          size="small"
                          sx={{ fontFamily: 'monospace' }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </StepContent>
          </Step>
        </Stepper>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={loading}
        >
          {loading ? 'Creating...' : (activeStep === 2 ? 'Create Rack' : 'Next')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Detailed RowView Component
function RackDetailsDialog({ open, onClose, rack, bins }) {
  if (!rack) return null;

  const rackBins = bins.filter(bin => bin.rackId === rack.id);
  const occupiedBins = rackBins.filter(bin => bin.currentQty > 0);
  const availableBins = rackBins.filter(bin => bin.currentQty === 0);
  const totalCapacity = rackBins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0);
  const totalOccupied = rackBins.reduce((sum, bin) => sum + (parseInt(bin.currentQty) || 0), 0);
  const utilization = totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0;

  // Group bins by shelf
  const binsByShelf = rackBins.reduce((acc, bin) => {
    const shelf = bin.shelfLevel || 1;
    if (!acc[shelf]) acc[shelf] = [];
    acc[shelf].push(bin);
    return acc;
  }, {});

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <InfoIcon color="primary" />
          <Typography variant="h5">
            RowDetails: {rack.name}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {/* RowSummary */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              RowInformation
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Name</Typography>
                <Typography variant="body1" fontWeight="bold">{rack.name}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Code</Typography>
                <Typography variant="body1" fontWeight="bold">{rack.code}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Floor</Typography>
                <Chip label={rack.floor} size="small" color="primary" />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Location</Typography>
                <Typography variant="body1">
                  Aisle: {rack.location?.aisle || 'N/A'}, Section: {rack.location?.section || 'N/A'}
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Dimensions</Typography>
                <Typography variant="body1">
                  {rack.dimensions?.height || 'N/A'}H × {rack.dimensions?.width || 'N/A'}W × {rack.dimensions?.depth || 'N/A'}D cm
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary">Configuration</Typography>
                <Typography variant="body1">
                  {rack.shelfCount} grids × {rack.binsPerShelf} bins = {rackBins.length} total bins
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Capacity Overview */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Capacity Overview
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {rackBins.length}
                  </Typography>
                  <Typography color="text.secondary">
                    Total Bins
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {availableBins.length}
                  </Typography>
                  <Typography color="text.secondary">
                    Available
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {occupiedBins.length}
                  </Typography>
                  <Typography color="text.secondary">
                    Occupied
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="info.main">
                    {totalCapacity}
                  </Typography>
                  <Typography color="text.secondary">
                    Total Capacity
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" gutterBottom>
                Utilization: {utilization.toFixed(1)}% ({totalOccupied}/{totalCapacity} units)
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={utilization} 
                sx={{ 
                  height: 8, 
                  borderRadius: 1,
                  backgroundColor: 'grey.300',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: utilization > 80 ? 'error.main' : 
                                   utilization > 60 ? 'warning.main' : 'success.main'
                  }
                }} 
              />
            </Box>
          </CardContent>
        </Card>

        {/* Bins by Grid */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Bins by Grid
            </Typography>
            {Object.keys(binsByShelf).sort((a, b) => parseInt(a) - parseInt(b)).map(gridNum => {
              const gridBins = binsByShelf[gridNum].sort((a, b) => (a.position || 0) - (b.position || 0));
              const gridOccupied = gridBins.filter(bin => bin.currentQty > 0).length;
              const gridCapacity = gridBins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0);
              const gridUsed = gridBins.reduce((sum, bin) => sum + (parseInt(bin.currentQty) || 0), 0);
              
              return (
                <Box key={gridNum} sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Grid {gridNum} ({gridOccupied}/{gridBins.length} bins occupied)
                  </Typography>
                  
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Bin Code</TableCell>
                          <TableCell>Position</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Current Qty</TableCell>
                          <TableCell>Capacity</TableCell>
                          <TableCell>Utilization</TableCell>
                          <TableCell>SKU</TableCell>
                          <TableCell>Lot</TableCell>
                          <TableCell>Expiry</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {gridBins.map(bin => {
                          const binUtilization = bin.capacity > 0 ? (bin.currentQty / bin.capacity) * 100 : 0;
                          
                          return (
                            <TableRow key={bin.id}>
                              <TableCell>
                                <Typography variant="body2" fontFamily="monospace">
                                  {bin.code}
                                </Typography>
                              </TableCell>
                              <TableCell>{bin.position}</TableCell>
                              <TableCell>
                                <Chip 
                                  label={bin.status || 'available'} 
                                  size="small"
                                  color={bin.currentQty > 0 ? 'warning' : 'success'}
                                />
                              </TableCell>
                              <TableCell>{bin.currentQty || 0}</TableCell>
                              <TableCell>{bin.capacity || 0}</TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body2" sx={{ minWidth: '40px' }}>
                                    {binUtilization.toFixed(0)}%
                                  </Typography>
                                  <Box
                                    sx={{
                                      width: 40,
                                      height: 4,
                                      backgroundColor: 'grey.300',
                                      borderRadius: 1,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: `${binUtilization}%`,
                                        height: '100%',
                                        backgroundColor: binUtilization > 80 ? 'error.main' : 
                                                        binUtilization > 60 ? 'warning.main' : 'success.main',
                                      }}
                                    />
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell>{bin.sku || '-'}</TableCell>
                              <TableCell>{bin.lotNumber || '-'}</TableCell>
                              <TableCell>{bin.expiryDate ? new Date(bin.expiryDate).toLocaleDateString() : '-'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Grid Total: {gridUsed}/{gridCapacity} units ({gridCapacity > 0 ? ((gridUsed/gridCapacity)*100).toFixed(1) : 0}% utilized)
                  </Typography>
                </Box>
              );
            })}
          </CardContent>
        </Card>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RackCard({ rack, onEdit, onDelete, onPrint, onViewDetails }) {
  const { bins, currentWarehouse } = useWarehouse();
  
  const rackBins = bins.filter(bin => bin.rackId === rack.id);
  const occupiedBins = rackBins.filter(bin => bin.currentQty > 0);
  const utilization = rackBins.length > 0 ? (occupiedBins.length / rackBins.length) * 100 : 0;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Typography variant="h6">
            {rack.name}
          </Typography>
          <Chip 
            label={rack.floor} 
            size="small"
            color="primary"
          />
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Grids: {rack.shelfCount}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Bins/Grid: {rack.binsPerShelf}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Total Bins: {rack.totalBins}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Occupied: {occupiedBins.length}
            </Typography>
          </Grid>
        </Grid>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Utilization: {utilization.toFixed(1)}%
          </Typography>
          <Box
            sx={{
              width: '100%',
              height: 8,
              backgroundColor: 'grey.300',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${utilization}%`,
                height: '100%',
                backgroundColor: utilization > 80 ? 'error.main' : 
                                utilization > 60 ? 'warning.main' : 'success.main',
              }}
            />
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Location Format: {currentWarehouse?.code || 'WH'}-{rack.floor}-R{String(rack.rackNumber || 1).padStart(2, '0')}-G01-A1 (Grid bins: A1, B1, C1... A2, B2, C2...)
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Tooltip title="View Details">
            <IconButton size="small" onClick={() => onViewDetails && onViewDetails(rack)} color="info">
              <InfoIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit Rack">
            <IconButton size="small" onClick={() => onEdit(rack)}>
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Rack">
            <IconButton size="small" onClick={() => onDelete(rack.id)} color="error">
              <DeleteIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Print Labels">
            <IconButton size="small" onClick={() => onPrint && onPrint(rack)}>
              <PrintIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function RackConfiguration() {
  const { currentWarehouse, racks, bins } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRack, setSelectedRack] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [rackForDetails, setRackForDetails] = useState(null);

  if (!currentWarehouse) {
    return (
      <Alert severity="warning">
        Please select a warehouse first before configuring racks.
      </Alert>
    );
  }

  const handleCreateRack= () => {
    setSelectedRack(null);
    setDialogOpen(true);
  };

  const handleEditRack = (rack) => {
    setSelectedRack(rack);
    setDialogOpen(true);
  };

  const handleDeleteRack = async (rackId) => {
    const rack = racks.find(r => r.id === rackId);
    const rackBins = bins.filter(bin => bin.rackId === rackId);
    const occupiedBins = rackBins.filter(bin => bin.currentQty > 0);

    if (occupiedBins.length > 0) {
      showError(`Cannot delete row. ${occupiedBins.length} bins contain products.`);
      return;
    }

    if (window.confirm(`Are you sure you want to delete row "${rack?.name}"? This will also delete all associated bins.`)) {
      try {
        await rackService.deleteRackStructure(currentWarehouse.id, rackId);
        showSuccess('Row deleted successfully');
      } catch (error) {
        showError(`Error deleting row: ${error.message}`);
      }
    }
  };

  const handlePrintLabels = async (rack) => {
    try {
      const rackBins = bins.filter(bin => bin.rackId === rack.id);
      
      if (rackBins.length === 0) {
        showError('No bins found for this row to print');
        return;
      }

      // Create print content
      const printContent = `
        <html>
          <head>
            <title>Row Labels - ${rack.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .rack-info { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; }
              .bins-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
              .bin-label { 
                border: 2px solid #000; 
                padding: 10px; 
                text-align: center; 
                page-break-inside: avoid;
                min-height: 80px;
                display: flex;
                flex-direction: column;
                justify-content: center;
              }
              .bin-code { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
              .bin-location { font-size: 12px; color: #666; }
              .bin-capacity { font-size: 10px; color: #999; }
              @media print {
                .no-print { display: none; }
                .bins-grid { grid-template-columns: repeat(3, 1fr); }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Row Labels</h1>
              <h2>${rack.name} - ${currentWarehouse?.name || 'Warehouse'}</h2>
            </div>
            
            <div class="rack-info">
              <strong>Row Information:</strong><br>
              Name: ${rack.name}<br>
              Floor: ${rack.floor}<br>
              Grids: ${rack.shelfCount}<br>
              Bins per Grid: ${rack.binsPerShelf}<br>
              Total Bins: ${rackBins.length}
            </div>
            
            <div class="bins-grid">
              ${rackBins.map(bin => `
                <div class="bin-label">
                  <div class="bin-code">${bin.code}</div>
                  <div class="bin-location">Grid ${bin.shelfLevel} - Position ${bin.position}</div>
                  <div class="bin-capacity">Capacity: ${bin.capacity}</div>
                </div>
              `).join('')}
            </div>
          </body>
        </html>
      `;

      // Open print window
      const printWindow = window.open('', '_blank');
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      showSuccess(`Print labels for row "${rack.name}" prepared`);
    } catch (error) {
      console.error('Error printing labels:', error);
      showError(`Error printing labels: ${error.message}`);
    }
  };

  const handleShowRackDetails = (rack) => {
    setRackForDetails(rack);
    setDetailsDialogOpen(true);
  };

  const handleSave = () => {
    setDialogOpen(false);
    setSelectedRack(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Row Configuration
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(e, newMode) => newMode && setViewMode(newMode)}
            size="small"
          >
            <ToggleButton value="cards">
              <CardViewIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table">
              <TableViewIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateRack}
          >
            Create Rack
          </Button>
        </Box>
      </Box>

      <Typography variant="body1" color="text.secondary" gutterBottom>
        Configure rows with the location format: WH-GF-R01-G01-A1 (Warehouse-Floor-Rack-Grid-Bin). Bins are named A1, B1, C1... for grid 1, A2, B2, C2... for grid 2, etc.
      </Typography>

      {racks.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          No rows configured yet. Create your first row to get started.
        </Alert>
      ) : (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Row Overview
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="primary">
                  {racks.length}
                </Typography>
                <Typography color="text.secondary">
                  Total Rows
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="secondary">
                  {bins.length}
                </Typography>
                <Typography color="text.secondary">
                  Total Bins
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">
                  {bins.filter(bin => bin.currentQty > 0).length}
                </Typography>
                <Typography color="text.secondary">
                  Occupied Bins
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {bins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0)}
                </Typography>
                <Typography color="text.secondary">
                  Total Capacity
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}

      <Typography variant="h6" gutterBottom>
        Configured Rows
      </Typography>
      
      {viewMode === 'table' ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Floor</TableCell>
                <TableCell>Grids</TableCell>
                <TableCell>Bins/Grid</TableCell>
                <TableCell>Total Bins</TableCell>
                <TableCell>Occupied</TableCell>
                <TableCell>Utilization</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {racks.map((rack) => {
                const rackBins = bins.filter(bin => bin.rackId === rack.id);
                const occupiedBins = rackBins.filter(bin => bin.currentQty > 0);
                const utilization = rackBins.length > 0 ? (occupiedBins.length / rackBins.length) * 100 : 0;
                
                return (
                  <TableRow key={rack.id}>
                    <TableCell>
                      <Box>
                        <Typography 
                          variant="subtitle1" 
                          fontWeight="bold"
                          sx={{ 
                            cursor: 'pointer',
                            color: 'primary.main',
                            '&:hover': {
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => handleShowRackDetails(rack)}
                        >
                          {rack.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {rack.code} • Click for details
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={rack.floor} size="small" color="primary" />
                    </TableCell>
                    <TableCell>{rack.shelfCount}</TableCell>
                    <TableCell>{rack.binsPerShelf}</TableCell>
                    <TableCell>{rackBins.length}</TableCell>
                    <TableCell>{occupiedBins.length}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {utilization.toFixed(1)}%
                        </Typography>
                        <Box
                          sx={{
                            width: 50,
                            height: 6,
                            backgroundColor: 'grey.300',
                            borderRadius: 1,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              width: `${utilization}%`,
                              height: '100%',
                              backgroundColor: utilization > 80 ? 'error.main' : 
                                              utilization > 60 ? 'warning.main' : 'success.main',
                            }}
                          />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => handleShowRackDetails(rack)} color="info">
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Rack">
                          <IconButton size="small" onClick={() => handleEditRack(rack)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Rack">
                          <IconButton size="small" onClick={() => handleDeleteRack(rack.id)} color="error">
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Print Labels">
                          <IconButton size="small" onClick={() => handlePrintLabels(rack)}>
                            <PrintIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Grid container spacing={3}>
          {racks.map((rack) => (
            <Grid item xs={12} sm={6} md={4} key={rack.id}>
              <RackCard
                rack={rack}
                onEdit={handleEditRack}
                onDelete={handleDeleteRack}
                onPrint={handlePrintLabels}
                onViewDetails={handleShowRackDetails}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <RackConfigurationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        rack={selectedRack}
        onSave={handleSave}
      />

      <RackDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        rack={rackForDetails}
        bins={bins}
      />
    </Box>
  );
}
