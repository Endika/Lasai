// jest-dom 7.0.1 augments vitest's `Assertion<T>`, but since vitest 5 that
// interface takes two type parameters, so its augmentation never merges.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<R, T> extends TestingLibraryMatchers<T, R> {}
}
