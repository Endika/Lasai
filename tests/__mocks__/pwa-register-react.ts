// Stub for virtual:pwa-register/react in test environments.
// useRegisterSW is a no-op; banners that depend on SW updates are silent in jsdom.
export function useRegisterSW(_options?: {
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (swUrl: string, reg: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}) {
  return {
    needRefresh: [false, (_v: boolean) => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, (_v: boolean) => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: (_reloadPage?: boolean) => Promise.resolve(),
  }
}
