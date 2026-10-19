import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppLayout from './AppLayout';

const PATHS = { Home: '', Search: 'search', Radio: 'radio', Library: 'library', Account: 'account' };
const Stack = createNativeStackNavigator();
const linking = { prefixes: [], config: { screens: PATHS } };

export default function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {Object.entries(PATHS).map(([name, path]) => (
          <Stack.Screen key={name} name={name}>{() => <AppLayout tab={path || 'home'} />}</Stack.Screen>
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
