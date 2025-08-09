import React, { useState, useEffect } from 'react';
import {
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Tabs,
  Tab,
  Box,
  IconButton,
  Alert,
  Snackbar,
  useMediaQuery,
  Drawer,
  List,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Menu,
  MenuItem,
  Avatar,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ViewModule as RackIcon,
  CallReceived as PutAwayIcon,
  CallMade as PickIcon,
  Settings as SettingsIcon,
  Brightness4,
  Brightness7,
  Menu as MenuIcon,
  Business as WarehouseIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
} from '@mui/icons-material';

// New Components
import Login from './components/Login';
import WarehouseSetup from './components/WarehouseSetup';
import WarehouseSelector from './components/WarehouseSelector';
import Dashboard from './components/Dashboard';
import PutAwayOperations from './components/PutAwayOperations_Restructured';
import PickOperations from './components/PickOperations_Restructured';
import RackConfiguration from './components/RackConfiguration_Restructured';
import Settings from './components/Settings';

// Context Providers
import { WarehouseProvider, useWarehouse } from './context/WarehouseContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Services
import { authService } from './services/authService_new';
import { warehouseService } from './services/warehouseService';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`warehouse-tabpanel-${index}`}
      aria-labelledby={`warehouse-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ 
          p: { xs: 1, sm: 2, md: 3 },
          pb: { xs: 10, md: 3 }, // Extra bottom padding for mobile bottom nav
        }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [showWarehouseSetup, setShowWarehouseSetup] = useState(false);
  
  const { notification, hideNotification } = useNotification();
  const { theme, darkMode, toggleDarkMode } = useTheme();
  const { currentWarehouse, setCurrentWarehouse } = useWarehouse();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    // Initialize demo users and check authentication state
    const init = async () => {
      try {
        // Initialize demo users in Firebase
        await authService.initializeDemoUsers();
      } catch (error) {
        console.error('Error initializing demo users:', error);
      }
    };

    init();

    // Check authentication state
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setUserMenuAnchor(null);
      setTabValue(0);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleWarehouseSelected = () => {
    setShowWarehouseSetup(false);
  };

  const handleSwitchWarehouse = () => {
    setShowWarehouseSetup(true);
    handleUserMenuClose();
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    if (isMobile) {
      setMobileDrawerOpen(false);
    }
  };

  const toggleMobileDrawer = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleUserMenuOpen = (event) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  // Define tabs based on user role
  const getTabs = () => {
    if (!user) return [];
    
    const commonTabs = [
      { label: 'Put Away', icon: <PutAwayIcon />, component: <PutAwayOperations />, showInBottomNav: true },
      { label: 'Pick Operations', icon: <PickIcon />, component: <PickOperations />, showInBottomNav: true },
    ];

    if (user.role === 'admin' || user.role === 'master') {
      return [
        { label: 'Dashboard', icon: <DashboardIcon />, component: <Dashboard />, showInBottomNav: true },
        { label: 'Row Config', icon: <RackIcon />, component: <RackConfiguration />, showInBottomNav: false },
        ...commonTabs,
        { label: 'Settings', icon: <SettingsIcon />, component: <Settings />, showInBottomNav: false },
      ];
    }

    return commonTabs;
  };

  const tabs = getTabs();

  // Loading state
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        sx={{ 
          background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' 
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <Box textAlign="center" color="white">
          <WarehouseIcon sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Loading Warehouse System...
          </Typography>
        </Box>
      </Box>
    );
  }

  // Not authenticated
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // No warehouse selected or switching warehouses
  if (!currentWarehouse || showWarehouseSetup) {
    return <WarehouseSelector onWarehouseSelected={handleWarehouseSelected} />;
  }

  return (
    <>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* App Bar */}
        <AppBar 
          position="static" 
          elevation={2}
          sx={{
            background: darkMode 
              ? 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' 
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <Toolbar>
            {isMobile && (
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={toggleMobileDrawer}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <WarehouseIcon sx={{ mr: 2 }} />
            <Typography 
              variant={isMobile ? "h6" : "h5"} 
              component="div" 
              sx={{ 
                flexGrow: 1,
                fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' },
                fontWeight: 600,
              }}
            >
              {isMobile ? 'WMS' : 'Warehouse Management System'}
            </Typography>
            
            {/* Current Warehouse Display */}
            <Typography 
              variant="caption" 
              sx={{ 
                mr: 2, 
                px: 1, 
                py: 0.5, 
                bgcolor: 'rgba(255,255,255,0.2)', 
                borderRadius: 1,
                display: { xs: 'none', md: 'block' }
              }}
            >
              {currentWarehouse?.name || 'No Warehouse'}
            </Typography>
            
            {/* User Role Badge */}
            <Typography 
              variant="caption" 
              sx={{ 
                mr: 2, 
                px: 1, 
                py: 0.5, 
                bgcolor: 'rgba(255,255,255,0.2)', 
                borderRadius: 1,
                display: { xs: 'none', sm: 'block' }
              }}
            >
              {user.role?.toUpperCase()}
            </Typography>
            
            {/* Dark Mode Toggle */}
            <IconButton
              color="inherit"
              onClick={toggleDarkMode}
              aria-label="toggle dark mode"
            >
              {darkMode ? <Brightness7 /> : <Brightness4 />}
            </IconButton>

            {/* User Menu */}
            <IconButton
              color="inherit"
              onClick={handleUserMenuOpen}
              sx={{ ml: 1 }}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.2)' }}>
                <PersonIcon />
              </Avatar>
            </IconButton>
            
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={handleUserMenuClose}
              PaperProps={{
                sx: { mt: 1, minWidth: 200 }
              }}
            >
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              </MenuItem>
              <MenuItem disabled>
                <Typography variant="caption" color="text.secondary">
                  Warehouse: {currentWarehouse?.name}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleSwitchWarehouse}>
                <WarehouseIcon sx={{ mr: 1 }} />
                Switch Warehouse
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <LogoutIcon sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/* Mobile Drawer */}
        <Drawer
          anchor="left"
          open={mobileDrawerOpen}
          onClose={toggleMobileDrawer}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: 280,
              boxSizing: 'border-box',
            },
          }}
        >
          <Box sx={{ p: 2, background: 'primary.main', color: 'white' }}>
            <Typography variant="h6" fontWeight="bold">
              Navigation
            </Typography>
            <Typography variant="caption">
              {user.name} ({user.role})
            </Typography>
          </Box>
          <Divider />
          <List>
            {tabs.map((tab, index) => (
              <ListItemButton
                key={index}
                selected={tabValue === index}
                onClick={() => handleTabChange(null, index)}
                sx={{
                  py: 1.5,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.light',
                    '&:hover': {
                      backgroundColor: 'primary.light',
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ color: tabValue === index ? 'primary.main' : 'inherit' }}>
                  {tab.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={tab.label}
                  primaryTypographyProps={{
                    fontWeight: tabValue === index ? 600 : 400,
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Drawer>

        {/* Main Content */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Container 
            maxWidth="xl" 
            sx={{ 
              mt: { xs: 1, sm: 2 }, 
              px: { xs: 1, sm: 2, md: 3 },
              flexGrow: 1,
            }}
          >
            {/* Desktop Tabs */}
            {!isMobile && tabs.length > 0 && (
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  aria-label="warehouse management tabs"
                  variant="standard"
                  sx={{
                    '& .MuiTab-root': {
                      minHeight: 64,
                      fontSize: { sm: '0.875rem', md: '1rem' },
                      fontWeight: 500,
                      textTransform: 'none',
                      minWidth: { sm: 120, md: 160 },
                    },
                  }}
                >
                  {tabs.map((tab, index) => (
                    <Tab
                      key={index}
                      icon={tab.icon}
                      label={tab.label}
                      iconPosition="start"
                    />
                  ))}
                </Tabs>
              </Box>
            )}

            {/* Tab Panels */}
            {tabs.map((tab, index) => (
              <TabPanel key={index} value={tabValue} index={index}>
                {tab.component}
              </TabPanel>
            ))}
          </Container>
        </Box>

        {/* Mobile Bottom Navigation */}
        {isMobile && tabs.length > 0 && (
          <Paper 
            sx={{ 
              position: 'fixed', 
              bottom: 0, 
              left: 0, 
              right: 0, 
              zIndex: 1000,
              borderTop: 1,
              borderColor: 'divider',
            }} 
            elevation={8}
          >
            <BottomNavigation
              value={tabs.findIndex((tab, index) => index === tabValue && tab.showInBottomNav)}
              onChange={(event, newValue) => {
                const tabIndex = tabs.findIndex((tab, index) => tab.showInBottomNav && tabs.filter(t => t.showInBottomNav).indexOf(tab) === newValue);
                if (tabIndex !== -1) {
                  handleTabChange(null, tabIndex);
                }
              }}
              showLabels
              sx={{
                '& .MuiBottomNavigationAction-root': {
                  fontSize: '0.75rem',
                  minWidth: 'auto',
                  paddingTop: 1,
                },
              }}
            >
              {tabs.filter(tab => tab.showInBottomNav).map((tab, index) => (
                <BottomNavigationAction
                  key={index}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </BottomNavigation>
          </Paper>
        )}

        {/* Snackbar Notifications */}
        <Snackbar
          open={!!notification}
          autoHideDuration={6000}
          onClose={hideNotification}
          anchorOrigin={{ 
            vertical: 'bottom', 
            horizontal: isMobile ? 'center' : 'right' 
          }}
          sx={{
            bottom: isMobile ? 90 : 24, // Account for bottom navigation on mobile
          }}
        >
          {notification && (
            <Alert
              onClose={hideNotification}
              severity={notification.type}
              sx={{ 
                width: '100%',
                maxWidth: { xs: 300, sm: 400 },
              }}
              variant="filled"
            >
              {notification.message}
            </Alert>
          )}
        </Snackbar>
      </Box>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WarehouseProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </WarehouseProvider>
    </ThemeProvider>
  );
}

export default App;
