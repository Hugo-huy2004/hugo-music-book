// Worker chạy trên server của mình nên dùng secret key: bỏ qua RLS, ghi được vào mọi bảng và bucket.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env');

export const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
