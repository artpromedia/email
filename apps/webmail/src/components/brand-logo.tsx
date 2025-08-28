import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme-provider'

export function BrandLogo() {
  const { resolvedTheme } = useTheme()
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Reset error state when theme changes
    setHasError(false)
    
    // Use logo-light.svg in dark theme, logo-dark.svg in light theme
    const logoVariant = resolvedTheme === 'dark' ? 'light' : 'dark'
    const logoPath = `/brand/ceerion/logo-${logoVariant}.svg`
    
    // Test if the logo exists
    const img = new Image()
    img.onload = () => {
      setLogoSrc(logoPath)
    }
    img.onerror = () => {
      setHasError(true)
      setLogoSrc(null)
    }
    img.src = logoPath
  }, [resolvedTheme])

  return (
    <div className="flex items-center gap-3">
      {logoSrc && !hasError ? (
        <img
          src={logoSrc}
          alt="CEERION"
          className="h-8 w-auto"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="text-xl font-bold tracking-tight">CEERION</span>
      )}
      <span className="text-sm text-muted-foreground hidden sm:block">
        mail.ceerion.com
      </span>
    </div>
  )
}
