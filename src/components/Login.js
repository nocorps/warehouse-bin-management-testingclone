import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Paper,
  InputAdornment,
  IconButton,
  Divider,
  Grid,
  Chip,
  Stack,
  alpha,
  useTheme
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Email,
  Lock,
  Business as WarehouseIcon,
  AdminPanelSettings,
  Person
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { authService } from '../services/authService';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const theme = useTheme();

  const { control, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const quickLogin = (email, password) => {
    setValue('email', email);
    setValue('password', password);
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');

    try {
      const user = await authService.signIn(data.email, data.password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, 
          ${alpha('#1e40af', 0.85)} 0%, 
          ${alpha('#7c3aed', 0.85)} 50%, 
          ${alpha('#dc2626', 0.75)} 100%), 
          url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="50" cy="10" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="10" cy="60" r="1" fill="%23ffffff" opacity="0.1"/><circle cx="90" cy="40" r="1" fill="%23ffffff" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>')`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Animated Background Elements */}
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '30%',
          height: '60%',
          background: `linear-gradient(45deg, ${alpha('#ffffff', 0.1)}, transparent)`,
          borderRadius: '50%',
          animation: 'float 6s ease-in-out infinite'
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-15%',
          left: '-10%',
          width: '40%',
          height: '50%',
          background: `linear-gradient(-45deg, ${alpha('#ffffff', 0.05)}, transparent)`,
          borderRadius: '50%',
          animation: 'float 8s ease-in-out infinite reverse'
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={0} sx={{ minHeight: '100vh' }}>
          {/* Left Side - Branding */}
          <Grid 
            item 
            xs={12} 
            md={7} 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              color: 'white',
              p: { xs: 4, md: 6 }
            }}
          >
            <Box sx={{ maxWidth: 500 }}>
              <WarehouseIcon 
                sx={{ 
                  fontSize: { xs: 80, md: 120 }, 
                  mb: 3,
                  filter: 'drop-shadow(0 4px 20px rgba(255,255,255,0.3))'
                }} 
              />
              <Typography 
                variant="h2" 
                component="h1" 
                fontWeight="bold" 
                gutterBottom
                sx={{ 
                  fontSize: { xs: '2.5rem', md: '3.5rem' },
                  textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
              >
                Warehouse Management
              </Typography>
              <Typography 
                variant="h5" 
                sx={{ 
                  mb: 4, 
                  opacity: 0.9,
                  fontSize: { xs: '1.2rem', md: '1.5rem' },
                  textShadow: '0 1px 5px rgba(0,0,0,0.3)'
                }}
              >
                Advanced Inventory & Location Management System
              </Typography>
              
              {/* Feature Pills */}
              <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" gap={1}>
                <Chip 
                  label="Real-time Tracking" 
                  sx={{ 
                    bgcolor: alpha('#ffffff', 0.2), 
                    color: 'white',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(10px)'
                  }} 
                />
                <Chip 
                  label="Excel Integration" 
                  sx={{ 
                    bgcolor: alpha('#ffffff', 0.2), 
                    color: 'white',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(10px)'
                  }} 
                />
                <Chip 
                  label="Smart Allocation" 
                  sx={{ 
                    bgcolor: alpha('#ffffff', 0.2), 
                    color: 'white',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(10px)'
                  }} 
                />
              </Stack>
            </Box>
          </Grid>

          {/* Right Side - Login Form */}
          <Grid 
            item 
            xs={12} 
            md={5}
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              p: { xs: 2, md: 4 }
            }}
          >
            <Paper
              elevation={24}
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 4,
                background: `linear-gradient(135deg, 
                  ${alpha('#ffffff', 0.98)} 0%, 
                  ${alpha('#f8fafc', 0.95)} 100%)`,
                backdropFilter: 'blur(25px)',
                border: `1px solid ${alpha('#ffffff', 0.5)}`,
                maxWidth: 420,
                width: '100%',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)',
                color: '#1f2937',
                '& .MuiFormLabel-root': {
                  color: '#374151 !important',
                },
                '& .MuiInputBase-input': {
                  color: '#1f2937 !important',
                },
                '& .MuiSvgIcon-root': {
                  color: '#6b7280 !important',
                },
                '& .MuiTypography-root': {
                  color: '#1f2937 !important',
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(107, 114, 128, 0.3) !important',
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: 'linear-gradient(90deg, #1e40af, #7c3aed, #dc2626)',
                }
              }}
            >
              {/* Header */}
              <Box textAlign="center" mb={4}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.3)}`
                  }}
                >
                  <Lock sx={{ color: 'white', fontSize: 28 }} />
                </Box>
                <Typography 
                  variant="h5" 
                  component="h2" 
                  fontWeight="bold" 
                  gutterBottom
                  sx={{ color: '#1f2937' }}
                >
                  Welcome Back
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ color: '#6b7280' }}
                >
                  Please sign in to your account
                </Typography>
              </Box>

              {/* Error Alert */}
              {error && (
                <Alert 
                  severity="error" 
                  sx={{ 
                    mb: 3,
                    borderRadius: 2,
                    '& .MuiAlert-icon': {
                      alignItems: 'center'
                    }
                  }}
                >
                  {error}
                </Alert>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit(onSubmit)}>
                <Stack spacing={3}>
                  {/* Email Field */}
                  <Controller
                    name="email"
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
                        label="Email Address"
                        type="email"
                        error={!!errors.email}
                        helperText={errors.email?.message}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            transition: 'all 0.3s ease',
                            '& input': {
                              color: '#1f2937',
                            },
                            '&:hover': {
                              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.1)}`
                            },
                            '&.Mui-focused': {
                              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.2)}`
                            }
                          },
                          '& .MuiInputLabel-root': {
                            color: '#374151',
                          },
                          '& .MuiFormHelperText-root': {
                            color: '#6b7280',
                          },
                        }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Email sx={{ color: '#6b7280' }} />
                            </InputAdornment>
                          )
                        }}
                      />
                    )}
                  />

                  {/* Password Field */}
                  <Controller
                    name="password"
                    control={control}
                    rules={{
                      required: 'Password is required',
                      minLength: {
                        value: 6,
                        message: 'Password must be at least 6 characters'
                      }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        error={!!errors.password}
                        helperText={errors.password?.message}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            transition: 'all 0.3s ease',
                            '& input': {
                              color: '#1f2937',
                            },
                            '&:hover': {
                              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.1)}`
                            },
                            '&.Mui-focused': {
                              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.2)}`
                            }
                          },
                          '& .MuiInputLabel-root': {
                            color: '#374151',
                          },
                          '& .MuiFormHelperText-root': {
                            color: '#6b7280',
                          },
                        }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Lock sx={{ color: '#6b7280' }} />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={togglePasswordVisibility}
                                edge="end"
                                sx={{ 
                                  '&:hover': { 
                                    bgcolor: alpha(theme.palette.primary.main, 0.08) 
                                  }
                                }}
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          )
                        }}
                      />
                    )}
                  />

                  {/* Login Button */}
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    disabled={loading}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                      boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.3)}`,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.4)}`,
                        background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`
                      },
                      '&:disabled': {
                        background: theme.palette.action.disabledBackground,
                        transform: 'none',
                        boxShadow: 'none'
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </Stack>
              </form>

              <Divider sx={{ my: 4 }}>
                <Typography 
                  variant="caption" 
                  sx={{ color: '#6b7280', fontWeight: 500 }}
                >
                  Quick Login
                </Typography>
              </Divider>

              {/* Credentials - Updated with your specified credentials */}
              <Stack spacing={2}>
                <Card 
                  variant="outlined" 
                  sx={{ 
                    bgcolor: alpha('#3b82f6', 0.08),
                    border: `1px solid ${alpha('#3b82f6', 0.3)}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      bgcolor: alpha('#3b82f6', 0.15),
                      transform: 'translateY(-1px)',
                      boxShadow: `0 4px 20px ${alpha('#3b82f6', 0.2)}`
                    }
                  }}
                  onClick={() => quickLogin('admin@whs.com', 'Aaaa@1234')}
                >
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: theme.palette.primary.main,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <AdminPanelSettings sx={{ color: 'white', fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography 
                          variant="subtitle2" 
                          fontWeight="bold"
                          sx={{ color: '#1f2937' }}
                        >
                          Master Admin
                        </Typography>
                        <Typography 
                          variant="caption" 
                          sx={{ color: '#6b7280' }}
                        >
                          admin@whs.com
                        </Typography>
                      </Box>
                      <Chip 
                        label="Full Access" 
                        size="small" 
                        color="primary" 
                        sx={{ fontWeight: 'bold' }}
                      />
                    </Box>
                  </CardContent>
                </Card>

                <Grid container spacing={1}>
                  {[
                    { email: 'user1@whs.com', label: 'User 1' },
                    // { email: 'user2@whs.com', label: 'User 2' },
                    // { email: 'user3@whs.com', label: 'User 3' },
                    // { email: 'user4@whs.com', label: 'User 4' }
                  ].map((user, index) => (
                    <Grid item xs={6} key={index}>
                      <Card 
                        variant="outlined" 
                        sx={{ 
                          bgcolor: alpha('#10b981', 0.08),
                          border: `1px solid ${alpha('#10b981', 0.3)}`,
                          borderRadius: 2,
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            bgcolor: alpha('#10b981', 0.15),
                            transform: 'translateY(-1px)',
                            boxShadow: `0 4px 20px ${alpha(theme.palette.secondary.main, 0.15)}`
                          }
                        }}
                        onClick={() => quickLogin(user.email, 'Aaaa@1234')}
                      >
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                bgcolor: theme.palette.secondary.main,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Person sx={{ color: 'white', fontSize: 16 }} />
                            </Box>
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                              <Typography 
                                variant="caption" 
                                fontWeight="bold" 
                                noWrap
                                sx={{ color: '#1f2937' }}
                              >
                                {user.label}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                display="block" 
                                noWrap
                                sx={{ color: '#6b7280' }}
                              >
                                {user.email}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Stack>

              {/* Footer */}
              <Box textAlign="center" mt={4}>
                <Typography 
                  variant="caption" 
                  sx={{ color: '#6b7280' }}
                >
                  Warehouse Management System v-1.0
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* CSS Animations */}
      <style>
        {`
          @keyframes float {
            0%, 100% {
              transform: translateY(0px) rotate(0deg);
            }
            50% {
              transform: translateY(-20px) rotate(2deg);
            }
          }
        `}
      </style>
    </Box>
  );
}