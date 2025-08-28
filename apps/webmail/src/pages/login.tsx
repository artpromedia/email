import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
  const { login, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [showMfa, setShowMfa] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password, rememberMe, mfaCode || undefined)
    } catch (error: any) {
      // Check if MFA is required
      if (error?.response?.status === 400 && error?.response?.data?.code === 'MFA_REQUIRED') {
        setShowMfa(true)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-primary rounded-full">
            <Mail className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">CEERION Mail</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
                disabled={isLoading}
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-12"
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            {showMfa && (
              <div>
                <label htmlFor="mfaCode" className="sr-only">
                  MFA Code
                </label>
                <Input
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  placeholder="Enter MFA code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="h-12"
                  disabled={isLoading}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                  disabled={isLoading}
                />
                <label htmlFor="remember-me" className="text-sm">
                  Remember me
                </label>
              </div>

              <Button variant="link" className="px-0 text-sm">
                Forgot password?
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Signing in...
              </div>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Sign in
              </>
            )}
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Secure enterprise email powered by CEERION
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
