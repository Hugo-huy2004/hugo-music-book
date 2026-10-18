import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppLayout from './AppLayout';
import AdminScreen from '../screens/Admin/AdminScreen';


const Stack = createNativeStackNavigator();

// Route name → path. Five main destinations + accounts; old paths (before merging
// tab) remains so that the shared link does not die — AppLayout automatically resolves to the correct place (resolveTab).
const PATHS: Record<string, string> = {
  Home: '',
  Search: 'search',
  Radio: 'radio',
  Library: 'library',
  Account: 'account',
  New: 'new',
  Party: 'party',
  Genres: 'genres',
  Countries: 'countries',
  Songs: 'songs',
  Albums: 'albums',
  Artists: 'artists',
  Playlists: 'playlists',
  RecentlyAdded: 'recently-added',
};

const screenComponents: Record<string, React.FC> = {};
Object.entries(PATHS).forEach(([name, path]) => {
  const Component: React.FC = () => <AppLayout tab={path || 'home'} />;
  Component.displayName = `Route_${name}`;
  screenComponents[name] = Component;
});

const linking: LinkingOptions<any> = {
  prefixes: [],
  config: { screens: { ...PATHS, Admin: 'admin' } },
};

export default function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {Object.entries(PATHS).map(([name]) => (
          <Stack.Screen key={name} name={name} component={screenComponents[name]} />
        ))}
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
