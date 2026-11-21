import LoginScreen from '../components/auth/LoginScreen';
import HelpContent from '../dialog/index.md';

export default function LoginPage() {
  return <LoginScreen helpContent={<HelpContent />} />;
}
