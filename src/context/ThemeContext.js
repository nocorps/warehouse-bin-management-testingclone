import React, { createContext, useContext, useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export function CustomThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);

  // No localStorage dependency - use system preference only
  useEffect(() => {
    // Check system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(systemPrefersDark);
  }, []);

  // Toggle theme without localStorage
  useEffect(() => {
    // No persistence needed
  }, [darkMode]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: darkMode ? '#90caf9' : '#1976d2',
      },
      secondary: {
        main: darkMode ? '#f48fb1' : '#dc004e',
      },
      background: {
        default: darkMode ? '#121212' : '#fafafa',
        paper: darkMode ? '#1e1e1e' : '#ffffff',
      },
      warning: {
        main: '#ff9800',
      },
      error: {
        main: '#f44336',
      },
      success: {
        main: '#4caf50',
      },
      info: {
        main: '#2196f3',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            transition: 'box-shadow 0.3s ease-in-out',
            '&:hover': {
              boxShadow: darkMode 
                ? '0 8px 16px rgba(255,255,255,0.1)' 
                : '0 8px 16px rgba(0,0,0,0.15)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: darkMode ? '#1e1e1e' : '#ffffff',
            color: darkMode ? '#ffffff' : '#000000',
          },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: 'none',
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: darkMode ? '#333' : '#f5f5f5',
              borderBottom: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${darkMode ? '#333' : '#e0e0e0'}`,
            },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            height: 8,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
      // Custom styles for warehouse-specific components
      MuiListItem: {
        styleOverrides: {
          root: {
            '&.warehouse-alert-item': {
              borderRadius: 8,
              margin: '4px 0',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateX(4px)',
              },
            },
          },
        },
      },
    },
  });

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const contextValue = {
    darkMode,
    toggleDarkMode,
    toggleTheme: toggleDarkMode,
    theme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

// Export as both names for compatibility
export { CustomThemeProvider as ThemeProvider };
