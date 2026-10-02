import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Skeleton } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: 'primary' | 'success' | 'error' | 'warning' | 'info';
    trend?: {
        value: number;
        label: string;
    };
    loading?: boolean;
    className?: string;
}

const colorMap = {
    primary: {
        bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        light: 'rgba(99, 102, 241, 0.1)',
        main: '#6366f1',
    },
    success: {
        bg: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        light: 'rgba(16, 185, 129, 0.1)',
        main: '#10b981',
    },
    error: {
        bg: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
        light: 'rgba(239, 68, 68, 0.1)',
        main: '#ef4444',
    },
    warning: {
        bg: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        light: 'rgba(245, 158, 11, 0.1)',
        main: '#f59e0b',
    },
    info: {
        bg: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
        light: 'rgba(59, 130, 246, 0.1)',
        main: '#3b82f6',
    },
};

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtitle,
    icon,
    color,
    trend,
    loading,
    className,
}) => {
    if (loading) {
        return (
            <Card className={className}>
                <CardContent sx={{ p: 3 }}>
                    <Skeleton variant="text" width="60%" height={20} />
                    <Skeleton variant="text" width="80%" height={40} sx={{ mt: 1 }} />
                </CardContent>
            </Card>
        );
    }

    const colors = colorMap[color];

    return (
        <Card
            className={className}
            sx={{
                height: '100%',
                transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                '&:hover': {
                    transform: 'translateY(-4px)',
                },
            }}
        >
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 1, fontWeight: 500 }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                background: colors.bg,
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            {value}
                        </Typography>
                        {subtitle && (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 0.5, display: 'block' }}
                            >
                                {subtitle}
                            </Typography>
                        )}
                        {trend && (
                            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                    size="small"
                                    icon={trend.value >= 0 ? <TrendingUp /> : <TrendingDown />}
                                    label={`${trend.value >= 0 ? '+' : ''}${trend.value}% ${trend.label}`}
                                    sx={{
                                        bgcolor: trend.value >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: trend.value >= 0 ? '#10b981' : '#ef4444',
                                        fontWeight: 600,
                                        '& .MuiChip-icon': {
                                            color: 'inherit',
                                        },
                                    }}
                                />
                            </Box>
                        )}
                    </Box>
                    <Box
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: colors.bg,
                            color: 'white',
                            boxShadow: `0 4px 12px ${colors.light}`,
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};

export default StatCard;
