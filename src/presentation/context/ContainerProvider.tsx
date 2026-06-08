import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { buildContainer } from '@/shared/di/wiring'
import type { Container } from '@/shared/di/Container'

const Ctx = createContext<Container | null>(null)

export function ContainerProvider({
  children,
  container,
}: {
  children: ReactNode
  container?: Container
}) {
  const value = useMemo(() => container ?? buildContainer(), [container])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useContainer(): Container {
  const c = useContext(Ctx)
  if (!c) throw new Error('useContainer must be used within ContainerProvider')
  return c
}
