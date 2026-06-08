import type { IEntryRepository } from '@/domain/repositories/IEntryRepository'

/** Erasure action: wipes every locally stored entry. */
export class DeleteAllDataHandler {
  constructor(private readonly repo: IEntryRepository) {}

  async execute(): Promise<void> {
    await this.repo.deleteAll()
  }
}
