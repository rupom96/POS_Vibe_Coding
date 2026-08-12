import { Provider } from 'react-redux';
import { AppRoutes } from './app/routes';
import { store } from './app/store';
import { ToastProvider } from './shared/components/Toast';

function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </Provider>
  );
}

export default App;
