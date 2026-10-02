import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    AppBar,
    Box,
    CssBaseline,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
    Button,
    Avatar,
    Divider,
    Tooltip,
    Badge,
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    Receipt as ReceiptIcon,
    Menu as MenuIcon,
    Logout as LogoutIcon,
    DarkMode as DarkModeIcon,
    LightMode as LightModeIcon,
    AccountCircle as AccountIcon,
    Notifications as NotificationsIcon,
    Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const drawerWidth = 280;

export default function Layout() {
    const { logout, userId } = useAuth();
    const { mode, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
        { text: 'Transactions', icon: <ReceiptIcon />, path: '/transactions' },
    ];

    const drawer = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Logo */}
            <Toolbar sx={{ px: 3 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        width: '100%',
                    }}
                >
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                        }}
                    >
                        <DashboardIcon />
                    </Box>
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Finance
                    </Typography>
                </Box>
            </Toolbar>

            <Divider sx={{ mx: 2 }} />

            {/* User Info */}
            <Box sx={{ p: 3 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        p: 2,
                        borderRadius: 3,
                        bgcolor: 'action.hover',
                    }}
                >
                    <Avatar
                        sx={{
                            width: 48,
                            height: 48,
                            bgcolor: 'primary.main',
                            fontWeight: 600,
                        }}
                    >
                        <AccountIcon />
                    </Avatar>
                    <Box sx={{ overflow: 'hidden' }}>
                        <Typography variant="subtitle2" fontWeight={600} noWrap>
                            User {userId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                            Premium Plan
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Divider sx={{ mx: 2, mb: 2 }} />

            {/* Navigation */}
            <List sx={{ flex: 1, px: 2 }}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 2, mb: 1, display: 'block', fontWeight: 600 }}
                >
                    MAIN MENU
                </Typography>
                {menuItems.map((item) => {
                    const isSelected = location.pathname === item.path;
                    return (
                        <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                onClick={() => navigate(item.path)}
                                selected={isSelected}
                                sx={{
                                    borderRadius: 2,
                                    py: 1.5,
                                    transition: 'all 0.2s',
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.light',
                                        color: 'primary.main',
                                        '&:hover': {
                                            bgcolor: 'primary.light',
                                        },
                                        '& .MuiListItemIcon-root': {
                                            color: 'primary.main',
                                        },
                                    },
                                    '&:hover': {
                                        bgcolor: 'action.hover',
                                    },
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: 40,
                                        color: isSelected ? 'primary.main' : 'text.secondary',
                                    }}
                                >
                                    {item.icon}
                                </ListItemIcon>
                                <ListItemText
                                    primary={item.text}
                                    primaryTypographyProps={{
                                        fontWeight: isSelected ? 600 : 500,
                                    }}
                                />
                                {isSelected && (
                                    <Box
                                        sx={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: '50%',
                                            bgcolor: 'primary.main',
                                        }}
                                    />
                                )}
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>

            <Divider sx={{ mx: 2, mt: 'auto' }} />

            {/* Bottom Actions */}
            <Box sx={{ p: 2 }}>
                <ListItem disablePadding>
                    <ListItemButton
                        onClick={toggleTheme}
                        sx={{
                            borderRadius: 2,
                            py: 1.5,
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                        </ListItemIcon>
                        <ListItemText
                            primary={mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
                            primaryTypographyProps={{ fontWeight: 500 }}
                        />
                    </ListItemButton>
                </ListItem>
                <ListItem disablePadding sx={{ mt: 1 }}>
                    <ListItemButton
                        onClick={logout}
                        sx={{
                            borderRadius: 2,
                            py: 1.5,
                            color: 'error.main',
                            '&:hover': {
                                bgcolor: 'error.light',
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
                            <LogoutIcon />
                        </ListItemIcon>
                        <ListItemText
                            primary="Logout"
                            primaryTypographyProps={{ fontWeight: 500 }}
                        />
                    </ListItemButton>
                </ListItem>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <CssBaseline />
            <AppBar
                position="fixed"
                elevation={0}
                sx={{
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    ml: { sm: `${drawerWidth}px` },
                    bgcolor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            edge="start"
                            onClick={handleDrawerToggle}
                            sx={{ mr: 2, display: { sm: 'none' } }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Typography
                            variant="h6"
                            noWrap
                            component="div"
                            sx={{
                                fontWeight: 600,
                                display: { xs: 'none', sm: 'block' },
                            }}
                        >
                            {menuItems.find((item) => item.path === location.pathname)?.text || 'Finance Tracker'}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Notifications">
                            <IconButton color="inherit" sx={{ color: 'text.secondary' }}>
                                <Badge badgeContent={3} color="error">
                                    <NotificationsIcon />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Settings">
                            <IconButton color="inherit" sx={{ color: 'text.secondary' }}>
                                <SettingsIcon />
                            </IconButton>
                        </Tooltip>
                        <Button
                            variant="outlined"
                            size="small"
                            sx={{
                                borderRadius: 2,
                                ml: 1,
                                display: { xs: 'none', sm: 'flex' },
                            }}
                        >
                            Help & Support
                        </Button>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box
                component="nav"
                sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
            >
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true,
                    }}
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: drawerWidth,
                            borderRight: 1,
                            borderColor: 'divider',
                        },
                    }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: drawerWidth,
                            borderRight: 1,
                            borderColor: 'divider',
                        },
                    }}
                    open
                >
                    {drawer}
                </Drawer>
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: 2, sm: 3 },
                    width: { sm: `calc(100% - ${drawerWidth}px)` },
                    bgcolor: 'background.default',
                    minHeight: '100vh',
                }}
            >
                <Toolbar />
                <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
}
