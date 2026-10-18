// Một client Supabase dùng chung cho cả app. Publishable key an toàn để nằm trong app:
// nó chỉ làm được những gì chính sách RLS cho phép.
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: localStorage, // web: localStorage của trình duyệt; iOS/Android: bản localStorage của expo-sqlite
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web', // web: đọc phiên từ URL khi Google chuyển hướng về
      flowType: 'pkce',
    },
  },
);
