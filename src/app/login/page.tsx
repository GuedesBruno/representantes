import { Suspense } from 'react';
import LoginPage from './LoginPage';

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
