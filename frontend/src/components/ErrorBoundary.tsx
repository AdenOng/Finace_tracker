import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Typography, Button, Paper, Container } from '@mui/material';
import { Error as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: undefined, errorInfo: undefined });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Container maxWidth="md">
                    <Box
                        sx={{
                            minHeight: '100vh',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            py: 4,
                        }}
                    >
                        <Paper
                            elevation={3}
                            sx={{
                                p: 5,
                                textAlign: 'center',
                                maxWidth: 600,
                                borderRadius: 4,
                            }}
                        >
                            <ErrorIcon
                                sx={{
                                    fontSize: 80,
                                    color: 'error.main',
                                    mb: 3,
                                    opacity: 0.8,
                                }}
                            />
                            <Typography variant="h4" gutterBottom fontWeight="bold">
                                Something went wrong
                            </Typography>
                            <Typography color="text.secondary" sx={{ mb: 4 }}>
                                We apologize for the inconvenience. An unexpected error has occurred.
                            </Typography>
                            {this.state.error && (
                                <Box
                                    sx={{
                                        bgcolor: 'error.light',
                                        p: 2,
                                        borderRadius: 2,
                                        mb: 4,
                                        textAlign: 'left',
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        component="pre"
                                        sx={{
                                            fontFamily: 'monospace',
                                            color: 'error.dark',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {this.state.error.toString()}
                                    </Typography>
                                </Box>
                            )}
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<RefreshIcon />}
                                onClick={this.handleRetry}
                                sx={{ borderRadius: 3 }}
                            >
                                Reload Page
                            </Button>
                        </Paper>
                    </Box>
                </Container>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
