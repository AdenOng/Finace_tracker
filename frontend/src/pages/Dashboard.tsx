import { useEffect, useMemo, useState } from 'react';
import {
    Grid,
    Paper,
    Typography,
    Box,
    Card,
    CardContent,
    Chip,
    IconButton,
    Tooltip,
    Skeleton,
} from '@mui/material';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    BarChart,
    Bar,
} from 'recharts';
import {
    AccountBalance,
    TrendingUp,
    TrendingDown,
    Assessment,
    ArrowUpward,
    ArrowDownward,
    Refresh as RefreshIcon,
    Category as CategoryIcon,
} from '@mui/icons-material';
import { apiClient } from '../api/client';
import { StatCard } from '../components/StatCard';
import type { NetWorth, PortfolioSummary, Transaction } from '../types';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6'];

export default function Dashboard() {
    const navigate = useNavigate();
    const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = async (showRefreshing = false) => {
        if (showRefreshing) setRefreshing(true);
        try {
            const [netWorthRes, portfolioRes, transactionsRes] = await Promise.all([
                apiClient.get<NetWorth>('/portfolio/net-worth'),
                apiClient.get<PortfolioSummary>('/portfolio/value'),
                apiClient.get<Transaction[]>('/transactions/'),
            ]);
            setNetWorth(netWorthRes.data);
            setPortfolio(portfolioRes.data);
            setTransactions(transactionsRes.data);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRefresh = () => {
        fetchData(true);
    };

    const recentTransactions = useMemo(
        () => [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5),
        [transactions]
    );

    const cashFlowData = useMemo(() => {
        const now = new Date();
        const months = Array.from({ length: 6 }, (_, idx) => {
            const dt = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
            return {
                key: `${dt.getFullYear()}-${dt.getMonth()}`,
                month: format(dt, 'MMM'),
                amount: 0,
                income: 0,
            };
        });

        const monthMap = new Map(months.map((m) => [m.key, m]));
        transactions.forEach((transaction) => {
            const dt = new Date(transaction.date);
            const key = `${dt.getFullYear()}-${dt.getMonth()}`;
            const target = monthMap.get(key);
            if (!target) {
                return;
            }

            if (transaction.amount >= 0) {
                target.income += transaction.amount;
            } else {
                target.amount += Math.abs(transaction.amount);
            }
        });

        return months;
    }, [transactions]);

    const categoryData = useMemo(() => {
        const totals = new Map<string, number>();

        transactions.forEach((transaction) => {
            const label = transaction.category || transaction.llm_suggested_category || 'Uncategorized';
            const value = Math.abs(transaction.amount);
            totals.set(label, (totals.get(label) || 0) + value);
        });

        return [...totals.entries()]
            .map(([name, value], index) => ({
                name,
                value,
                color: COLORS[index % COLORS.length],
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);
    }, [transactions]);

    // Calculate trends (mock values - replace with real data)
    const netWorthTrend = 5.2;
    const assetTrend = 3.8;
    const liabilityTrend = -2.1;
    const portfolioTrend = 8.5;

    return (
        <Box className="animate-fade-in">
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3,
                }}
            >
                <Typography variant="h4" fontWeight="bold">
                    Dashboard
                </Typography>
                <Tooltip title="Refresh data">
                    <IconButton
                        onClick={handleRefresh}
                        disabled={refreshing}
                        sx={{
                            animation: refreshing ? 'spin 1s linear infinite' : 'none',
                        }}
                    >
                        <RefreshIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Stat Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Net Worth"
                        value={`$${netWorth?.net_worth.toFixed(2) ?? '0.00'}`}
                        icon={<AccountBalance />}
                        color="primary"
                        trend={{ value: netWorthTrend, label: 'from last month' }}
                        loading={loading}
                        className="animate-fade-in-up delay-1"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Total Assets"
                        value={`$${netWorth?.assets.toFixed(2) ?? '0.00'}`}
                        icon={<TrendingUp />}
                        color="success"
                        trend={{ value: assetTrend, label: 'from last month' }}
                        loading={loading}
                        className="animate-fade-in-up delay-2"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Liabilities"
                        value={`$${netWorth?.liabilities.toFixed(2) ?? '0.00'}`}
                        icon={<TrendingDown />}
                        color="error"
                        trend={{ value: liabilityTrend, label: 'from last month' }}
                        loading={loading}
                        className="animate-fade-in-up delay-3"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard
                        title="Portfolio Value"
                        value={`$${netWorth?.portfolio_value.toFixed(2) ?? '0.00'}`}
                        icon={<Assessment />}
                        color="info"
                        trend={{ value: portfolioTrend, label: 'from last month' }}
                        loading={loading}
                        className="animate-fade-in-up delay-4"
                    />
                </Grid>
            </Grid>

            {/* Charts Row */}
            <Grid container spacing={3}>
                {/* Portfolio Allocation Chart */}
                <Grid item xs={12} lg={5}>
                    <Paper
                        sx={{
                            p: 3,
                            height: 400,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        className="animate-fade-in-up delay-5"
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Assessment sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Portfolio Allocation
                            </Typography>
                        </Box>
                        {portfolio?.by_symbol && portfolio.by_symbol.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={portfolio.by_symbol}
                                        dataKey="value"
                                        nameKey="symbol"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        label={(entry) => `${entry.symbol}: $${entry.value.toFixed(0)}`}
                                    >
                                        {portfolio.by_symbol.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Value']}
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        }}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    flexDirection: 'column',
                                }}
                            >
                                <Typography color="text.secondary" sx={{ mb: 1 }}>
                                    No portfolio data available
                                </Typography>
                                <Chip
                                    label="Upload a broker statement to get started"
                                    color="primary"
                                    variant="outlined"
                                    size="small"
                                />
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Spending Trends Chart */}
                <Grid item xs={12} lg={7}>
                    <Paper
                        sx={{
                            p: 3,
                            height: 400,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        className="animate-fade-in-up delay-6"
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <TrendingUp sx={{ mr: 1, color: 'success.main' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Cash Flow Trends
                            </Typography>
                        </Box>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cashFlowData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <RechartsTooltip
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    name="Spending"
                                    stroke="#ef4444"
                                    fillOpacity={1}
                                    fill="url(#colorAmount)"
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="income"
                                    name="Income"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorIncome)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

                {/* Category Breakdown */}
                <Grid item xs={12} md={6}>
                    <Paper
                        sx={{
                            p: 3,
                            height: 350,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        className="animate-fade-in-up delay-6"
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <CategoryIcon sx={{ mr: 1, color: 'warning.main' }} />
                            <Typography variant="h6" fontWeight={600}>
                                Spending by Category
                            </Typography>
                        </Box>
                        {categoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={categoryData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={100}
                                        tick={{ fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <RechartsTooltip
                                        formatter={(value: number) => [`$${value}`, 'Amount']}
                                        contentStyle={{
                                            borderRadius: 8,
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography color="text.secondary">No category data available</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Recent Transactions */}
                <Grid item xs={12} md={6}>
                    <Card
                        sx={{
                            height: 350,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        className="animate-fade-in-up delay-6"
                    >
                        <CardContent sx={{ p: 3, flex: 1 }}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    mb: 2,
                                }}
                            >
                                <Typography variant="h6" fontWeight={600}>
                                    Recent Transactions
                                </Typography>
                                <Chip
                                    label="View All"
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => navigate('/transactions')}
                                />
                            </Box>
                            {loading ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {[...Array(5)].map((_, i) => (
                                        <Skeleton key={i} variant="rectangular" height={50} />
                                    ))}
                                </Box>
                            ) : recentTransactions.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                    {recentTransactions.map((transaction) => (
                                        <Box
                                            key={transaction.id}
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                p: 1.5,
                                                borderRadius: 2,
                                                bgcolor: 'action.hover',
                                                transition: 'background-color 0.15s',
                                                '&:hover': {
                                                    bgcolor: 'action.selected',
                                                },
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Box
                                                    sx={{
                                                        width: 40,
                                                        height: 40,
                                                        borderRadius: 2,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        bgcolor:
                                                            transaction.amount >= 0
                                                                ? 'success.light'
                                                                : 'error.light',
                                                        color:
                                                            transaction.amount >= 0
                                                                ? 'success.dark'
                                                                : 'error.dark',
                                                    }}
                                                >
                                                    {transaction.amount >= 0 ? (
                                                        <ArrowUpward fontSize="small" />
                                                    ) : (
                                                        <ArrowDownward fontSize="small" />
                                                    )}
                                                </Box>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {transaction.description}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {transaction.date
                                                            ? format(new Date(transaction.date), 'MMM dd, yyyy')
                                                            : 'N/A'}
                                                        {transaction.category && ` · ${transaction.category}`}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Typography
                                                variant="body2"
                                                fontWeight={600}
                                                sx={{
                                                    color: transaction.amount >= 0 ? 'success.main' : 'error.main',
                                                }}
                                            >
                                                {transaction.amount >= 0 ? '+' : '-'}
                                                ${Math.abs(transaction.amount).toFixed(2)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Box
                                    sx={{
                                        flex: 1,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Typography color="text.secondary">
                                        No recent transactions
                                    </Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
