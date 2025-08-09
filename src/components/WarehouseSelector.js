import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Fab,
  CircularProgress,
  LinearProgress,
  Divider,
  Paper,
  Avatar,
  Stack
} from '@mui/material';
import {
  Business as WarehouseIcon,
  Add as AddIcon,
  LocationOn as LocationIcon,
  Settings as SettingsIcon,
  Check as CheckIcon,
  Inventory as InventoryIcon,
  ViewModule as RackIcon,
  Storage as BinIcon,
  TrendingUp as TrendingIcon,
  Dashboard as StatsIcon
} from '@mui/icons-material';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import WarehouseSetup from './WarehouseSetup';

export default function WarehouseSelector({ onWarehouseSelected }) {
  const { warehouses, currentWarehouse, setCurrentWarehouse, loading, racks, bins } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Enhanced debug logging with more detail
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('=== WarehouseSelector - Detailed Data Analysis ===');
      console.log('Warehouses:', warehouses?.length || 0);
      console.log('Racks total:', racks?.length || 0);
      console.log('Bins total:', bins?.length || 0);
      console.log('Current warehouse:', currentWarehouse?.id || 'none');
      console.log('Loading state:', loading);
      
      // Log all warehouse IDs
      console.log('Warehouse IDs:', warehouses?.map(w => w.id) || []);
      
      // Log all rack warehouseIds
      console.log('Rack warehouseIds:', racks?.map(r => r.warehouseId) || []);
      
      // Log all bin warehouseIds  
      console.log('Bin warehouseIds:', bins?.map(b => b.warehouseId) || []);
      
      // Log sample rack and bin data
      if (racks?.length > 0) {
        console.log('Sample rack:', racks[0]);
      }
      if (bins?.length > 0) {
        console.log('Sample bin:', bins[0]);
      }
      
      // Check for each warehouse what racks/bins it has
      warehouses?.forEach(warehouse => {
        const warehouseRacks = racks?.filter(rack => rack.warehouseId === warehouse.id) || [];
        const warehouseBins = bins?.filter(bin => bin.warehouseId === warehouse.id) || [];
        console.log(`Warehouse "${warehouse.name}" (${warehouse.id}):`, {
          racks: warehouseRacks.length,
          bins: warehouseBins.length,
          rackIds: warehouseRacks.map(r => r.id),
          binIds: warehouseBins.map(b => b.id)
        });
      });
      
      console.log('=== End Debug ===');
    }
  }, [warehouses, racks, bins, currentWarehouse, loading]);

  // Simplified re-render trigger
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [warehouses.length, racks.length, bins.length]);

  // Create a simple, reliable key for each warehouse
  const createWarehouseDataKey = (warehouseId) => {
    const stats = getWarehouseStats(warehouseId);
    return `${warehouseId}-${stats.rackCount}-${stats.binCount}-${stats.occupiedBins}-${refreshKey}`;
  };

  // Calculate warehouse statistics with enhanced error handling
  const getWarehouseStats = useMemo(() => {
    return (warehouseId) => {
      // Initialize default stats
      const defaultStats = {
        rackCount: 0,
        binCount: 0,
        occupiedBins: 0,
        totalCapacity: 0,
        utilizationPercent: 0
      };

      // Validate inputs
      if (!warehouseId) {
        console.warn('getWarehouseStats: No warehouseId provided');
        return defaultStats;
      }

      if (!Array.isArray(racks)) {
        console.warn('getWarehouseStats: racks is not an array:', racks);
        return defaultStats;
      }

      if (!Array.isArray(bins)) {
        console.warn('getWarehouseStats: bins is not an array:', bins);
        return defaultStats;
      }

      try {
        // Filter racks and bins for this warehouse - handle multiple possible field names
        const warehouseRacks = racks.filter(rack => {
          if (!rack) return false;
          
          // Check multiple possible field names for warehouse ID
          const rackWarehouseId = rack.warehouseId || rack.warehouse_id || rack.warehouse || rack.parentWarehouseId;
          return rackWarehouseId === warehouseId;
        });

        const warehouseBins = bins.filter(bin => {
          if (!bin) return false;
          
          // Check multiple possible field names for warehouse ID
          const binWarehouseId = bin.warehouseId || bin.warehouse_id || bin.warehouse || bin.parentWarehouseId;
          return binWarehouseId === warehouseId;
        });
        
        // Debug log the filtering results
        if (process.env.NODE_ENV === 'development') {
          console.log(`Filtering for warehouse ${warehouseId}:`);
          console.log('- Found racks:', warehouseRacks.length);
          console.log('- Found bins:', warehouseBins.length);
          if (warehouseRacks.length > 0) {
            console.log('- Sample rack:', warehouseRacks[0]);
          }
          if (warehouseBins.length > 0) {
            console.log('- Sample bin:', warehouseBins[0]);
          }
        }
        
        // Calculate occupied bins
        const occupiedBins = warehouseBins.filter(bin => {
          const qty = parseInt(bin?.currentQty || bin?.current_qty || bin?.quantity || 0);
          return qty > 0;
        }).length;

        // Calculate total capacity
        const totalCapacity = warehouseBins.reduce((sum, bin) => {
          const capacity = parseInt(bin?.capacity || bin?.max_capacity || bin?.maxCapacity || 0);
          return sum + (isNaN(capacity) ? 0 : capacity);
        }, 0);

        // Calculate utilization percentage
        const utilizationPercent = warehouseBins.length > 0 
          ? (occupiedBins / warehouseBins.length) * 100 
          : 0;

        const stats = {
          rackCount: warehouseRacks.length,
          binCount: warehouseBins.length,
          occupiedBins,
          totalCapacity,
          utilizationPercent: Math.round(utilizationPercent * 10) / 10 // Round to 1 decimal
        };

        // Debug log for development
        if (process.env.NODE_ENV === 'development') {
          console.log(`Final stats for warehouse ${warehouseId}:`, stats);
        }

        return stats;
      } catch (error) {
        console.error('Error calculating warehouse stats:', error);
        return defaultStats;
      }
    };
  }, [racks, bins, refreshKey]);

  // Validate warehouse data consistency
  const validateWarehouseData = (warehouse) => {
    if (!warehouse || !warehouse.id) {
      console.warn('Invalid warehouse data:', warehouse);
      return false;
    }
    return true;
  };

  // Enhanced warehouse selection with validation and data loading
  const handleWarehouseSelect = async (warehouse) => {
    if (!validateWarehouseData(warehouse)) {
      showError('Invalid warehouse data. Please refresh the page.');
      return;
    }

    try {
      console.log('Selecting warehouse:', warehouse.name, 'ID:', warehouse.id);
      
      // Set the warehouse and wait for it to complete
      await setCurrentWarehouse(warehouse);
      
      // Trigger a refresh to ensure stats are updated
      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 1000); // Give time for the listeners to set up
      
      showSuccess(`Selected warehouse: ${warehouse.name}`);
      onWarehouseSelected(warehouse);
    } catch (error) {
      console.error('Error selecting warehouse:', error);
      showError('Failed to select warehouse. Please try again.');
    }
  };

  const handleCreateNew = () => {
    setShowCreateDialog(true);
  };

  const handleWarehouseCreated = (newWarehouse) => {
    setShowCreateDialog(false);
    
    // Force a refresh after warehouse creation
    setTimeout(() => {
      setCurrentWarehouse(newWarehouse);
      showSuccess(`Warehouse "${newWarehouse.name}" created successfully!`);
      onWarehouseSelected(newWarehouse);
      setRefreshKey(prev => prev + 1);
    }, 500); // Small delay to ensure Firestore listeners pick up the new data
  };

  // Monitor current warehouse changes and refresh data
  useEffect(() => {
    if (currentWarehouse) {
      console.log('Current warehouse changed to:', currentWarehouse.name);
      // Small delay to ensure context has been updated
      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 500);
    }
  }, [currentWarehouse?.id]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        sx={{ 
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #667eea 100%)',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
            animation: 'pulse 3s ease-in-out infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 0.3 },
              '50%': { opacity: 0.6 },
            }
          }
        }}
      >
        <Box textAlign="center" color="white" position="relative" zIndex={1}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 3,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              mb: 3,
            }}
          >
            <CircularProgress 
              color="inherit" 
              size={80} 
              thickness={3}
              sx={{
                '& .MuiCircularProgress-circle': {
                  strokeLinecap: 'round',
                }
              }}
            />
          </Box>
          <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
            Loading Warehouses...
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.8 }}>
            Please wait while we fetch your warehouse data
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #667eea 100%)',
        py: 4,
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        }
      }}
    >
      <Box maxWidth="lg" mx="auto" px={3} position="relative" zIndex={1}>
        {/* Enhanced Header */}
        <Box textAlign="center" mb={6}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 3,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              mb: 3,
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.05)', opacity: 0.8 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              }
            }}
          >
            <WarehouseIcon sx={{ fontSize: 80, color: 'white' }} />
          </Box>
          <Typography 
            variant="h2" 
            component="h1" 
            gutterBottom 
            fontWeight="bold"
            sx={{ 
              color: 'white',
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              mb: 2
            }}
          >
            Warehouse Selection
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: 300,
              maxWidth: 600,
              mx: 'auto'
            }}
          >
            Choose your warehouse to access inventory management, rack configuration, and operations
          </Typography>
        </Box>

        {/* Enhanced No warehouses message */}
        {warehouses.length === 0 && (
          <Card 
            sx={{ 
              mb: 4,
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 8 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  p: 4,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  mb: 3,
                }}
              >
                <WarehouseIcon sx={{ fontSize: 64, color: 'white' }} />
              </Box>
              <Typography variant="h4" gutterBottom fontWeight="bold" color="primary">
                Welcome to Warehouse Management
              </Typography>
              <Typography variant="h6" color="text.secondary" mb={4} maxWidth={600} mx="auto">
                Get started by creating your first warehouse. You'll be able to configure racks, manage inventory, and handle putaway & pick operations.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={handleCreateNew}
                sx={{
                  py: 2,
                  px: 4,
                  fontSize: '1.1rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                Create Your First Warehouse
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Warehouses Grid */}
        {warehouses.length > 0 && (
          <Grid container spacing={4} mb={4} key={`warehouse-grid-${refreshKey}`}>
            {warehouses.map((warehouse) => {
              const stats = getWarehouseStats(warehouse.id);
              const isSelected = currentWarehouse?.id === warehouse.id;
              const dataKey = createWarehouseDataKey(warehouse.id);
              
              return (
                <Grid item xs={12} md={6} xl={4} key={dataKey}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      height: '100%',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: isSelected ? '3px solid' : '2px solid',
                      borderColor: isSelected ? '#00e676 !important' : 'rgba(100, 181, 246, 0.6) !important',
                      background: isSelected 
                        ? 'linear-gradient(135deg, rgba(0, 230, 118, 0.25) 0%, rgba(30, 58, 138, 0.9) 100%) !important'
                        : 'linear-gradient(135deg, rgba(30, 58, 138, 0.9) 0%, rgba(51, 65, 85, 0.95) 100%) !important',
                      backdropFilter: 'blur(20px)',
                      boxShadow: isSelected 
                        ? '0 16px 48px rgba(0, 230, 118, 0.3), 0 8px 16px rgba(0, 0, 0, 0.2) !important' 
                        : '0 8px 32px rgba(0, 0, 0, 0.3) !important',
                      color: '#fff !important',
                      position: 'relative',
                      overflow: 'hidden',
                      '&::before': isSelected ? {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.1) 0%, rgba(102, 126, 234, 0.05) 100%)',
                        zIndex: 0,
                      } : {},
                      '&:hover': {
                        transform: 'translateY(-8px) scale(1.02)',
                        boxShadow: isSelected 
                          ? '0 20px 60px rgba(0, 230, 118, 0.4), 0 12px 24px rgba(0, 0, 0, 0.25) !important'
                          : '0 20px 60px rgba(100, 181, 246, 0.4), 0 12px 24px rgba(0, 0, 0, 0.35) !important',
                        borderColor: isSelected ? '#00e676 !important' : '#64b5f6 !important',
                        background: isSelected 
                          ? 'linear-gradient(135deg, rgba(0, 230, 118, 0.3) 0%, rgba(30, 58, 138, 0.95) 100%) !important'
                          : 'linear-gradient(135deg, rgba(30, 58, 138, 0.95) 0%, rgba(51, 65, 85, 1) 100%) !important',
                      },
                    }}
                    onClick={() => handleWarehouseSelect(warehouse)}
                  >
                    <CardContent sx={{ p: 0, height: '100%' }}>
                      {/* Header Section */}
                      <Box
                        sx={{
                          background: isSelected 
                            ? 'linear-gradient(135deg, #00e676 0%, #1e3a8a 100%) !important'
                            : 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%) !important',
                          p: 3,
                          borderRadius: '12px 12px 0 0',
                          position: 'relative',
                          overflow: 'hidden',
                          color: '#fff !important',
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 100,
                            height: 100,
                            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)',
                            transform: 'translate(30px, -30px)',
                          }
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                          <Avatar
                            sx={{
                              width: 56,
                              height: 56,
                              background: isSelected 
                                ? 'rgba(255, 255, 255, 0.25) !important' 
                                : 'rgba(255, 255, 255, 0.2) !important',
                              mr: 2,
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                              color: '#fff !important',
                            }}
                          >
                            <WarehouseIcon sx={{ fontSize: 32, color: '#fff !important' }} />
                          </Avatar>
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography 
                              variant="h5" 
                              component="h3" 
                              gutterBottom
                              sx={{ 
                                fontWeight: 'bold',
                                color: '#fff !important',
                                lineHeight: 1.2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                textShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                              }}
                            >
                              {warehouse.name}
                            </Typography>
                            {isSelected && (
                              <Chip
                                icon={<CheckIcon />}
                                label="Currently Selected"
                                size="small"
                                sx={{
                                  background: 'rgba(255, 255, 255, 0.25) !important',
                                  color: 'white !important',
                                  border: '1px solid rgba(255, 255, 255, 0.4)',
                                  fontWeight: 'bold',
                                  '& .MuiChip-icon': {
                                    color: '#fff !important',
                                  }
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      </Box>

                      {/* Content Section */}
                      <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* Location */}
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <LocationIcon sx={{ fontSize: 18, color: '#a5b4fc !important', mr: 1 }} />
                          <Typography variant="body2" sx={{ lineHeight: 1.4, color: '#e2e8f0 !important' }}>
                            {warehouse.address && typeof warehouse.address === 'object' 
                              ? `${warehouse.address.street || ''}, ${warehouse.address.city || ''}, ${warehouse.address.state || ''} ${warehouse.address.zipCode || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
                              : warehouse.address || 'No address specified'
                            }
                          </Typography>
                        </Box>

                        {/* Type */}
                        <Box sx={{ mb: 3 }}>
                          <Chip
                            label={warehouse.type ? warehouse.type.charAt(0).toUpperCase() + warehouse.type.slice(1) : 'General'}
                            size="small"
                            sx={{
                              backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
                              color: '#e2e8f0 !important',
                              border: '1px solid rgba(59, 130, 246, 0.5)',
                            }}
                          />
                        </Box>

                        {/* Enhanced Statistics Section */}
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle2" sx={{ color: '#a5b4fc !important', fontWeight: 'bold', mb: 2 }}>
                            WAREHOUSE OVERVIEW
                          </Typography>
                          
                          {/* Debug Info - Enhanced for troubleshooting */}
                          {process.env.NODE_ENV === 'development' && (
                            <Typography variant="caption" sx={{ color: '#64b5f6', display: 'block', mb: 1 }}>
                              Debug: WH={warehouse.id?.slice(-4)}, R={stats.rackCount}, B={stats.binCount}, O={stats.occupiedBins}, Key={dataKey.slice(-8)}
                              <br />Racks in context: {racks?.length || 0}, Bins in context: {bins?.length || 0}
                            </Typography>
                          )}
                          
                          {/* Main Stats Grid */}
                          <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={6}>
                              <Paper
                                sx={{
                                  p: 2,
                                  textAlign: 'center',
                                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                  color: 'white',
                                  borderRadius: 2,
                                }}
                              >
                                <RackIcon sx={{ fontSize: 20, mb: 0.5 }} />
                                <Typography variant="h6" fontWeight="bold">
                                  {stats.rackCount}
                                </Typography>
                                <Typography variant="caption">
                                  Rack{stats.rackCount !== 1 ? 's' : ''}
                                </Typography>
                              </Paper>
                            </Grid>
                            <Grid item xs={6}>
                              <Paper
                                sx={{
                                  p: 2,
                                  textAlign: 'center',
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: 'white',
                                  borderRadius: 2,
                                }}
                              >
                                <BinIcon sx={{ fontSize: 20, mb: 0.5 }} />
                                <Typography variant="h6" fontWeight="bold">
                                  {stats.binCount}
                                </Typography>
                                <Typography variant="caption">
                                  Bin{stats.binCount !== 1 ? 's' : ''}
                                </Typography>
                              </Paper>
                            </Grid>
                          </Grid>

                          {/* Data Loading Indicator */}
                          {(racks.length === 0 && bins.length === 0 && !loading) && (
                            <Box sx={{ textAlign: 'center', py: 2, mb: 2 }}>
                              <Typography variant="body2" sx={{ color: '#f59e0b !important', fontStyle: 'italic' }}>
                                ⚠️ No warehouse data loaded yet.
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8 !important' }}>
                                Data may still be syncing from the database.
                              </Typography>
                            </Box>
                          )}

                          {/* No Data Message */}
                          {stats.rackCount === 0 && stats.binCount === 0 && (
                            <Box sx={{ textAlign: 'center', py: 2, mb: 2 }}>
                              <Typography variant="body2" sx={{ color: '#a5b4fc !important', fontStyle: 'italic' }}>
                                No racks or bins configured yet.
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#94a3b8 !important' }}>
                                Configure racks and bins after selecting this warehouse.
                              </Typography>
                            </Box>
                          )}

                          {/* Utilization Section */}
                          {stats.binCount > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="body2" fontWeight="bold" sx={{ color: '#e2e8f0 !important' }}>
                                  Storage Utilization
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#a5b4fc !important' }}>
                                  {stats.utilizationPercent.toFixed(1)}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={stats.utilizationPercent}
                                sx={{
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                  '& .MuiLinearProgress-bar': {
                                    background: stats.utilizationPercent > 80 
                                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                      : stats.utilizationPercent > 60
                                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    borderRadius: 4,
                                  }
                                }}
                              />
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                <Typography variant="caption" sx={{ color: '#a5b4fc !important' }}>
                                  {stats.occupiedBins} occupied
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#a5b4fc !important' }}>
                                  {stats.binCount - stats.occupiedBins} available
                                </Typography>
                              </Box>
                            </Box>
                          )}

                          {/* Additional Stats */}
                          {stats.totalCapacity > 0 ? (
                            <Box>
                              <Stack direction="row" spacing={1} justifyContent="center">
                                <Chip
                                  icon={<StatsIcon />}
                                  label={`${stats.totalCapacity} Total Capacity`}
                                  size="small"
                                  sx={{
                                    backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
                                    color: '#e2e8f0 !important',
                                    border: '1px solid rgba(59, 130, 246, 0.5)',
                                    '& .MuiChip-icon': {
                                      color: '#a5b4fc !important',
                                    }
                                  }}
                                />
                              </Stack>
                            </Box>
                          ) : stats.binCount > 0 && (
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="caption" sx={{ color: '#94a3b8 !important', fontStyle: 'italic' }}>
                                Capacity not configured for bins
                              </Typography>
                            </Box>
                          )}
                        </Box>

                        {/* Action Button */}
                        <Button
                          fullWidth
                          variant={isSelected ? "contained" : "outlined"}
                          size="large"
                          sx={{
                            mt: 3,
                            py: 1.5,
                            fontWeight: 'bold',
                            ...(isSelected ? {
                              background: 'linear-gradient(135deg, #00e676 0%, #00c853 100%) !important',
                              color: '#fff !important',
                              border: 'none !important',
                              boxShadow: '0 4px 16px rgba(0, 230, 118, 0.4) !important',
                              '&:hover': {
                                background: 'linear-gradient(135deg, #00c853 0%, #00a848 100%) !important',
                                boxShadow: '0 6px 20px rgba(0, 230, 118, 0.5) !important',
                              }
                            } : {
                              borderColor: '#64b5f6 !important',
                              color: '#e2e8f0 !important',
                              backgroundColor: 'rgba(59, 130, 246, 0.15) !important',
                              '&:hover': {
                                background: 'rgba(59, 130, 246, 0.25) !important',
                                borderColor: '#90caf9 !important',
                                color: '#fff !important',
                              }
                            })
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWarehouseSelect(warehouse);
                          }}
                        >
                          {isSelected ? "✓ Currently Selected" : "Select Warehouse"}
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* Enhanced Create New Warehouse FAB */}
        {warehouses.length > 0 && (
          <Box sx={{ position: 'fixed', bottom: 32, right: 32 }}>
            <Fab
              color="primary"
              aria-label="create warehouse"
              onClick={handleCreateNew}
              sx={{ 
                width: 72, 
                height: 72,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                  transform: 'scale(1.1)',
                  boxShadow: '0 12px 40px rgba(102, 126, 234, 0.6)',
                },
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <AddIcon sx={{ fontSize: 32 }} />
            </Fab>
          </Box>
        )}

        {/* Create Warehouse Dialog */}
        <Dialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: { minHeight: '70vh' }
          }}
        >
          <DialogTitle>
            <Typography variant="h5" component="div">
              Create New Warehouse
            </Typography>
          </DialogTitle>
          <DialogContent>
            <WarehouseSetup 
              onComplete={handleWarehouseCreated}
              onCancel={() => setShowCreateDialog(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Debug Section - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Card sx={{ 
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              color: '#fff'
            }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  🔧 Debug Information
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Warehouses: {warehouses?.length || 0} | 
                  Racks: {racks?.length || 0} | 
                  Bins: {bins?.length || 0} | 
                  Loading: {loading ? 'Yes' : 'No'}
                </Typography>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={() => {
                    console.log('Manual refresh triggered');
                    setRefreshKey(prev => prev + 1);
                  }}
                  sx={{ 
                    borderColor: '#ffc107',
                    color: '#ffc107',
                    '&:hover': {
                      borderColor: '#ffeb3b',
                      color: '#ffeb3b',
                    }
                  }}
                >
                  Force Refresh
                </Button>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Box>
  );
}
