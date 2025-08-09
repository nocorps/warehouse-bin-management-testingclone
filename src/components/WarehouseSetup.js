import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress
} from '@mui/material';
import {
  Business as WarehouseIcon,
  LocationOn as LocationIcon,
  CheckCircle as CompleteIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';

const steps = [
  'Basic Information',
  'Location Details', 
  'Configuration',
  'Review & Create'
];

const warehouseTypes = [
  { value: 'distribution', label: 'Distribution Center' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'cold_storage', label: 'Cold Storage' },
  { value: 'general', label: 'General Purpose' }
];

export default function WarehouseSetup({ onComplete, onCancel }) {
  const { createWarehouse } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      name: '',
      code: '',
      type: 'general',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      contact: {
        phone: '',
        email: '',
        manager: ''
      },
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        language: 'en'
      }
    }
  });

  const watchedValues = watch();

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const warehouseData = {
        ...data,
        createdAt: new Date().toISOString(),
        isActive: true,
        setupCompleted: true
      };

      const newWarehouse = await createWarehouse(warehouseData);
      showSuccess('Warehouse created successfully!');
      onComplete?.(newWarehouse);
    } catch (error) {
      showError(`Error creating warehouse: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Warehouse name is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Warehouse Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    placeholder="e.g., Main Distribution Center"
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="code"
                control={control}
                rules={{ 
                  required: 'Warehouse code is required',
                  pattern: {
                    value: /^[A-Z0-9_-]+$/,
                    message: 'Only uppercase letters, numbers, hyphens and underscores allowed'
                  }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Warehouse Code"
                    error={!!errors.code}
                    helperText={errors.code?.message || 'Unique identifier (e.g., WH_001)'}
                    placeholder="WH_001"
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Warehouse Type</InputLabel>
                    <Select {...field} label="Warehouse Type">
                      {warehouseTypes.map((type) => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
          </Grid>
        );

      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Controller
                name="address.street"
                control={control}
                rules={{ required: 'Street address is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Street Address"
                    error={!!errors.address?.street}
                    helperText={errors.address?.street?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="address.city"
                control={control}
                rules={{ required: 'City is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="City"
                    error={!!errors.address?.city}
                    helperText={errors.address?.city?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="address.state"
                control={control}
                rules={{ required: 'State/Province is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="State/Province"
                    error={!!errors.address?.state}
                    helperText={errors.address?.state?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="address.zipCode"
                control={control}
                rules={{ required: 'ZIP/Postal code is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="ZIP/Postal Code"
                    error={!!errors.address?.zipCode}
                    helperText={errors.address?.zipCode?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="address.country"
                control={control}
                rules={{ required: 'Country is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Country"
                    error={!!errors.address?.country}
                    helperText={errors.address?.country?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Controller
                name="contact.manager"
                control={control}
                rules={{ required: 'Manager name is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Warehouse Manager"
                    error={!!errors.contact?.manager}
                    helperText={errors.contact?.manager?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Controller
                name="contact.phone"
                control={control}
                rules={{ required: 'Phone number is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Phone Number"
                    error={!!errors.contact?.phone}
                    helperText={errors.contact?.phone?.message}
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Controller
                name="contact.email"
                control={control}
                rules={{ 
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Contact Email"
                    type="email"
                    error={!!errors.contact?.email}
                    helperText={errors.contact?.email?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Warehouse Information
            </Typography>
            
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Basic Information
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography><strong>Name:</strong> {watchedValues.name}</Typography>
                  <Typography><strong>Code:</strong> {watchedValues.code}</Typography>
                  <Typography><strong>Type:</strong> {warehouseTypes.find(t => t.value === watchedValues.type)?.label}</Typography>
                </Box>
                
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Location
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography>{watchedValues.address?.street}</Typography>
                  <Typography>
                    {watchedValues.address?.city}, {watchedValues.address?.state} {watchedValues.address?.zipCode}
                  </Typography>
                  <Typography>{watchedValues.address?.country}</Typography>
                </Box>
                
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Contact Information
                </Typography>
                <Typography><strong>Manager:</strong> {watchedValues.contact?.manager}</Typography>
                <Typography><strong>Phone:</strong> {watchedValues.contact?.phone}</Typography>
                <Typography><strong>Email:</strong> {watchedValues.contact?.email}</Typography>
              </CardContent>
            </Card>
            
            <Alert severity="success">
              Everything looks good! Click "Create Warehouse" to complete the setup.
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 4, mb: 4, textAlign: 'center' }}>
        <WarehouseIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Warehouse Setup
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Let's set up your warehouse to get started with inventory management
        </Typography>
      </Paper>

      {/* Stepper */}
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel>
                  <Typography variant="h6">{label}</Typography>
                </StepLabel>
                <StepContent>
                  <Box sx={{ mb: 3 }}>
                    {renderStepContent(index)}
                  </Box>
                  
                  <Box sx={{ mb: 2 }}>
                    {activeStep === steps.length - 1 ? (
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : <CompleteIcon />}
                        size="large"
                      >
                        {loading ? 'Creating Warehouse...' : 'Create Warehouse'}
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        onClick={handleNext}
                        sx={{ mr: 1 }}
                      >
                        Continue
                      </Button>
                    )}
                    
                    {activeStep > 0 && (
                      <Button
                        onClick={handleBack}
                        disabled={loading}
                      >
                        Back
                      </Button>
                    )}
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </form>
      </Paper>

      {/* Help Text */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Note:</strong> Once your warehouse is created, you'll be able to configure racks, 
          set up bins, and start managing your inventory. The warehouse setup is a one-time process 
          that establishes the foundation for all warehouse operations.
        </Typography>
      </Alert>
    </Box>
  );
}
