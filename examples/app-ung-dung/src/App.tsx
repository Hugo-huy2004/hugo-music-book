import { StatusBar } from 'expo-status-bar';
import { HugoProvider } from 'hugo-music';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <HugoProvider scheme="system">
      <StatusBar style="auto" />
      <AppNavigator />
    </HugoProvider>
  );
}
