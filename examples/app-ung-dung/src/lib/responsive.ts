import { useWindowDimensions } from 'react-native';
export const useIsMobile = () => useWindowDimensions().width < 768;
