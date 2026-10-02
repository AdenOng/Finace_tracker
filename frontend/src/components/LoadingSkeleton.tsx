import React from 'react';
import { Skeleton, Box, Grid, Card, CardContent } from '@mui/material';

interface StatCardSkeletonProps {
    count?: number;
}

export const StatCardSkeleton: React.FC<StatCardSkeletonProps> = ({ count = 4 }) => {
    return (
        <Grid container spacing={3}>
            {Array.from({ length: count }).map((_, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                    <Card>
                        <CardContent>
                            <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
                            <Skeleton variant="text" width="80%" height={40} />
                        </CardContent>
                    </Card>
                </Grid>
            ))}
        </Grid>
    );
};

export const ChartSkeleton: React.FC = () => {
    return (
        <Card sx={{ height: 400 }}>
            <CardContent>
                <Skeleton variant="text" width="40%" height={30} sx={{ mb: 2 }} />
                <Box
                    sx={{
                        height: 300,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Skeleton variant="circular" width={200} height={200} />
                </Box>
            </CardContent>
        </Card>
    );
};

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, columns = 5 }) => {
    return (
        <Card>
            <CardContent>
                <Skeleton variant="text" width="30%" height={40} sx={{ mb: 2 }} />
                <Box sx={{ mb: 2 }}>
                    <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
                </Box>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <Box key={rowIndex} sx={{ display: 'flex', gap: 2, mb: 1 }}>
                        {Array.from({ length: columns }).map((_, colIndex) => (
                            <Skeleton
                                key={colIndex}
                                variant="text"
                                width={`${100 / columns}%`}
                                height={40}
                            />
                        ))}
                    </Box>
                ))}
            </CardContent>
        </Card>
    );
};

interface DashboardSkeletonProps {
    statCount?: number;
}

export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ statCount = 4 }) => {
    return (
        <Box sx={{ animation: 'fadeIn 0.3s ease-out' }}>
            <Skeleton variant="text" width="200px" height={50} sx={{ mb: 3 }} />
            <StatCardSkeleton count={statCount} />
            <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} md={8}>
                    <ChartSkeleton />
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ height: 400 }}>
                        <CardContent>
                            <Skeleton variant="text" width="60%" height={30} sx={{ mb: 2 }} />
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                    <Skeleton variant="circular" width={40} height={40} />
                                    <Box sx={{ flex: 1 }}>
                                        <Skeleton variant="text" width="70%" height={20} />
                                        <Skeleton variant="text" width="40%" height={16} />
                                    </Box>
                                </Box>
                            ))}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export const TransactionSkeleton: React.FC = () => {
    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Skeleton variant="text" width={200} height={50} />
                <Skeleton variant="rectangular" width={150} height={40} sx={{ borderRadius: 2 }} />
            </Box>
            <TableSkeleton rows={8} columns={5} />
        </Box>
    );
};

export default {
    StatCard: StatCardSkeleton,
    Chart: ChartSkeleton,
    Table: TableSkeleton,
    Dashboard: DashboardSkeleton,
    Transaction: TransactionSkeleton,
};
