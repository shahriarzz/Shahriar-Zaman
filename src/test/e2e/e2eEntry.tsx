import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import App from '../../App';
import { auth, isFirebaseEmulatorEnabled } from '../../lib/firebase';
import {
  getPendingCloudReconciliationFromDb,
  getAllBackupsFromDb,
} from '../../utils/fitnessBackupDb';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '../../index.css';
import { ErrorFallback } from '../../components/ui';

if (!isFirebaseEmulatorEnabled) {
  throw new Error('[GAINLOG E2E Harness] Refusing to boot e2eEntry outside VITE_FIREBASE_USE_EMULATOR=true mode.');
}

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class E2EErrorBoundary extends Component<Props, State> {
  public props!: Props;
  public setState!: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('E2E Uncaught error:', error, errorInfo);
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

(window as any).__GAINLOG_E2E__ = {
  auth: {
    async signInOrCreate(email: string, password = 'e2e-password-123') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return { uid: cred.user.uid, email: cred.user.email };
      } catch (err: any) {
        if (err?.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          return { uid: cred.user.uid, email: cred.user.email };
        }
        throw err;
      }
    },
    async signOut() {
      await fbSignOut(auth);
    },
    getCurrentUid() {
      return auth.currentUser?.uid ?? null;
    },
  },
  inspect: {
    getPendingCloudSync(uid: string) {
      return getPendingCloudReconciliationFromDb(uid);
    },
    getBackups() {
      return getAllBackupsFromDb();
    },
  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <E2EErrorBoundary>
      <App />
    </E2EErrorBoundary>
  </StrictMode>
);
