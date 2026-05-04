import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DatabaseError) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Recurso duplicado.' });
      return;
    }
    if (err.code === '23503') {
      res.status(409).json({ error: 'Referencia inválida o recurso con dependencias.' });
      return;
    }
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
