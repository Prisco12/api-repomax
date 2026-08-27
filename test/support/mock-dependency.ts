type DependencyShape<T> = Partial<Record<keyof T, unknown>>;

export function mockDependency<T>(value: DependencyShape<T>): T {
  return value as T;
}
