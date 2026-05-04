import type { Candidate, CreateCandidateInput, UpdateCandidateInput } from './Candidate.js';

export interface ICandidateRepository {
  findAll(): Promise<Candidate[]>;
  findById(id: string): Promise<Candidate | null>;
  create(input: CreateCandidateInput): Promise<Candidate>;
  update(id: string, input: UpdateCandidateInput): Promise<Candidate | null>;
  delete(id: string): Promise<boolean>;
}
