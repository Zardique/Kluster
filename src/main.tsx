import { StrictMode, Component, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Error boundary component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: any): void {
    console.error('React error caught:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Log to an error tracking service in production
    if (import.meta.env.PROD) {
      // Here you would typically send to an error tracking service
      // Example: errorTrackingService.captureException(error);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          fontFamily: 'Arial, sans-serif',
          maxWidth: '800px',
          margin: '0 auto',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#dc3545' }}>Something went wrong</h2>
          <p>The application encountered an error. Please try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              backgroundColor: '#0d6efd',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Refresh Page
          </button>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Error Details</summary>
            <div style={{ 
              backgroundColor: '#f1f1f1', 
              padding: '10px', 
              borderRadius: '4px',
              marginTop: '10px',
              fontFamily: 'monospace'
            }}>
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// Find the root element and render the app
const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (error: any) {
    console.error('Error rendering React app:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #f8f9fa; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #dc3545;">Failed to start application</h2>
        <p>Sorry, the application could not be started. Please try again later.</p>
        <button onclick="window.location.reload()" style="background-color: #0d6efd; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
          Refresh Page
        </button>
        <details style="margin-top: 20px;">
          <summary style="cursor: pointer; font-weight: bold;">Error Details</summary>
          <pre style="background-color: #f1f1f1; padding: 10px; border-radius: 4px; margin-top: 10px; white-space: pre-wrap;">${error.message}\n${error.stack}</pre>
        </details>
      </div>
    `;
  }
} else {
  console.error('Root element not found');
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #f8f9fa; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <h2 style="color: #dc3545;">Application Error</h2>
      <p>The application could not find the root element to render into. Please check your HTML structure.</p>
      <button onclick="window.location.reload()" style="background-color: #0d6efd; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px;">
        Refresh Page
      </button>
    </div>
  `;
}
