import Button from './Button.tsx'

type AppHeaderProps = {
  onLogout: () => void
}

export default function AppHeader({ onLogout }: AppHeaderProps) {
  return (
    <header className="app-header">
      <p className="brand">3D Platform</p>

      <Button type="button" variant="ghost" onClick={onLogout}>
        Logi välja
      </Button>
    </header>
  )
}