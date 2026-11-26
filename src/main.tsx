import {StrictMode, Component, ErrorInfo, ReactNode, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './index.css';
import { ErrorFallback } from './components/ui';
import {
  classifyStartupFailure,
  installStartupDiagnostics,
  markStartupMounted,
  recordStartupFailure,
} from './lib/startupDiagnostics';

installStartupDiagnostics();

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public props!: Props;
  public setState!: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const category = classifyStartupFailure(error, 'react');
    const entry = recordStartupFailure(category, error, 'ErrorBoundary');
    console.error(`[StartupDiagnostics:${entry.category}] Uncaught error:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}

function StartupMountMarker({ children }: { children: ReactNode }) {
  useEffect(() => {
    markStartupMounted();
  }, []);
  return <>{children}</>;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  const missingRootErr = new Error('Application mount root "#root" not found in document.');
  recordStartupFailure('react_mount_error', missingRootErr, 'main.tsx');
  throw missingRootErr;
}

try {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <StartupMountMarker>
          <App />
        </StartupMountMarker>
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  const category = classifyStartupFailure(err, 'react');
  recordStartupFailure(category, err, 'createRoot');
  throw err;
}

