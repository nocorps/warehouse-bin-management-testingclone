import React, { useState, useEffect } from 'react';
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
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
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
  const { currentWarehouse, racks } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const isEdit = !!rack;
  
  const { control, handleSubmit, watch, reset, formState: { errors }, setError, clearErrors, setValue, trigger } = useForm({
    defaultValues: {
      name: rack?.name || '',
      floor: rack?.floor || 'GF',
      gridCount: rack?.gridCount || rack?.shelfCount || 3,
      levelsPerGrid: rack?.levelsPerGrid || ['A', 'B', 'C'],
      binsPerLevel: rack?.binsPerLevel || 3,
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

  // Auto-fill form when editing existing rack
  useEffect(() => {
    if (isEdit && rack) {
      reset({
        name: rack.name || '',
        floor: rack.floor || 'GF',
        gridCount: rack.gridCount || rack.shelfCount || 3,
        levelsPerGrid: rack.levelsPerGrid || ['A', 'B', 'C'],
        binsPerLevel: rack.binsPerLevel || 3,
        maxProductsPerBin: rack.maxProductsPerBin || 10,
        rackNumber: rack.rackNumber || 1,
        location: {
          aisle: rack.location?.aisle || '',
          section: rack.location?.section || ''
        },
        dimensions: {
          height: rack.dimensions?.height || '',
          width: rack.dimensions?.width || '',
          depth: rack.dimensions?.depth || ''
        }
      });
    }
  }, [isEdit, rack, reset]);

  const watchedValues = watch();

  // Auto-suggest next available rack number for new racks based on selected floor
  useEffect(() => {
    if (!isEdit && racks.length > 0 && watchedValues.floor) {
      const suggestedNumber = getNextSuggestedRackNumber(watchedValues.floor);
      setValue('rackNumber', suggestedNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racks, isEdit, setValue, watchedValues.floor]);

  // Helper function to get available rack numbers for a specific floor
  const getAvailableRackNumbers = (floor = null) => {
    const currentFloor = floor || watchedValues.floor || 'GF';
    const existingNumbers = racks
      .filter(r => r.floor === currentFloor)
      .map(r => parseInt(r.rackNumber) || 1)
      .sort((a, b) => a - b);
    const availableNumbers = [];
    
    // Find gaps in the sequence
    for (let i = 1; i <= Math.max(20, existingNumbers.length + 5); i++) {
      if (!existingNumbers.includes(i)) {
        availableNumbers.push(i);
      }
      if (availableNumbers.length >= 5) break; // Show max 5 suggestions
    }
    
    return availableNumbers;
  };

  // Helper function to suggest next rack number for a specific floor
  const getNextSuggestedRackNumber = (floor = null) => {
    const available = getAvailableRackNumbers(floor);
    const currentFloor = floor || watchedValues.floor || 'GF';
    const racksOnFloor = racks.filter(r => r.floor === currentFloor);
    return available.length > 0 ? available[0] : (racksOnFloor.length + 1);
  };

  const handleNext = () => {
    // Enhanced validation with immediate feedback
    if (Object.keys(errors).length > 0) {
      const errorMessages = Object.entries(errors).map(([field, error]) => {
        if (field === 'rackNumber' && error.message.includes('already exists')) {
          return `🚫 Rack Number Issue:\n${error.message}`;
        }
        return `⚠️ ${field}: ${error.message}`;
      }).join('\n\n');
      
      showError(`Please fix the following validation errors:\n\n${errorMessages}`);
      return;
    }

    // Check if this is an edit and if we're reducing the rack size
    if (isEdit && rack && activeStep === 1) {
      const currentGridCount = rack.gridCount || rack.shelfCount || 0;
      const currentLevelsPerGrid = rack.levelsPerGrid || ['A', 'B', 'C'];
      const currentBinsPerLevel = rack.binsPerLevel || 3;
      const currentBinsPerGrid = currentLevelsPerGrid.length * currentBinsPerLevel;
      
      const newGridCount = watchedValues.gridCount;
      const newLevelsPerGrid = watchedValues.levelsPerGrid || ['A', 'B', 'C'];
      const newBinsPerLevel = watchedValues.binsPerLevel || 3;
      const newBinsPerGrid = newLevelsPerGrid.length * newBinsPerLevel;
      
      if (newGridCount < currentGridCount || newBinsPerGrid < currentBinsPerGrid) {
        const currentTotal = currentGridCount * currentBinsPerGrid;
        const newTotal = newGridCount * newBinsPerGrid;
        const binsToRemove = currentTotal - newTotal;
        
        const confirmed = window.confirm(
          `⚠️ RACK SIZE REDUCTION WARNING\n\n` +
          `You are reducing rack "${rack.name}" from:\n` +
          `• Current: ${currentGridCount} grids × ${currentLevelsPerGrid.length} levels × ${currentBinsPerLevel} bins per level = ${currentTotal} total bins\n` +
          `• New: ${newGridCount} grids × ${newLevelsPerGrid.length} levels × ${newBinsPerLevel} bins per level = ${newTotal} total bins\n\n` +
          `This will REMOVE ${binsToRemove} bin location(s).\n\n` +
          `⚠️ IMPORTANT: Make sure NO PRODUCTS are stored in the bins that will be removed!\n\n` +
          `The system will check for products and prevent the update if any bins contain inventory.\n\n` +
          `Do you want to continue?`
        );
        if (!confirmed) {
          return;
        }
      }
    }

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
    
    // Generate sample location codes with new hierarchical format
    const sampleLocations = [];
    const levelsPerGrid = data.levelsPerGrid || ['A', 'B', 'C'];
    const binsPerLevel = data.binsPerLevel || 3;
    
    for (let grid = 1; grid <= Math.min(2, data.gridCount); grid++) {
      for (let levelIndex = 0; levelIndex < Math.min(2, levelsPerGrid.length); levelIndex++) {
        const level = levelsPerGrid[levelIndex];
        for (let position = 1; position <= Math.min(2, binsPerLevel); position++) {
          const locationCode = rackService.generateLocationCode(
            warehouseCode,
            data.floor,
            data.rackNumber,
            grid,
            level,
            position
          );
          sampleLocations.push({
            grid,
            level,
            position,
            locationCode
          });
        }
      }
    }

    const totalBinsPerGrid = levelsPerGrid.length * binsPerLevel;
    const totalBins = data.gridCount * totalBinsPerGrid;

    setPreviewData({
      ...data,
      warehouseCode,
      levelsPerGrid,
      binsPerLevel,
      binsPerGrid: totalBinsPerGrid,
      totalBins,
      totalCapacity: totalBins * data.maxProductsPerBin,
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

    // Double-check for duplicate rack number before saving
    const numValue = parseInt(data.rackNumber);
    const currentFloor = data.floor;
    
    if (!isEdit) {
      // For new rack creation
      const existing = racks.find(r => parseInt(r.rackNumber) === numValue && r.floor === currentFloor);
      if (existing) {
        const availableNumbers = getAvailableRackNumbers().slice(0, 3);
        const suggestions = availableNumbers.map(n => `R${String(n).padStart(2, '0')}`).join(', ');
        showError(`❌ Cannot create rack: R${String(numValue).padStart(2, '0')} already exists on floor "${currentFloor}" in "${existing.name}"!\n\n💡 Available on ${currentFloor}: ${suggestions}`);
        return;
      }
    } else if (rack) {
      // For rack editing
      const existing = racks.find(r => parseInt(r.rackNumber) === numValue && r.floor === currentFloor && r.id !== rack.id);
      if (existing) {
        const availableNumbers = getAvailableRackNumbers().slice(0, 3);
        const suggestions = availableNumbers.map(n => `R${String(n).padStart(2, '0')}`).join(', ');
        showError(`❌ Cannot update rack: R${String(numValue).padStart(2, '0')} already exists on floor "${currentFloor}" in "${existing.name}"!\n\n💡 Available on ${currentFloor}: ${suggestions}`);
        return;
      }
    }

    try {
      setLoading(true);
      
      if (isEdit) {
        // Update existing rack
        const result = await rackService.updateRackStructure(currentWarehouse.id, rack.id, data);
        
        // Provide detailed feedback about what was updated
        let message = `✅ Row R${String(data.rackNumber).padStart(2, '0')} "${data.name}" updated successfully`;
        const changes = [];
        
        if (result.summary.changes) {
          if (result.summary.changes.binsAdded > 0) {
            changes.push(`${result.summary.changes.binsAdded} bins added`);
          }
          if (result.summary.changes.binsRemoved > 0) {
            changes.push(`${result.summary.changes.binsRemoved} bins removed`);
          }
          if (result.summary.changes.capacityUpdated) {
            changes.push(`bin capacity updated to ${data.maxProductsPerBin}`);
          }
          if (result.summary.changes.locationCodesUpdated) {
            changes.push('location codes updated');
          }
          
          if (changes.length > 0) {
            message += `\n\nChanges made:\n• ${changes.join('\n• ')}`;
          }
        }
        
        showSuccess(message);
      } else {
        // Create new rack
        const result = await rackService.createRackWithStructure(currentWarehouse.id, data);
        showSuccess(
          `✅ Row R${String(data.rackNumber).padStart(2, '0')} "${data.name}" created successfully!\n\n` +
          `Created:\n• ${result.summary.totalBins} bins across ${data.gridCount} grids\n• Total capacity: ${result.summary.totalBins * data.maxProductsPerBin} products`
        );
      }
      
      onSave();
      handleClose();
    } catch (error) {
      // Enhanced error handling with specific messages
      let errorMessage = error.message;
      
      if (errorMessage.includes('already exists')) {
        const suggestedNumbers = racks.map(r => r.rackNumber || 1).sort((a, b) => a - b);
        let nextAvailable = 1;
        for (const num of suggestedNumbers) {
          if (num === nextAvailable) {
            nextAvailable++;
          } else {
            break;
          }
        }
        errorMessage += `\n\n💡 Suggestion: Try using R${String(nextAvailable).padStart(2, '0')} instead.`;
      } else if (errorMessage.includes('contain products')) {
        errorMessage = `❌ Cannot reduce rack size!\n\n${errorMessage}\n\n💡 Solution: Please relocate products from these bins first, then try updating the rack again.`;
      }
      
      showError(`❌ Error ${isEdit ? 'updating' : 'creating'} rack:\n\n${errorMessage}`);
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isEdit ? (
            <>
              <EditIcon color="primary" />
              <Typography variant="h6">Edit Row Configuration</Typography>
              <Chip 
                label={`R${String(rack?.rackNumber || 1).padStart(2, '0')}`} 
                size="small" 
                color="primary" 
                variant="outlined"
              />
            </>
          ) : (
            <>
              <AddIcon color="primary" />
              <Typography variant="h6">Create New Row</Typography>
            </>
          )}
        </Box>
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
                    rules={{ required: 'Row name is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Row Name"
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
                    rules={{ 
                      required: 'Row number is required',
                      min: { value: 1, message: 'Minimum rack number is 1' },
                      max: { value: 99, message: 'Maximum rack number is 99 (format: R01-R99)' },
                      validate: (value) => {
                        const numValue = parseInt(value);
                        if (isNaN(numValue) || numValue < 1 || numValue > 99) {
                          return 'Please enter a valid rack number (1-99, format: R01-R99)';
                        }
                        
                        // Get current floor selection
                        const currentFloor = watchedValues.floor;
                        
                        if (!isEdit) {
                          // Check for new rack creation - same rack number on same floor
                          const existing = racks.find(r => parseInt(r.rackNumber) === numValue && r.floor === currentFloor);
                          if (existing) {
                            const availableNumbers = getAvailableRackNumbers().slice(0, 3);
                            const suggestions = availableNumbers.map(n => `R${String(n).padStart(2, '0')}`).join(', ');
                            return `❌ Rack R${String(numValue).padStart(2, '0')} already exists on floor "${currentFloor}" in "${existing.name}"!\n\n💡 Available on ${currentFloor}: ${suggestions}`;
                          }
                        } else {
                          // Check for editing existing rack - same rack number on same floor (excluding current rack)
                          const existing = racks.find(r => parseInt(r.rackNumber) === numValue && r.floor === currentFloor && r.id !== rack.id);
                          if (existing) {
                            const availableNumbers = getAvailableRackNumbers().slice(0, 3);
                            const suggestions = availableNumbers.map(n => `R${String(n).padStart(2, '0')}`).join(', ');
                            return `❌ Rack R${String(numValue).padStart(2, '0')} already exists on floor "${currentFloor}" in "${existing.name}"!\n\n💡 Available on ${currentFloor}: ${suggestions}`;
                          }
                        }
                        return true;
                      }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Row Number"
                        type="number"
                        inputProps={{ 
                          min: 1, 
                          max: 99,
                          step: 1
                        }}
                        fullWidth
                        error={!!errors.rackNumber}
                        helperText={
                          errors.rackNumber?.message || 
                          (isEdit 
                            ? `Current: R${String(rack?.rackNumber || 1).padStart(2, '0')} • Enter number 1-99 for floor "${watchedValues.floor}"`
                            : `Will create: R${String(field.value || 1).padStart(2, '0')} on floor "${watchedValues.floor}" • Next available: ${(() => {
                                const availableNumbers = getAvailableRackNumbers(watchedValues.floor).slice(0, 3);
                                return availableNumbers.length > 0 ? availableNumbers.map(n => `R${String(n).padStart(2, '0')}`).join(', ') : 'None';
                              })()}`)
                        }
                        InputProps={{
                          startAdornment: <span style={{ color: '#1976d2', marginRight: '4px', fontWeight: 'bold', fontSize: '16px' }}>R</span>
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only allow numbers 1-99
                          if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 99)) {
                            field.onChange(e);
                            // Trigger validation immediately on change for real-time feedback
                            setTimeout(() => {
                              trigger('rackNumber');
                            }, 0);
                          }
                        }}
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
                        <Select 
                          {...field} 
                          label="Floor"
                          onChange={(e) => {
                            field.onChange(e);
                            // Trigger rack number validation when floor changes
                            setTimeout(() => {
                              trigger('rackNumber');
                            }, 0);
                          }}
                        >
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
                        helperText={errors.gridCount?.message || "Each grid will have multiple levels (A, B, C, etc.)"}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="levelsPerGrid"
                    control={control}
                    rules={{ 
                      required: 'Levels per grid is required',
                      validate: (value) => {
                        if (!Array.isArray(value) || value.length === 0) {
                          return 'At least one level is required';
                        }
                        return true;
                      }
                    }}
                    render={({ field }) => {
                      const allLevels = Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i));
                      
                      const handleLevelChange = (selectedLevel) => {
                        const currentSelected = field.value || [];
                        const levelIndex = allLevels.indexOf(selectedLevel);
                        
                        if (currentSelected.includes(selectedLevel)) {
                          // If level is already selected, remove it and all levels after it
                          const newSelected = allLevels.slice(0, levelIndex);
                          field.onChange(newSelected);
                        } else {
                          // If level is not selected, select all levels from A to this level
                          const newSelected = allLevels.slice(0, levelIndex + 1);
                          field.onChange(newSelected);
                        }
                      };

                      return (
                        <FormControl fullWidth error={!!errors.levelsPerGrid}>
                          <InputLabel>Levels per Grid</InputLabel>
                          <Select
                            {...field}
                            multiple
                            label="Levels per Grid"
                            value={field.value || []}
                            renderValue={(selected) => {
                              if (selected.length === 0) return '';
                              const first = selected[0];
                              const last = selected[selected.length - 1];
                              return selected.length === 1 ? first : `${first} - ${last} (${selected.length} levels)`;
                            }}
                          >
                            {allLevels.map((level, index) => {
                              const isSelected = (field.value || []).includes(level);
                              const isSelectable = index === 0 || (field.value || []).includes(allLevels[index - 1]);
                              
                              return (
                                <MenuItem 
                                  key={level} 
                                  value={level}
                                  onClick={() => handleLevelChange(level)}
                                  disabled={!isSelectable && !isSelected}
                                  sx={{
                                    opacity: !isSelectable && !isSelected ? 0.5 : 1,
                                    backgroundColor: isSelected ? 'action.selected' : 'transparent'
                                  }}
                                >
                                  <Checkbox checked={isSelected} />
                                  <span>Level {level}</span>
                                  {index === 0 && <span style={{ fontSize: '0.75em', color: 'text.secondary', marginLeft: 8 }}>(Ground)</span>}
                                  {index === (field.value || []).length - 1 && isSelected && (field.value || []).length > 1 && 
                                    <span style={{ fontSize: '0.75em', color: 'primary.main', marginLeft: 8 }}>(Top)</span>
                                  }
                                </MenuItem>
                              );
                            })}
                          </Select>
                          <FormHelperText>
                            {errors.levelsPerGrid?.message || 
                             `Select the highest level (A-Z). Selecting "J" automatically includes A through J. Currently: ${(field.value || []).length} levels selected.`}
                          </FormHelperText>
                        </FormControl>
                      );
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="binsPerLevel"
                    control={control}
                    rules={{ 
                      required: 'Bins per level is required',
                      min: { value: 1, message: 'Minimum 1 bin per level' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Bins per Level"
                        type="number"
                        fullWidth
                        error={!!errors.binsPerLevel}
                        helperText={errors.binsPerLevel?.message || "Number of positions within each level (1, 2, 3, etc.)"}
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
                <Typography variant="body1" gutterBottom>
                  <strong>Format:</strong> {currentWarehouse?.code || 'WH'}-{watchedValues.floor}-R{String(watchedValues.rackNumber || 1).padStart(2, '0')}-G{String(1).padStart(2, '0')}-A1
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Example Grid 1:</strong> {currentWarehouse?.code || 'WH'}-{watchedValues.floor}-R{String(watchedValues.rackNumber || 1).padStart(2, '0')}-G01-A1, A2, A3... (Level A positions)
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Example Grid 1:</strong> {currentWarehouse?.code || 'WH'}-{watchedValues.floor}-R{String(watchedValues.rackNumber || 1).padStart(2, '0')}-G01-B1, B2, B3... (Level B positions)
                </Typography>
                <Typography variant="body2" sx={{ color: 'info.dark', fontWeight: 'bold' }}>
                  Each grid has levels: {(watchedValues.levelsPerGrid || ['A', 'B', 'C']).join(', ')} • Each level has {watchedValues.binsPerLevel || 3} positions • Supports levels A-Z
                </Typography>
              </Alert>
            </StepContent>
          </Step>

          <Step>
            <StepLabel>Preview & Confirm</StepLabel>
            <StepContent>
              {previewData && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Configuration {isEdit ? 'Changes' : 'Summary'}
                  </Typography>
                  
                  {isEdit && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        📝 Changes Preview for Row R{String(rack?.rackNumber || 1).padStart(2, '0')} "{rack?.name}"
                      </Typography>
                      <Typography variant="body2">
                        <strong>Current:</strong> {rack?.gridCount || rack?.shelfCount || 0} grids × {rack?.binsPerGrid || rack?.binsPerShelf || 0} bins = {(rack?.gridCount || rack?.shelfCount || 0) * (rack?.binsPerGrid || rack?.binsPerShelf || 0)} total bins
                        <br />
                        <strong>New:</strong> {previewData.gridCount} grids × {previewData.binsPerGrid} bins = {previewData.totalBins} total bins
                        {previewData.totalBins > (rack?.totalBins || 0) && (
                          <span style={{ color: 'green' }}> (+{previewData.totalBins - (rack?.totalBins || 0)} bins will be added)</span>
                        )}
                        {previewData.totalBins < (rack?.totalBins || 0) && (
                          <span style={{ color: 'orange' }}> (-{(rack?.totalBins || 0) - previewData.totalBins} bins will be removed)</span>
                        )}
                      </Typography>
                    </Alert>
                  )}
                  
                  <TableContainer component={Paper} sx={{ mb: 2 }}>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell><strong>Row Name</strong></TableCell>
                          <TableCell>
                            {previewData.name}
                            {isEdit && rack?.name !== previewData.name && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Row Number</strong></TableCell>
                          <TableCell>
                            R{String(previewData.rackNumber).padStart(2, '0')}
                            {isEdit && rack?.rackNumber !== previewData.rackNumber && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Floor</strong></TableCell>
                          <TableCell>
                            {previewData.floor}
                            {isEdit && rack?.floor !== previewData.floor && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Grids</strong></TableCell>
                          <TableCell>
                            {previewData.gridCount}
                            {isEdit && (rack?.gridCount || rack?.shelfCount) !== previewData.gridCount && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Levels per Grid</strong></TableCell>
                          <TableCell>
                            {(previewData.levelsPerGrid || []).join(', ')} ({(previewData.levelsPerGrid || []).length} levels)
                            {isEdit && JSON.stringify(rack?.levelsPerGrid || ['A', 'B', 'C']) !== JSON.stringify(previewData.levelsPerGrid) && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Bins per Level</strong></TableCell>
                          <TableCell>
                            {previewData.binsPerLevel}
                            {isEdit && (rack?.binsPerLevel || 3) !== previewData.binsPerLevel && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Bins per Grid</strong></TableCell>
                          <TableCell>
                            {(previewData.levelsPerGrid || []).length} levels × {previewData.binsPerLevel} bins = {(previewData.levelsPerGrid || []).length * previewData.binsPerLevel} bins
                            {isEdit && (rack?.binsPerGrid || rack?.binsPerShelf) !== ((previewData.levelsPerGrid || []).length * previewData.binsPerLevel) && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Bins</strong></TableCell>
                          <TableCell>
                            {previewData.totalBins}
                            {isEdit && (rack?.totalBins || 0) !== previewData.totalBins && (
                              <Chip 
                                label={previewData.totalBins > (rack?.totalBins || 0) ? "Increased" : "Decreased"} 
                                size="small" 
                                color={previewData.totalBins > (rack?.totalBins || 0) ? "success" : "warning"} 
                                sx={{ ml: 1 }} 
                              />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Max Products per Bin</strong></TableCell>
                          <TableCell>
                            {previewData.maxProductsPerBin}
                            {isEdit && rack?.maxProductsPerBin !== previewData.maxProductsPerBin && (
                              <Chip label="Changed" size="small" color="warning" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Capacity</strong></TableCell>
                          <TableCell>
                            {previewData.totalCapacity} products
                            {isEdit && (rack?.totalBins || 0) * (rack?.maxProductsPerBin || 100) !== previewData.totalCapacity && (
                              <Chip 
                                label={previewData.totalCapacity > (rack?.totalBins || 0) * (rack?.maxProductsPerBin || 100) ? "Increased" : "Decreased"} 
                                size="small" 
                                color={previewData.totalCapacity > (rack?.totalBins || 0) * (rack?.maxProductsPerBin || 100) ? "success" : "warning"} 
                                sx={{ ml: 1 }} 
                              />
                            )}
                          </TableCell>
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
          {loading ? (isEdit ? 'Updating...' : 'Creating...') : (activeStep === 2 ? (isEdit ? 'Update Rack' : 'Create Rack') : 'Next')}
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
          {/* <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Number of Grids: {rack.shelfCount || 0}
            </Typography>
          </Grid> */}
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
          Location Format: {currentWarehouse?.code || 'WH'}1-{rack.floor}-R{String(rack.rackNumber || 1).padStart(2, '0')}-G01-A1 (Grid 1: A1, A2, A3... Grid 2: B1, B2, B3...)
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
        Configure rows with the location format: WH1-GF-R01-G01-A1 (Warehouse-Floor-Rack-Grid-Bin). Bins are named A1, A2, A3... for grid 1, B1, B2, B3... for grid 2, etc.
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
