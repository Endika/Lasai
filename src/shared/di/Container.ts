type Factory<T> = () => T

export class Container {
  private factories = new Map<string, Factory<unknown>>()
  private singletons = new Map<string, unknown>()

  register<T>(key: string, factory: Factory<T>): void {
    this.factories.set(key, factory)
  }

  resolve<T>(key: string): T {
    if (this.singletons.has(key)) return this.singletons.get(key) as T
    const factory = this.factories.get(key)
    if (!factory) throw new Error(`Container: "${key}" is not registered`)
    const instance = factory() as T
    this.singletons.set(key, instance)
    return instance
  }
}
