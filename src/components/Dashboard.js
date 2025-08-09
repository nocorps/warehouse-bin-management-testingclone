import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assignment as TaskIcon,
  Speed as PerformanceIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Schedule as PendingIcon,
  LocalShipping as ShippingIcon,
  Archive as StorageIcon,
  Analytics as AnalyticsIcon,
  Refresh as RefreshIcon,
  GetApp as ExportIcon,
  Error as ErrorIcon,
  ViewModule as RackIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { printService } from '../services/printService';

// Utility function to calculate metrics
const calculateMetrics = (bins, putAwayTasks, pickTasks) => {
  const totalBins = bins.length;
  const occupiedBins = bins.filter(bin => bin.currentQty > 0).length;
  const availableBins = bins.filter(bin => bin.status === 'available' && bin.currentQty === 0).length;
  const totalCapacity = bins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0);
  const totalOccupied = bins.reduce((sum, bin) => sum + (parseInt(bin.currentQty) || 0), 0);
  const utilizationRate = totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0;

  // Task metrics
  const pendingPutAway = putAwayTasks.filter(task => task.status === 'pending').length;
  const completedPutAway = putAwayTasks.filter(task => task.status === 'completed').length;
  const pendingPick = pickTasks.filter(task => task.status === 'pending').length;
  const completedPick = pickTasks.filter(task => task.status === 'completed').length;

  // Performance metrics (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentPutAway = putAwayTasks.filter(task => 
    task.completedAt && new Date(task.completedAt) >= sevenDaysAgo
  );
  const recentPick = pickTasks.filter(task => 
    task.completedAt && new Date(task.completedAt) >= sevenDaysAgo
  );

  // Low stock items (bins with less than 10% capacity)
  const lowStockBins = bins.filter(bin => 
    bin.currentQty > 0 && bin.capacity > 0 && (bin.currentQty / bin.capacity) < 0.1
  );

  // Expiring items (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  const expiringItems = bins.filter(bin => 
    bin.expiryDate && new Date(bin.expiryDate) <= thirtyDaysFromNow && bin.currentQty > 0
  );

  return {
    storage: {
      totalBins,
      occupiedBins,
      availableBins,
      utilizationRate,
      totalCapacity,
      totalOccupied,
    },
    tasks: {
      pendingPutAway,
      completedPutAway,
      pendingPick,
      completedPick,
      totalTasks: pendingPutAway + completedPutAway + pendingPick + completedPick,
    },
    performance: {
      putAwayCompletionRate: recentPutAway.length,
      pickCompletionRate: recentPick.length,
      avgPutAwayTime: recentPutAway.length > 0 ? 
        recentPutAway.reduce((sum, task) => {
          if (task.completedAt && task.createdAt) {
            return sum + (new Date(task.completedAt) - new Date(task.createdAt));
          }
          return sum;
        }, 0) / recentPutAway.length / 1000 / 60 : 0, // in minutes
    },
    alerts: {
      lowStockBins,
      expiringItems,
      urgentTasks: [...putAwayTasks, ...pickTasks].filter(task => 
        task.priority === 'high' && task.status === 'pending'
      ),
    },
  };
};

function StatCard({ title, value, subtitle, icon, color = 'primary', trend }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" color={color}>
              {value}
            </Typography>
            {subtitle && (
              <Typography color="textSecondary" variant="body2">
                {subtitle}
              </Typography>
            )}
            {trend && (
              <Box display="flex" alignItems="center" mt={1}>
                <TrendingUpIcon 
                  fontSize="small" 
                  color={trend > 0 ? 'success' : 'error'} 
                />
                <Typography 
                  variant="body2" 
                  color={trend > 0 ? 'success.main' : 'error.main'}
                  ml={0.5}
                >
                  {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Box color={`${color}.main`}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function UtilizationCard({ title, used, total, color = 'primary' }) {
  const percentage = total > 0 ? (used / total) * 100 : 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography color="textSecondary" gutterBottom variant="body2">
          {title}
        </Typography>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="h5">
            {used} / {total}
          </Typography>
          <Typography variant="h6" color={color}>
            {percentage.toFixed(1)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={percentage} 
          color={color}
          sx={{ height: 8, borderRadius: 4 }}
        />
        <Typography variant="body2" color="textSecondary" mt={1}>
          {total - used} available
        </Typography>
      </CardContent>
    </Card>
  );
}

function RecentTasksTable({ tasks, type }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in-progress': return 'warning';
      case 'pending': return 'default';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            {type === 'pick' && <TableCell>Order</TableCell>}
            {type === 'putaway' && <TableCell>SKU</TableCell>}
            <TableCell>Priority</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.slice(0, 5).map((task) => (
            <TableRow key={task.id}>
              <TableCell>{task.id.slice(0, 8)}</TableCell>
              {type === 'pick' && <TableCell>{task.orderNumber}</TableCell>}
              {type === 'putaway' && <TableCell>{task.sku}</TableCell>}
              <TableCell>
                <Chip 
                  label={task.priority} 
                  size="small"
                  color={getPriorityColor(task.priority)}
                />
              </TableCell>
              <TableCell>
                <Chip 
                  label={task.status} 
                  size="small"
                  color={getStatusColor(task.status)}
                />
              </TableCell>
              <TableCell>
                {new Date(task.createdAt?.toDate?.() || task.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AlertsSection({ bins, putAwayTasks, pickTasks }) {
  const alerts = useMemo(() => {
    const alertList = [];

    // Low capacity bins
    const lowCapacityBins = bins.filter(bin => {
      const utilization = bin.capacity > 0 ? (bin.currentQty / bin.capacity) * 100 : 0;
      return utilization > 90 && bin.currentQty > 0;
    });

    if (lowCapacityBins.length > 0) {
      alertList.push({
        type: 'warning',
        title: 'High Capacity Bins',
        message: `${lowCapacityBins.length} bins are over 90% capacity`,
        icon: <WarningIcon />,
      });
    }

    // Overdue tasks
    const overdueTasks = [...putAwayTasks, ...pickTasks].filter(task => {
      if (task.status === 'completed') return false;
      const created = new Date(task.createdAt?.toDate?.() || task.createdAt);
      const hoursOld = (Date.now() - created.getTime()) / (1000 * 60 * 60);
      return hoursOld > 24; // Consider overdue after 24 hours
    });

    if (overdueTasks.length > 0) {
      alertList.push({
        type: 'error',
        title: 'Overdue Tasks',
        message: `${overdueTasks.length} tasks are overdue`,
        icon: <WarningIcon />,
      });
    }

    // Empty zones
    const zonesWithBins = new Set(bins.filter(bin => bin.currentQty > 0).map(bin => bin.zoneId));
    const totalZones = new Set(bins.map(bin => bin.zoneId)).size;
    const emptyZones = totalZones - zonesWithBins.size;

    if (emptyZones > 0) {
      alertList.push({
        type: 'info',
        title: 'Empty Zones',
        message: `${emptyZones} zones have no inventory`,
        icon: <InventoryIcon />,
      });
    }

    return alertList;
  }, [bins, putAwayTasks, pickTasks]);

  if (alerts.length === 0) {
    return (
      <Alert 
        severity="success" 
        icon={<CheckCircleIcon fontSize="inherit" />}
      >
        No active alerts. All systems running smoothly.
      </Alert>
    );
  }

  return (
    <Box>
      {alerts.map((alert, index) => (
        <Alert 
          key={index}
          severity={alert.type}
          icon={alert.icon}
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2">{alert.title}</Typography>
          <Typography variant="body2">{alert.message}</Typography>
        </Alert>
      ))}
    </Box>
  );
}

export default function Dashboard() {
  const { 
    currentWarehouse, 
    racks, 
    bins, 
    putAwayTasks, 
    pickTasks, 
    loading 
  } = useWarehouse();

  const stats = useMemo(() => {
    if (!bins.length) {
      return {
        totalBins: 0,
        occupiedBins: 0,
        utilization: 0,
        totalCapacity: 0,
        totalOccupied: 0,
        availableBins: 0,
      };
    }

    const totalBins = bins.length;
    const occupiedBins = bins.filter(bin => bin.currentQty > 0).length;
    const totalCapacity = bins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0);
    const totalOccupied = bins.reduce((sum, bin) => sum + (parseInt(bin.currentQty) || 0), 0);
    
    return {
      totalBins,
      occupiedBins,
      availableBins: totalBins - occupiedBins,
      utilization: totalBins > 0 ? (occupiedBins / totalBins) * 100 : 0,
      capacityUtilization: totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0,
      totalCapacity,
      totalOccupied,
    };
  }, [bins]);

  const taskStats = useMemo(() => {
    const pendingPutAway = putAwayTasks.filter(task => task.status === 'pending').length;
    const pendingPick = pickTasks.filter(task => task.status === 'pending').length;
    const completedToday = [...putAwayTasks, ...pickTasks].filter(task => {
      if (task.status !== 'completed') return false;
      const completed = new Date(task.completedAt);
      const today = new Date();
      return completed.toDateString() === today.toDateString();
    }).length;

    return {
      pendingPutAway,
      pendingPick,
      completedToday,
      totalTasks: putAwayTasks.length + pickTasks.length,
    };
  }, [putAwayTasks, pickTasks]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <Typography>Loading dashboard...</Typography>
      </Box>
    );
  }

  if (!currentWarehouse) {
    return (
      <Alert severity="info">
        No warehouse selected. Please configure a warehouse first.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard - {currentWarehouse.name}
      </Typography>

      {/* Key Metrics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Racks"
            value={racks.length}
            subtitle={`${stats.totalBins} total bins`}
            icon={<RackIcon fontSize="large" />}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Occupied Bins"
            value={stats.occupiedBins}
            subtitle={`${stats.utilization.toFixed(1)}% utilization`}
            icon={<InventoryIcon fontSize="large" />}
            color="secondary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending Tasks"
            value={taskStats.pendingPutAway + taskStats.pendingPick}
            subtitle={`${taskStats.completedToday} completed today`}
            icon={<TaskIcon fontSize="large" />}
            color="warning"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Available Bins"
            value={stats.availableBins}
            subtitle={`${stats.totalCapacity - stats.totalOccupied} capacity available`}
            icon={<CheckCircleIcon fontSize="large" />}
            color="success"
          />
        </Grid>
      </Grid>

      {/* Utilization Charts */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <UtilizationCard
            title="Bin Utilization"
            used={stats.occupiedBins}
            total={stats.totalBins}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <UtilizationCard
            title="Capacity Utilization"
            used={stats.totalOccupied}
            total={stats.totalCapacity}
            color="secondary"
          />
        </Grid>
      </Grid>

      {/* Recent Activity and Alerts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Put-Away Tasks
            </Typography>
            {putAwayTasks.length > 0 ? (
              <RecentTasksTable tasks={putAwayTasks} type="putaway" />
            ) : (
              <Typography color="textSecondary">No put-away tasks found</Typography>
            )}
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Pick Tasks
            </Typography>
            {pickTasks.length > 0 ? (
              <RecentTasksTable tasks={pickTasks} type="pick" />
            ) : (
              <Typography color="textSecondary">No pick tasks found</Typography>
            )}
          </Paper>
        </Grid>
        
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              System Alerts
            </Typography>
            <AlertsSection 
              bins={bins}
              putAwayTasks={putAwayTasks}
              pickTasks={pickTasks}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
