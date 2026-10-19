import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Sheet, TextField, ErrorText, ActionButton, useHugoTheme } from 'hugo-music';
import { useStore } from '../../store/useStore';

export default function LoginModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { colors } = useHugoTheme();
  const field = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, marginBottom: 12 };
  const { startPasswordlessLogin, loginPasswordless } = useStore(useShallow((s) => ({
    startPasswordlessLogin: s.startPasswordlessLogin, loginPasswordless: s.loginPasswordless })));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const send = () => run(async () => { await startPasswordlessLogin(email.trim()); setStep('code'); });
  const verify = () => run(async () => { await loginPasswordless(email.trim(), code.trim()); onClose(); });

  return (
    <Sheet visible={visible} title={step === 'email' ? 'Đăng nhập' : 'Nhập mã'} onClose={onClose}>
      {step === 'email' ? (
        <TextField value={email} onChangeText={setEmail} placeholder="Email" accessibilityLabel="Email" style={field}
          textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" onSubmitEditing={send} />
      ) : (
        <TextField value={code} onChangeText={setCode} placeholder="Mã 6 số" accessibilityLabel="Mã 6 số" style={field}
          textContentType="oneTimeCode" keyboardType="number-pad" maxLength={6} onSubmitEditing={verify} />
      )}
      <ErrorText message={error} />
      <ActionButton title={step === 'email' ? 'Gửi mã' : 'Xác nhận'} loading={busy}
        disabled={step === 'email' ? !email.includes('@') : code.length !== 6} onPress={step === 'email' ? send : verify} />
    </Sheet>
  );
}
