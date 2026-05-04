import type { ICandidateRepository } from '../../domain/candidate/ICandidateRepository.js';
import type {
  Candidate, CreateCandidateInput, UpdateCandidateInput,
} from '../../domain/candidate/Candidate.js';
import { NotFoundError, ConflictError, DomainError } from '../../domain/shared/DomainError.js';

export class GetCandidatesUseCase {
  constructor(private readonly candidates: ICandidateRepository) {}
  async execute(): Promise<Candidate[]> { return this.candidates.findAll(); }
}

export class GetCandidateByIdUseCase {
  constructor(private readonly candidates: ICandidateRepository) {}
  async execute(id: string): Promise<Candidate> {
    const c = await this.candidates.findById(id);
    if (!c) throw new NotFoundError('Candidato');
    return c;
  }
}

export class CreateCandidateUseCase {
  constructor(private readonly candidates: ICandidateRepository) {}
  async execute(input: CreateCandidateInput): Promise<Candidate> {
    if (!input.name?.trim()) throw new DomainError('El nombre es requerido.');
    try {
      return await this.candidates.create(input);
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23505') throw new ConflictError('Ya existe un candidato con ese email.');
      throw err;
    }
  }
}

export class UpdateCandidateUseCase {
  constructor(private readonly candidates: ICandidateRepository) {}
  async execute(id: string, input: UpdateCandidateInput): Promise<Candidate> {
    try {
      const updated = await this.candidates.update(id, input);
      if (!updated) throw new NotFoundError('Candidato');
      return updated;
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23505') throw new ConflictError('Email ya en uso.');
      throw err;
    }
  }
}

export class DeleteCandidateUseCase {
  constructor(private readonly candidates: ICandidateRepository) {}
  async execute(id: string): Promise<void> {
    const ok = await this.candidates.delete(id);
    if (!ok) throw new NotFoundError('Candidato');
  }
}
