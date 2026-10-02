import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  type SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDownward,
  ArrowUpward,
  CheckCircle as CheckCircleIcon,
  Clear as ClearIcon,
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FilterList as FilterListIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';

import { apiClient } from '../api/client';
import { TransactionSkeleton } from '../components/LoadingSkeleton';
import type { Transaction } from '../types';

interface Filters {
  category: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
}

interface SortConfig {
  key: 'date' | 'amount';
  direction: 'asc' | 'desc';
}

interface EditForm {
  description: string;
  amount: string;
  date: string;
  category: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    category: '',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: '',
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'date',
    direction: 'desc',
  });

  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    description: '',
    amount: '',
    date: '',
    category: '',
  });

  const clearFeedback = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await apiClient.get<Transaction[]>('/transactions/');
      setTransactions(response.data);
      setError(null);
    } catch {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await apiClient.get<string[]>('/transactions/categories');
      setCategories(response.data);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void fetchTransactions();
    void fetchCategories();
  }, [fetchTransactions, fetchCategories]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = [...transactions];

    if (query) {
      result = result.filter((t) => {
        const category = (t.category || '').toLowerCase();
        return t.description.toLowerCase().includes(query) || category.includes(query);
      });
    }

    if (filters.category) {
      result = result.filter((t) => t.category === filters.category);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      result = result.filter((t) => new Date(t.date).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      result = result.filter((t) => new Date(t.date).getTime() <= end);
    }

    if (filters.minAmount) {
      result = result.filter((t) => t.amount >= Number(filters.minAmount));
    }

    if (filters.maxAmount) {
      result = result.filter((t) => t.amount <= Number(filters.maxAmount));
    }

    result.sort((a, b) => {
      if (sortConfig.key === 'amount') {
        return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [transactions, searchQuery, filters, sortConfig]);

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredTransactions.slice(start, start + rowsPerPage);
  }, [filteredTransactions, page]);

  const pageCount = Math.ceil(filteredTransactions.length / rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filters, sortConfig]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearFeedback();
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post('/transactions/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        setSuccessMessage('Document uploaded and transactions refreshed');
        await fetchTransactions();
      } else {
        setError(response.data.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSort = (key: 'date' | 'amount') => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleFilterChange = (field: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      startDate: '',
      endDate: '',
      minAmount: '',
      maxAmount: '',
    });
    setSearchQuery('');
  };

  const openEditDialog = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setEditForm({
      description: transaction.description,
      amount: String(transaction.amount),
      date: format(new Date(transaction.date), 'yyyy-MM-dd'),
      category: transaction.category || transaction.llm_suggested_category || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditFieldChange = (field: keyof EditForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;

    clearFeedback();
    const transactionId = editingTransaction.id;
    const previous = [...transactions];

    const optimisticAmount = Number(editForm.amount);
    const optimisticDate = new Date(editForm.date).toISOString();

    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              description: editForm.description,
              amount: Number.isFinite(optimisticAmount) ? optimisticAmount : t.amount,
              date: optimisticDate,
              category: editForm.category || null,
              llm_suggested_category: editForm.category || undefined,
            }
          : t
      )
    );
    setEditDialogOpen(false);

    try {
      await apiClient.put(`/transactions/${transactionId}`, {
        description: editForm.description,
        amount: optimisticAmount,
        date: optimisticDate,
        category: editForm.category || null,
      });
      setSuccessMessage('Transaction updated');
    } catch {
      setTransactions(previous);
      setError('Failed to update transaction');
    }
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    clearFeedback();
    const previous = [...transactions];

    setTransactions((prev) => prev.filter((t) => t.id !== transaction.id));

    try {
      await apiClient.delete(`/transactions/${transaction.id}`);
      setSuccessMessage('Transaction deleted');
    } catch {
      setTransactions(previous);
      setError('Failed to delete transaction');
    }
  };

  if (loading) {
    return <TransactionSkeleton />;
  }

  return (
    <Box className="animate-fade-in">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          Transactions
        </Typography>
        <Button
          component="label"
          variant="contained"
          startIcon={<CloudUploadIcon />}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
          <input type="file" hidden onChange={handleFileUpload} accept=".pdf,.png,.jpg,.jpeg" />
        </Button>
      </Box>

      <Fade in={Boolean(successMessage)}>
        <Box>{successMessage ? <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert> : null}</Box>
      </Fade>
      <Fade in={Boolean(error)}>
        <Box>{error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}</Box>
      </Fade>

      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
            sx={{ flex: 1, minWidth: 240 }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            Filters
          </Button>
          {searchQuery || filters.category || filters.startDate || filters.endDate || filters.minAmount || filters.maxAmount ? (
            <Button variant="text" startIcon={<ClearIcon />} onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </Box>

        {showFilters ? (
          <Fade in={showFilters}>
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 170 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={filters.category}
                    label="Category"
                    onChange={(event: SelectChangeEvent) => handleFilterChange('category', event.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    {categories.map((category) => (
                      <MenuItem key={category} value={category}>
                        {category}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="From"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  label="To"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  label="Min"
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />

                <TextField
                  label="Max"
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                />
              </Box>
            </Box>
          </Fade>
        ) : null}
      </Paper>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {paginatedTransactions.length} of {filteredTransactions.length} transactions
        </Typography>
      </Box>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleSort('date')}>
                  Date
                  {sortConfig.key === 'date' ? (
                    sortConfig.direction === 'asc' ? (
                      <ArrowUpward fontSize="small" sx={{ ml: 0.5 }} />
                    ) : (
                      <ArrowDownward fontSize="small" sx={{ ml: 0.5 }} />
                    )
                  ) : null}
                </Box>
              </TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer' }}
                  onClick={() => handleSort('amount')}
                >
                  Amount
                  {sortConfig.key === 'amount' ? (
                    sortConfig.direction === 'asc' ? (
                      <ArrowUpward fontSize="small" sx={{ ml: 0.5 }} />
                    ) : (
                      <ArrowDownward fontSize="small" sx={{ ml: 0.5 }} />
                    )
                  ) : null}
                </Box>
              </TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              paginatedTransactions.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{format(new Date(row.date), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <Typography noWrap title={row.description}>
                      {row.description}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 600, color: row.amount >= 0 ? 'success.main' : 'text.primary' }}>
                      {row.amount >= 0 ? '+' : '-'}${Math.abs(row.amount).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {row.category ? (
                      <Chip size="small" label={row.category} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Uncategorized
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.is_duplicate ? (
                      <Chip size="small" color="warning" icon={<WarningIcon />} label="Duplicate" />
                    ) : row.category ? (
                      <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Categorized" />
                    ) : row.llm_suggested_category ? (
                      <Chip size="small" color="info" variant="outlined" label={`Suggested: ${row.llm_suggested_category}`} />
                    ) : (
                      <Chip size="small" variant="outlined" label="Pending" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEditDialog(row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => void handleDeleteTransaction(row)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pageCount > 1 ? (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      ) : null}

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Transaction</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => handleEditFieldChange('description', e.target.value)}
              fullWidth
            />
            <TextField
              label="Amount"
              type="number"
              value={editForm.amount}
              onChange={(e) => handleEditFieldChange('amount', e.target.value)}
              fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
            <TextField
              label="Date"
              type="date"
              value={editForm.date}
              onChange={(e) => handleEditFieldChange('date', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={editForm.category}
                label="Category"
                onChange={(event: SelectChangeEvent) => handleEditFieldChange('category', event.target.value)}
              >
                <MenuItem value="">Uncategorized</MenuItem>
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleSaveEdit()} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
